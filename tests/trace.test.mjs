import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrace, observeFetch, redact, snapshot } from '../extension/trace.js';

const location = { href: 'http://localhost:8000/', origin: 'http://localhost:8000' };
const path = '/api/backends/chat-completions/generate';
const body = { messages: [{ role: 'user', content: '**原文** <xml>内容</xml>' }], max_tokens: 100 };

test('preserves request arguments, returned promise, response identity and stream', async () => {
    const response = new Response('data: test\n\n', { headers: { 'content-type': 'text/event-stream' } });
    const promise = Promise.resolve(response);
    let seen;
    const host = { location, fetch(...args) { seen = { owner: this, args }; return promise; } };
    const records = [];
    const restore = observeFetch(host, x => records.push(x));
    const options = { method: 'POST', body: JSON.stringify(body), signal: new AbortController().signal };
    assert.equal(host.fetch(path, options), promise);
    assert.equal(seen.owner, host);
    assert.equal(seen.args[1], options);
    assert.equal(await promise, response);
    assert.equal(response.bodyUsed, false);
    assert.equal(records[0].status, 200);
    assert.deepEqual(records[0].body, body);
    assert.equal(await response.text(), 'data: test\n\n');
    restore();
});

test('preserves rejection and does not add an unhandled rejection on abort', async () => {
    const error = new DOMException('Cancelled', 'AbortError');
    const host = { location, fetch: () => Promise.reject(error) };
    const records = [];
    const restore = observeFetch(host, x => records.push(x));
    await assert.rejects(host.fetch(path, { method: 'POST', body: '{}' }), x => x === error);
    assert.equal(records[0].status, 'aborted');
    restore();
});

test('limits observation to same-origin, selected POST endpoints', async () => {
    const host = { location, fetch: () => Promise.resolve(new Response()) };
    const records = [];
    const restore = observeFetch(host, x => records.push(x));
    for (const [url, method] of [['/api/settings/save', 'POST'], [path, 'GET'], ['https://other.example' + path, 'POST']]) {
        await host.fetch(url, { method, body: '{}' });
    }
    assert.equal(records.length, 0);
    await host.fetch(new Request(location.origin + path, { method: 'POST', body: '{}' }));
    assert.equal(records[0].body.reason, 'unsupported-or-large-body');
    restore();
});

test('redacts credentials but keeps model parameters, text and XML intact', () => {
    assert.deepEqual(redact({ ...body, api_key: 'secret', nested: { Authorization: 'Bearer secret' },
        custom_include_headers: 'X-Token: secret', custom_url: 'https://user:secret@example.test/v1',
        image_url: { url: 'https://user:secret@example.test/v1?api_key=secret&size=2' } }), {
        ...body, api_key: '[redacted]', nested: { Authorization: '[redacted]' },
        custom_include_headers: '[redacted]', custom_url: '[redacted]',
        image_url: { url: 'https://redacted:redacted@example.test/v1?api_key=%5Bredacted%5D&size=2' },
    });
    assert.equal(snapshot({ text: 'x'.repeat(150_000) }).truncated, true);
});

const proxied = {
    messages: [{ role: 'user', content: '代理是 https://alice:hunter2@proxy.example/v1 吗？' }],
    max_tokens: 300, max_completion_tokens: 300,
    reverse_proxy: 'https://alice:hunter2@proxy.example/v1', proxy_password: 'proxy-pass-1',
    custom_url: 'https://bob:custom-pass@custom.example/v1',
    custom_include_headers: 'Authorization: Bearer sk-header-1', custom_include_body: 'api_key: sk-body-1',
    custom_exclude_body: 'internal-secret-1',
};
const textCompletion = { prompt: '原文', max_new_tokens: 200, api_server: 'http://carol:tc-pass@127.0.0.1:5000/v1' };
const leaked = /hunter2|proxy-pass-1|custom-pass|sk-header-1|sk-body-1|internal-secret-1|tc-pass|alice|bob|carol/;

test('proxy passwords, custom headers and URL user info stay out of records and exports', async () => {
    const listeners = new Map();
    const context = {
        eventTypes: Object.fromEntries(['GENERATION_STARTED', 'WORLD_INFO_ACTIVATED', 'CHAT_COMPLETION_SETTINGS_READY',
            'GENERATE_AFTER_DATA', 'GENERATION_ENDED'].map(x => [x, x])),
        eventSource: {
            on(event, fn) { (listeners.get(event) ?? listeners.set(event, []).get(event)).push(fn); },
            removeListener(event, fn) { listeners.set(event, listeners.get(event).filter(x => x !== fn)); },
        },
    };
    const emit = (name, ...args) => listeners.get(name)?.forEach(fn => fn(...args));
    const host = { location, fetch: () => Promise.resolve(new Response()) };
    const trace = createTrace(context, host);
    emit('GENERATION_STARTED', 'normal', {}, false);
    emit('WORLD_INFO_ACTIVATED', [{ uid: 1, key: ['灯塔'], keysecondary: [], content: '海边的灯塔。' }]);
    emit('CHAT_COMPLETION_SETTINGS_READY', structuredClone(proxied));
    await host.fetch(path, { method: 'POST', body: JSON.stringify(proxied) });
    emit('GENERATION_ENDED');
    emit('GENERATION_STARTED', 'normal', {}, false);
    emit('GENERATE_AFTER_DATA', structuredClone(textCompletion), false);
    await host.fetch('/api/backends/text-completions/generate', { method: 'POST', body: JSON.stringify(textCompletion) });
    const [chat, text] = trace.records;
    for (const record of trace.records) assert.doesNotMatch(JSON.stringify(record, null, 2), leaked);
    for (const recorded of [chat.body, chat.assembled]) {
        assert.equal(recorded.max_tokens, 300);
        assert.equal(recorded.max_completion_tokens, 300);
        for (const key of ['reverse_proxy', 'proxy_password', 'custom_url', 'custom_include_headers', 'custom_include_body',
            'custom_exclude_body']) assert.equal(recorded[key], '[redacted]', key);
        assert.equal(recorded.messages[0].content, '代理是 https://redacted:redacted@proxy.example/v1 吗？');
    }
    assert.deepEqual(chat.worldInfo[0].key, ['灯塔']);
    for (const recorded of [text.body, text.assembled]) {
        assert.equal(recorded.api_server, 'http://redacted:redacted@127.0.0.1:5000/v1');
        assert.equal(recorded.max_new_tokens, 200);
        assert.equal(recorded.prompt, '原文');
    }
    trace.destroy();
});

test('restore does not overwrite a later plugin wrapper and disables a retained observer', async () => {
    const original = () => Promise.resolve(new Response());
    const host = { location, fetch: original };
    let count = 0;
    const restore = observeFetch(host, () => count++);
    const observed = host.fetch;
    const outer = (...args) => observed(...args);
    host.fetch = outer;
    restore();
    assert.equal(host.fetch, outer);
    await host.fetch(path, { method: 'POST', body: '{}' });
    assert.equal(count, 0);
});

test('observation failure never prevents the original request', async () => {
    let called = false;
    const host = { location, fetch: () => { called = true; return Promise.resolve(new Response()); } };
    const restore = observeFetch(host, () => { throw new Error('observer failed'); });
    await host.fetch(path, { method: 'POST', body: '{}' });
    assert.equal(called, true);
    restore();
});

test('trace snapshots events, bounds history, clears stale world info and cleans listeners', async () => {
    const listeners = new Map();
    const context = {
        eventTypes: Object.fromEntries(['GENERATION_STARTED', 'WORLD_INFO_ACTIVATED', 'CHAT_COMPLETION_SETTINGS_READY',
            'GENERATE_AFTER_DATA', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_COMPLETION_PROMPT_READY'].map(x => [x, x])),
        eventSource: {
            on(event, fn) { (listeners.get(event) ?? listeners.set(event, []).get(event)).push(fn); },
            removeListener(event, fn) { listeners.set(event, listeners.get(event).filter(x => x !== fn)); },
        },
    };
    const emit = (name, ...args) => listeners.get(name)?.forEach(fn => fn(...args));
    const original = () => Promise.resolve(new Response());
    const host = { location, fetch: original };
    const composition = { counts: { main: 20, chatHistory: 80 }, total: 100, limit: 4096 };
    const trace = createTrace(context, host, () => composition);
    const entry = { uid: 3, content: '命中内容' };
    emit('GENERATION_STARTED', 'normal', {}, false);
    emit('WORLD_INFO_ACTIVATED', [entry]);
    emit('CHAT_COMPLETION_PROMPT_READY', { dryRun: false });
    composition.counts.main = 999;
    emit('CHAT_COMPLETION_PROMPT_READY', { dryRun: true });
    emit('CHAT_COMPLETION_SETTINGS_READY', body);
    await host.fetch(path, { method: 'POST', body: JSON.stringify(body) });
    assert.equal(trace.records[0].composition.counts.main, 20);
    assert.equal(trace.records[0].composition.total, 100);
    assert.ok(trace.records[0].timestamp > 0);
    entry.content = '后来修改';
    assert.equal(trace.records[0].worldInfo[0].content, '命中内容');
    emit('GENERATION_ENDED');
    for (let i = 0; i < 30; i++) await host.fetch(path, { method: 'POST', body: '{}' });
    assert.equal(trace.records.length, 20);
    assert.equal(trace.records.at(-1).worldInfoEvidence, 'not-observed');
    assert.equal(trace.records.at(-1).composition, null);
    trace.clear();
    assert.equal(trace.records.length, 0);
    trace.destroy();
    assert.equal(host.fetch, original);
    assert.equal([...listeners.values()].flat().length, 0);
});
