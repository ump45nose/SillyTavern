import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { extractVersion, versionProblem } from '../perf-extension/lib/version.js';
import { GZIP_MIN_BYTES, isLoopbackHost, shouldGzip } from '../perf-extension/lib/gzip.js';

test('version guard accepts only the verified 1.19.x line', () => {
    assert.equal(extractVersion("SillyTavern 1.19.0 'release' (abc123)"), '1.19.0');
    assert.equal(versionProblem("SillyTavern 1.19.0 'release' (abc123)"), null);
    assert.equal(versionProblem('SillyTavern 1.19.4'), null);
    assert.match(versionProblem('SillyTavern 1.18.2'), /不在已验证范围/);
    assert.match(versionProblem('SillyTavern 1.20.0'), /不在已验证范围/);
    // displayVersion is just "SillyTavern" until getClientVersion() resolves.
    assert.match(versionProblem('SillyTavern'), /无法识别/);
});

const request = patch => ({
    pathname: '/api/settings/save',
    hostname: '192.168.31.201',
    method: 'POST',
    contentEncoding: null,
    bodyBytes: GZIP_MIN_BYTES,
    ...patch,
});

test('gzip applies to large JSON saves on the LAN, including the production host', () => {
    assert.equal(shouldGzip(request()), true);
    assert.equal(shouldGzip(request({ pathname: '/api/chats/save', hostname: 'tavern.example.com' })), true);
});

test('gzip skips small bodies, other endpoints, reads, loopback and already-encoded requests', () => {
    assert.equal(shouldGzip(request({ bodyBytes: GZIP_MIN_BYTES - 1 })), false);
    assert.equal(shouldGzip(request({ pathname: '/api/settings/get' })), false);
    assert.equal(shouldGzip(request({ pathname: '/api/characters/edit-avatar' })), false);
    assert.equal(shouldGzip(request({ method: 'GET' })), false);
    assert.equal(shouldGzip(request({ hostname: '127.0.0.1' })), false);
    // ST-BaiBai-Tools compresses chat saves itself; a second pass must not happen.
    assert.equal(shouldGzip(request({ pathname: '/api/chats/save', contentEncoding: 'gzip' })), false);
});

test('loopback detection', () => {
    for (const host of ['localhost', 'app.localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) assert.equal(isLoopbackHost(host), true, host);
    for (const host of ['192.168.31.201', '10.0.0.2', 'example.com']) assert.equal(isLoopbackHost(host), false, host);
});

/** regex-refresh.js with its absolute engine import served from globalThis.fakeRegexEngine. */
async function loadRegexRefresh() {
    const fakeEngine = {
        name: 'fake-regex-engine',
        setup(b) {
            b.onResolve({ filter: /^\/scripts\/extensions\/regex\/engine\.js$/ }, () => ({ path: 'engine', namespace: 'fake' }));
            b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'module.exports = globalThis.fakeRegexEngine;', loader: 'js' }));
        },
    };
    const result = await build({ entryPoints: ['perf-extension/modules/regex-refresh.js'], bundle: true, format: 'esm', platform: 'node', write: false, plugins: [fakeEngine] });
    const file = (await mkdtemp(tmpdir() + '/wb-perf-tests-')) + '/regex-refresh.mjs';
    await writeFile(file, result.outputFiles[0].text);
    return (await import(file)).default;
}

// Enough of <template> for the probe: a selector matches when each of its class and id tokens sits on some tag.
function fakeTemplate() {
    let present = new Set();
    return {
        set innerHTML(html) {
            present = new Set([...html.matchAll(/(class|id)="([^"]*)"/g)].flatMap(([, kind, value]) => value.split(/\s+/).map(v => (kind === 'id' ? '#' : '.') + v)));
        },
        content: { querySelector: selector => (selector.match(/[.#][\w-]+/g).every(token => present.has(token)) ? {} : null) },
    };
}

/** An element that understands the single-class/id selector lists the module uses. */
function element({ id = '', classes = [], parent = null }) {
    const el = { id, children: [], checked: false, classList: { contains: c => classes.includes(c) } };
    el.matches = selectors => selectors.split(',').some(s => ((s = s.trim())[0] === '#' ? s.slice(1) === id : classes.includes(s.slice(1))));
    el.closest = selectors => (el.matches(selectors) ? el : parent ? parent.closest(selectors) : null);
    el.querySelector = selector => el.children.find(child => child.matches(selector)) ?? null;
    parent?.children.push(el);
    return el;
}

const REGEX_TEMPLATES = {
    dropdown: '<div class="regex_settings"><div class="inline-drawer-content"><div id="bulk_enable_regex"></div><div id="bulk_disable_regex"></div><div id="saved_regex_scripts"></div><input id="regex_preset_toggle"><div id="saved_preset_scripts"></div><input id="regex_scoped_toggle"><div id="saved_scoped_scripts"></div></div></div>',
    scriptTemplate: '<div class="regex-script-label"><input class="regex_bulk_checkbox"><input class="disable_regex"><span class="regex-toggle-on"></span><span class="regex-toggle-off"></span></div>',
};

test('regex refresh probes its DOM hooks in the templates and leaves rows without a checkbox to the native handler', async () => {
    const scripts = [{ id: 'a', disabled: false }, { id: 'b', disabled: false }], saves = [], handlers = {}, html = { ...REGEX_TEMPLATES };
    let rows = [];
    const noop = () => {};
    globalThis.fakeRegexEngine = {
        SCRIPT_TYPES: { GLOBAL: 0, SCOPED: 1, PRESET: 2 },
        getScriptsByType: type => (type === 0 ? scripts : []),
        saveScriptsByType: async (list, type) => saves.push(type),
        ...Object.fromEntries(['allowScopedScripts', 'disallowScopedScripts', 'allowPresetScripts', 'disallowPresetScripts', 'getCurrentPresetAPI', 'getCurrentPresetName'].map(name => [name, noop])),
    };
    const context = { eventTypes: { CHAT_CHANGED: 'chat_changed' }, eventSource: { on: noop, removeListener: noop }, getCurrentChatId: () => 'chat', reloadCurrentChat: async () => {}, saveSettingsDebounced: noop, renderExtensionTemplateAsync: async (extension, name) => html[name] };
    globalThis.SillyTavern = { getContext: () => context };
    const panel = { getClientRects: () => [{}] };
    globalThis.document = { createElement: fakeTemplate, querySelector: () => panel, querySelectorAll: () => rows, addEventListener: (type, fn) => (handlers[type] = fn), removeEventListener: noop };
    const regexRefresh = await loadRegexRefresh();

    html.scriptTemplate = REGEX_TEMPLATES.scriptTemplate.replace('disable_regex', 'regex_disabled');
    assert.equal(await regexRefresh.probe(), '正则面板缺少 .regex-script-label .disable_regex');
    html.scriptTemplate = REGEX_TEMPLATES.scriptTemplate;
    assert.equal(await regexRefresh.probe(), null);

    const click = target => {
        const event = { target, stopped: false, preventDefault: noop, stopImmediatePropagation: () => (event.stopped = true) };
        handlers.click(event);
        return event.stopped;
    };
    const list = element({ id: 'saved_regex_scripts' });
    const bare = element({ id: 'a', classes: ['regex-script-label'], parent: list });
    const row = element({ id: 'b', classes: ['regex-script-label'], parent: list }), box = element({ classes: ['disable_regex'], parent: row });
    const uninstall = regexRefresh.install();
    try {
        assert.equal(click(element({ classes: ['regex-toggle-on'], parent: bare })), false);
        assert.equal(scripts[0].disabled, false);
        assert.equal(click(element({ classes: ['regex-toggle-on'], parent: row })), true);
        assert.equal(scripts[1].disabled, true);
        assert.equal(box.checked, true);
        assert.deepEqual(saves, [0]);

        for (const label of [bare, row]) element({ classes: ['regex_bulk_checkbox'], parent: label }).checked = true;
        rows = [bare, row];
        // "a" would be disabled but has no checkbox to update, so the whole batch stays native.
        assert.equal(click(element({ id: 'bulk_disable_regex' })), false);
        assert.equal(scripts[0].disabled, false);
        assert.equal(click(element({ id: 'bulk_enable_regex' })), true);
        assert.equal(scripts[1].disabled, false);
        assert.equal(box.checked, false);
        assert.deepEqual(saves, [0, 0]);
    } finally {
        uninstall();
    }
});
