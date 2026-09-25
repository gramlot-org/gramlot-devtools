// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Headless check of the panel inside real DevTools.
 * Run after `node build.mjs`: `node tests/devtools.mjs`.
 *
 * Chromium is started with --auto-open-devtools-for-tabs and a remote
 * debugging port. The Gramlot panel is selected through the DevTools
 * frontend (InspectorView.showPanel), then the panel iframe is driven over
 * the Chrome DevTools Protocol. This covers chrome.devtools.panels.create and
 * chrome.devtools.inspectedWindow.eval, which tests/e2e.mjs cannot reach.
 * The DevTools frontend module path is internal to Chromium and may change.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, '..');
const EXT = join(TOOL, 'dist');
const PAGES = join(TOOL, 'test-page');
const PLAYWRIGHT = process.env.PLAYWRIGHT || '/Users/gporcari/Sviluppo/gramlot/gramlot-rosetta/node_modules/playwright/index.mjs';
const {chromium} = await import(PLAYWRIGHT);
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9335);

const TYPES = {'.html': 'text/html', '.js': 'text/javascript'};
const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
    try {
        const body = await readFile(join(PAGES, path || 'index.html'));
        res.writeHead(200, {'content-type': TYPES[extname(path)] || 'application/octet-stream'});
        res.end(body);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const targets = async () => (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
async function waitTarget(match, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const found = (await targets()).find(match);
        if (found) return found;
        await sleep(200);
    }
    throw new Error('target not found');
}
async function session(url, onEvent = () => {}) {
    const ws = new WebSocket(url);
    const pending = new Map();
    let next = 0;
    ws.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        else if (msg.method) onEvent(msg);
    };
    await new Promise(resolve => { ws.onopen = resolve; });
    const send = (method, params = {}) => new Promise(resolve => {
        next += 1;
        pending.set(next, resolve);
        ws.send(JSON.stringify({id: next, method, params}));
    });
    const evaluate = async expression => {
        const reply = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
        if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description || 'evaluate failed');
        return reply.result.result.value;
    };
    const until = async (expression, timeout = 10000) => {
        const end = Date.now() + timeout;
        let last = null;
        while (Date.now() < end) {
            // The DevTools frontend rejects module access until it has started.
            try { if (await evaluate(expression)) return; } catch (error) { last = error; }
            await sleep(200);
        }
        throw new Error(`timeout: ${expression}${last ? ` (${last.message})` : ''}`);
    };
    return {send, evaluate, until, close: () => ws.close()};
}

const results = [];
const check = async (name, fn) => {
    try { await fn(); results.push(['PASS', name]); }
    catch (error) { results.push(['FAIL', name, error.message.split('\n')[0]]); }
};
const errors = [];
const expectedErrors = [];

const context = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
        '--auto-open-devtools-for-tabs', `--remote-debugging-port=${DEBUG_PORT}`],
});
let panel = null;
try {
    const page = context.pages()[0] || await context.newPage();
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) errors.push(`[page] ${msg.type()}: ${msg.text()}`); });
    page.on('pageerror', error => errors.push(`[page] pageerror: ${error.message}`));
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => window.gramlot?.state === 'started');

    const frontendTarget = await waitTarget(t => t.url.startsWith('devtools://'));
    const frontend = await session(frontendTarget.webSocketDebuggerUrl);
    await check('criterion 1: a "Gramlot" panel is registered in DevTools and can be shown', async () => {
        await frontend.until(`import('./ui/legacy/legacy.js').then(UI => UI.InspectorView.InspectorView.instance()
            .tabbedPane.tabIds().some(id => id.startsWith('chrome-extension://') && id.endsWith('Gramlot')))`);
        const title = await frontend.evaluate(`import('./ui/legacy/legacy.js').then(async UI => {
            const view = UI.InspectorView.InspectorView.instance();
            const id = view.tabbedPane.tabIds().find(id => id.startsWith('chrome-extension://') && id.endsWith('Gramlot'));
            await view.showPanel(id);
            return view.tabbedPane.tabTitle ? view.tabbedPane.tabTitle(id) : id;
        })`);
        assert.match(title, /Gramlot/);
    });
    const panelTarget = await waitTarget(t => t.url.includes('/panel.html'));
    panel = await session(panelTarget.webSocketDebuggerUrl, event => {
        if (event.method === 'Runtime.exceptionThrown') errors.push(`[panel] exception: ${event.params.exceptionDetails.exception?.description}`);
        if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)) {
            errors.push(`[panel] ${event.params.type}: ${event.params.args.map(a => a.value ?? a.description).join(' ')}`);
        }
        if (event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level)) {
            errors.push(`[panel] log ${event.params.entry.level}: ${event.params.entry.text}`);
        }
    });
    await panel.send('Runtime.enable');
    await panel.send('Log.enable');
    const snapshotsDone = `globalThis.gramlotDevtools?.instanceId && gramlotDevtools.log.filter(t => t === 'snapshot').length >= 2`;
    const same = async () => {
        const pageWire = await page.evaluate(() => ({data: gramlot.data.toTytx('json'), source: gramlot.source.toTytx('json')}));
        const copyWire = await panel.evaluate(`({data: gramlotDevtools.tool.scopes.data.bag.toTytx('json'),
            source: gramlotDevtools.tool.scopes.source.bag.toTytx('json')})`);
        assert.equal(copyWire.data, pageWire.data);
        assert.equal(copyWire.source, pageWire.source);
    };
    await check('criterion 2: in DevTools the copies equal the page Bags', async () => {
        await panel.until(snapshotsDone);
        await same();
    });
    await check('criterion 3: page console write appears in the DevTools panel', async () => {
        await page.evaluate(() => gramlot.data.setItem('a.b', 1));
        await panel.until(`gramlotDevtools.tool.scopes.data.bag.getItem('a.b') === 1`, 3000);
    });
    const evaluate = mode => panel.evaluate(`gramlotDevtools.evaluate('gramlot.data.getItem("customer.name") + " " + (6 * 7)', '${mode}').then(r => r.shown)`);
    await check('criterion 7: evaluate through the agent', async () => {
        assert.deepEqual(await evaluate('agent'), {text: '"Ada 42" (string)', error: false});
    });
    await check('criterion 7: evaluate through inspectedWindow.eval', async () => {
        assert.deepEqual(await evaluate('inspectedWindow'), {text: '"Ada 42" (string)', error: false});
    });
    await check('criterion 6: page reload reconnects the DevTools panel', async () => {
        const hellos = await panel.evaluate(`gramlotDevtools.log.filter(t => t === 'hello').length`);
        await page.reload();
        await page.waitForFunction(() => window.gramlot?.state === 'started');
        await panel.until(`gramlotDevtools.log.filter(t => t === 'hello').length > ${hellos} && (${snapshotsDone})
            && gramlotDevtools.tool.scopes.data.bag.getItem('a') === null`);
        await same();
    });
    await check('strict page CSP: agent mode fails, inspectedWindow.eval works', async () => {
        await page.goto(`${ORIGIN}/csp.html`);
        await page.waitForFunction(() => window.gramlot?.state === 'started');
        await panel.until(`document.getElementById('status').dataset.state === 'connected' && (${snapshotsDone})`);
        const agent = await evaluate('agent');
        assert.equal(agent.error, true);
        assert.match(agent.text, /EvalError/);
        expectedErrors.push(...errors.splice(0).filter(line => line.includes('unsafe-eval')));
        assert.deepEqual(await evaluate('inspectedWindow'), {text: '"Ada 42" (string)', error: false});
    });
    await check('iframes: inspectedWindow.eval runs in the inspected frame', async () => {
        await page.goto(`${ORIGIN}/frames.html`);
        await panel.until(`document.getElementById('frame').options.length === 2 && (${snapshotsDone})`);
        await panel.evaluate(`(() => {
            const select = document.getElementById('frame');
            select.value = [...select.options].find(o => o.title.includes('frame=second')).value;
            select.dispatchEvent(new Event('change'));
        })()`);
        await panel.until(`gramlotDevtools.frames.get(gramlotDevtools.frameId)?.url.includes('frame=second') && (${snapshotsDone})`);
        const shown = await panel.evaluate(`gramlotDevtools.evaluate('location.search', 'inspectedWindow').then(r => r.shown)`);
        assert.deepEqual(shown, {text: '"?frame=second" (string)', error: false});
    });
    await check('criterion 8: no console errors in page or panel (except the expected CSP refusal)', async () => {
        assert.deepEqual(errors, []);
    });
    await check('closing DevTools removes the agent and its subscriptions from the page', async () => {
        await page.goto(`${ORIGIN}/index.html`);
        await page.waitForFunction(() => window.gramlot?.state === 'started');
        await panel.until(`document.getElementById('status').dataset.state === 'connected' && (${snapshotsDone})`);
        assert.equal(await page.evaluate(() => Boolean(window[Symbol.for('gramlot-devtools.agent')])), true);
        const {webSocketDebuggerUrl} = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
        const browser = await session(webSocketDebuggerUrl);
        const devtools = (await targets()).find(t => t.url.startsWith('devtools://'));
        await browser.send('Target.closeTarget', {targetId: devtools.id});
        browser.close();
        await page.waitForFunction(() => !window[Symbol.for('gramlot-devtools.agent')], null, {timeout: 5000});
        const left = await page.evaluate(() => [gramlot.data, gramlot.source].flatMap(bag =>
            [bag._updSubscribers, bag._insSubscribers, bag._delSubscribers].flatMap(Object.keys)).filter(id => id === 'gramlot-devtools'));
        assert.deepEqual(left, []);
    });
    frontend.close();
} catch (error) {
    results.push(['FAIL', 'run aborted', error.message]);
} finally {
    panel?.close();
    await context.close();
    server.close();
}
for (const [status, name, detail] of results) console.log(`${status}  ${name}${detail ? `\n      ${detail}` : ''}`);
if (expectedErrors.length) console.log(`expected console lines: ${expectedErrors.length} (page CSP refusing eval)`);
process.exitCode = results.some(([status]) => status === 'FAIL') ? 1 : 0;
