import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
export const credentials = { username: env.WB_USERNAME, password: env.WB_PASSWORD };
export const urls = {
    baseline: `http://${env.WB_BIND_ADDRESS}:32011`,
    validation: `http://${env.WB_BIND_ADDRESS}:32012`,
    mock: 'http://127.0.0.1:32013',
};

export function resetSyntheticChats() {
    // Only the explicitly named synthetic fixture in these isolated data roots.
    // Never accept a caller-supplied path and never touch production volumes.
    for (const name of ['baseline', 'validation']) {
        const user = path.join(root, 'runtime', name, 'data/default-user');
        fs.rmSync(path.join(user, 'chats/WorkbenchFixture'), { recursive: true, force: true });
        const settingsPath = path.join(user, 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        settings.active_character = null;
        settings.active_group = null;
        settings.firstRun = false;
        settings.world_info_settings.world_info.globalSelect = [];
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }
}

export async function launch() {
    const executablePath = process.env.WB_CHROMIUM ?? '/home/yuwk/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
    return chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'] });
}

export async function session(browser, { mobile = false, helper = true, probe = true, timings = true } = {}) {
    const context = await browser.newContext({
        httpCredentials: credentials,
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: mobile, hasTouch: mobile,
    });
    if (!helper || !probe) {
        await context.route('**/api/settings/get', async route => {
            const response = await route.fetch();
            const data = await response.json();
            const settings = JSON.parse(data.settings);
            if (!helper) settings.extension_settings.disabledExtensions.push('third-party/JS-Slash-Runner');
            if (!probe) settings.extension_settings.disabledExtensions.push('third-party/workbench-probe');
            data.settings = JSON.stringify(settings);
            await route.fulfill({ response, json: data });
        });
    }
    if (timings) await context.addInitScript(() => {
        window.baselineMetrics = { navigationStart: performance.timeOrigin };
        const timer = setInterval(() => {
            let context;
            try { context = window.SillyTavern?.getContext?.(); }
            catch { return; } // ES module exports can exist before cyclic imports finish.
            if (!context?.eventSource) return;
            clearInterval(timer);
            window.baselineMetrics.contextAvailableMs = performance.now();
            context.eventSource.on(context.eventTypes.APP_INITIALIZED, () => { window.baselineMetrics.appInitializedMs = performance.now(); });
            context.eventSource.on(context.eventTypes.APP_READY, () => { window.baselineMetrics.appReadyMs = performance.now(); });
        }, 5);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    return { context, page, errors };
}

export async function ready(page, url, { probe = false } = {}) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => Number.isFinite(window.baselineMetrics?.appReadyMs), null, { timeout: 90_000 });
    if (probe) await page.waitForFunction(() => window.workbenchProbe?.mounted, null, { timeout: 10_000 });
}

export async function createCharacter(page) {
    return page.evaluate(async () => {
        const context = SillyTavern.getContext();
        const name = 'WorkbenchFixture';
        let index = context.characters.findIndex(x => x.name === name);
        if (index < 0) {
            const body = new FormData();
            body.set('ch_name', name);
            body.set('description', '仅用于隔离技术验证的角色。');
            body.set('first_mes', '技术验证开始。');
            body.set('creatorcomment', 'Synthetic fixture; no production data.');
            const headers = { ...context.getRequestHeaders() };
            delete headers['Content-Type'];
            const response = await fetch('/api/characters/create', { method: 'POST', headers, body });
            if (!response.ok) throw new Error('Failed to create fixture character: ' + response.status);
            await context.getCharacters();
            index = context.characters.findIndex(x => x.name === name);
        }
        await context.selectCharacterById(index);
        return { name, index };
    });
}

export async function connect(page) {
    await page.evaluate(() => {
        const context = SillyTavern.getContext();
        const settings = context.chatCompletionSettings;
        settings.chat_completion_source = 'custom';
        settings.custom_url = 'http://mock-model:4010/v1';
        settings.custom_model = 'workbench-fixture';
        settings.stream_openai = true;
        document.querySelector('#api_button_openai').click();
    });
    await page.waitForFunction(() => SillyTavern.getContext().onlineStatus !== 'no_connection', null, { timeout: 30_000 });
}

export const save = (name, value) => fs.writeFileSync(path.join(artifacts, name), JSON.stringify(value, null, 2) + '\n');
