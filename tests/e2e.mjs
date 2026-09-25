// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Headless end-to-end check of the unpacked extension in Chromium.
 * Run after `node build.mjs`: `node tests/e2e.mjs`.
 *
 * Playwright is not a dependency of this tool: PLAYWRIGHT points to an
 * existing installation (default: the gramlot-rosetta checkout).
 * DevTools cannot be opened headlessly, so the panel is opened as a tab
 * (panel.html?tabId=N). That exercises agent, content script, background and
 * panel, but not chrome.devtools.* (panel registration, inspectedWindow.eval).
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

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
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

const results = [];
const check = async (name, fn) => {
    try { await fn(); results.push(['PASS', name]); }
    catch (error) { results.push(['FAIL', name, error.message.split('\n')[0]]); }
};
const errors = [];
const watch = (page, label) => {
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) errors.push(`${label} ${msg.type()}: ${msg.text()}`); });
    page.on('pageerror', error => errors.push(`${label} pageerror: ${error.message}`));
};

const context = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
    let [worker] = context.serviceWorkers();
    worker ||= await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;

    const page = await context.newPage();
    watch(page, '[page]');
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => window.gramlot?.state === 'started');
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({url}))[0].id, `${ORIGIN}/index.html`);

    const panel = await context.newPage();
    watch(panel, '[panel]');
    await panel.goto(`chrome-extension://${extensionId}/panel.html?tabId=${tabId}`);
    const connected = () => panel.waitForFunction(() => {
        const s = globalThis.gramlotDevtools;
        return s?.instanceId && ['data', 'source'].every(k => s.log.filter(t => t === 'snapshot').length >= 2);
    }, null, {timeout: 10000});
    const same = async () => {
        const pageWire = await page.evaluate(() => ({data: gramlot.data.toTytx('json'), source: gramlot.source.toTytx('json')}));
        const copyWire = await panel.evaluate(() => {
            const tool = document.querySelector('#inspector');
            return tool && window.gramlotDevtools && {
                data: window.panelScopes.data.bag.toTytx('json'), source: window.panelScopes.source.bag.toTytx('json')};
        });
        return {pageWire, copyWire};
    };
    // Test-only handle on the inspector scopes (no production global for them).
    const exposeScopes = () => panel.evaluate(() => {
        window.panelScopes = window.gramlotDevtools.tool.scopes;
    });

    await check('panel connects and receives hello + two snapshots', async () => {
        await connected();
        await exposeScopes();
    });
    await check('criterion 2: Data and Source copies equal the page Bags (TYTX text identical)', async () => {
        const {pageWire, copyWire} = await same();
        assert.equal(copyWire.data, pageWire.data);
        assert.equal(copyWire.source, pageWire.source);
    });
    await check('criterion 2: trees show nested nodes', async () => {
        const labels = await panel.evaluate(() => {
            const text = kind => [...document.querySelector(`[data-inspector="${kind}"]`).shadowRoot.querySelectorAll('summary, li')]
                .map(el => el.firstChild?.textContent?.trim() || el.textContent.trim());
            return {data: text('data'), source: text('source')};
        });
        for (const label of ['customer', 'name', 'born', 'orders', 'o1', 'total']) assert.ok(labels.data.some(t => t.startsWith(label)), `data ${label}: ${labels.data}`);
        for (const label of ['main', 'div_0', 'h1_0', 'ul_0', 'li_0']) assert.ok(labels.source.some(t => t.startsWith(label)), `source ${label}: ${labels.source}`);
    });
    await check('criterion 2: selecting a node shows value and attributes in the editor', async () => {
        const rows = await panel.evaluate(async () => {
            const tool = window.gramlotDevtools.tool;
            tool.app.live(() => tool.app.builder.data.setItem('dataPath', 'customer.born'));
            await new Promise(r => setTimeout(r, 50));
            const root = document.querySelector('[data-inspector="data-editor"] [data-field="rows"]').shadowRoot;
            return [...root.querySelectorAll('[data-property]')].map(r => [r.dataset.name, r.dataset.type, r.querySelector('[data-cell="value"]').value]);
        });
        assert.deepEqual(rows, [['value', 'date', '1815-12-10'], ['note', 'string', 'birth date']]);
    });
    await check('criterion 3: page console write appears in the panel without reload', async () => {
        await page.evaluate(() => gramlot.data.setItem('a.b', 1));
        await panel.waitForFunction(() => window.panelScopes.data.bag.getItem('a.b') === 1, null, {timeout: 3000});
        const shown = await panel.evaluate(() => [...document.querySelector('[data-inspector="data"]').shadowRoot.querySelectorAll('summary')]
            .some(el => el.textContent.trim().startsWith('a')));
        assert.ok(shown, 'tree shows branch a');
        const {pageWire, copyWire} = await same();
        assert.equal(copyWire.data, pageWire.data);
    });
    await check('delete and attribute-only updates from the page follow in the copy', async () => {
        await page.evaluate(() => { gramlot.data.delItem('a'); gramlot.data.getNode('customer.name').setAttr({hint: 'x'}); });
        await panel.waitForFunction(() => !window.panelScopes.data.bag.getNode('a')
            && window.panelScopes.data.bag.getNode('customer.name').attr.hint === 'x', null, {timeout: 3000});
    });
    // Hidden tab content cannot take focus: select the tab first, as a user does.
    const selectTab = kind => panel.locator('gnr-tabcontainer button.tab', {hasText: kind === 'data' ? 'Data' : 'Source'}).click();
    const editRow = async (kind, path, name, text) => { await selectTab(kind); return panel.evaluate(async ({kind, path, name, text}) => {
        const tool = window.gramlotDevtools.tool;
        tool.app.live(() => tool.app.builder.data.setItem(kind + 'Path', path));
        await new Promise(r => setTimeout(r, 50));
        const root = document.querySelector(`[data-inspector="${kind}-editor"] [data-field="rows"]`).shadowRoot;
        const row = [...root.querySelectorAll('[data-property]')].find(r => r.dataset.name === name);
        if (!row) throw new Error(`no row ${name}`);
        const input = row.querySelector('[data-cell="value"]');
        input.focus();
        input.value = text;
        input.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
        input.blur();
    }, {kind, path, name, text}); };
    await check('criterion 4: editing a Data value in the panel reaches gramlot.data', async () => {
        await editRow('data', 'customer.name', 'value', 'Grace');
        await page.waitForFunction(() => gramlot.data.getItem('customer.name') === 'Grace', null, {timeout: 3000});
        await panel.waitForFunction(() => window.panelScopes.data.bag.getItem('customer.name') === 'Grace', null, {timeout: 3000});
    });
    await check('typed Data edit keeps the type (number value of o1.total)', async () => {
        await editRow('data', 'customer.orders.o1.total', 'value', '99.25');
        await page.waitForFunction(() => gramlot.data.getItem('customer.orders.o1.total') === 99.25, null, {timeout: 3000});
    });
    await check('criterion 5: editing Source attribute class changes the page DOM', async () => {
        await editRow('source', 'main.div_0', 'class', 'y');
        await page.waitForFunction(() => document.getElementById('box')?.className === 'y', null, {timeout: 3000});
    });
    await check('deleteAttribute from the panel removes a Source attribute and the DOM attribute', async () => {
        await selectTab('source');
        await panel.evaluate(async () => {
            const tool = window.gramlotDevtools.tool;
            tool.app.live(() => tool.app.builder.data.setItem('sourcePath', 'main.div_0.p_0'));
            await new Promise(r => setTimeout(r, 50));
            const root = document.querySelector('[data-inspector="source-editor"] [data-field="rows"]').shadowRoot;
            const row = [...root.querySelectorAll('[data-property]')].find(r => r.dataset.name === 'class');
            row.querySelector('[data-cell="remove"]').click();
            row.querySelector('[data-cell="value"]').focus();
            row.querySelector('[data-cell="value"]').blur();
        });
        await page.waitForFunction(() => !gramlot.source.getNode('main.div_0.p_0').attr.class
            && !document.getElementById('note').hasAttribute('class'), null, {timeout: 3000});
    });
    await check('command errors are reported back (setValue on a missing node)', async () => {
        const result = await panel.evaluate(() => window.gramlotDevtools.request('setValue', {
            instanceId: window.gramlotDevtools.instanceId, root: 'data', path: 'missing.node',
            tytxValue: '"{\\"rows\\": []}"'}));
        assert.equal(result.ok, false);
        assert.match(result.error, /No node at data:missing.node/);
    });
    await check('criterion 7 (agent mode): evaluate returns a value computed in the page', async () => {
        const out = await panel.evaluate(() => window.gramlotDevtools.evaluate('gramlot.data.getItem("customer.name") + " / " + (6 * 7)', 'agent'));
        assert.equal(out.result.ok, true, out.result.error);
        assert.equal(out.shown.text, '"Grace / 42" (string)');
        const typed = await panel.evaluate(() => window.gramlotDevtools.evaluate('gramlot.data.getItem("customer.born")', 'agent'));
        assert.equal(typed.shown.text, '1815-12-10T00:00:00.000Z (date)');
    });
    await check('criterion 6: page reload reconnects the panel with a new snapshot', async () => {
        const before = await panel.evaluate(() => window.gramlotDevtools.log.filter(t => t === 'hello').length);
        await page.reload();
        await page.waitForFunction(() => window.gramlot?.state === 'started');
        await panel.waitForFunction(n => window.gramlotDevtools.log.filter(t => t === 'hello').length > n
            && window.gramlotDevtools.instanceId, before, {timeout: 10000});
        await panel.waitForFunction(() => window.panelScopes.data.bag.getItem('customer.name') === 'Ada', null, {timeout: 5000});
        const {pageWire, copyWire} = await same();
        assert.equal(copyWire.data, pageWire.data);
        assert.equal(copyWire.source, pageWire.source);
    });
    await check('service worker stopped by Chrome: the panel reconnects with a new snapshot', async () => {
        const before = await panel.evaluate(() => window.gramlotDevtools.log.filter(t => t === 'hello').length);
        const cdp = await context.newCDPSession(panel);
        await cdp.send('ServiceWorker.enable');
        await cdp.send('ServiceWorker.stopAllWorkers');
        await cdp.detach();
        await panel.waitForFunction(n => window.gramlotDevtools.log.filter(t => t === 'hello').length > n
            && window.gramlotDevtools.instanceId, before, {timeout: 10000});
        await panel.waitForFunction(() => window.panelScopes.source.bag.getNode('main'), null, {timeout: 5000});
        const {pageWire, copyWire} = await same();
        assert.equal(copyWire.data, pageWire.data);
        assert.equal(copyWire.source, pageWire.source);
        await page.evaluate(() => gramlot.data.setItem('afterRestart', 1));
        await panel.waitForFunction(() => window.panelScopes.data.bag.getItem('afterRestart') === 1, null, {timeout: 3000});
        await page.evaluate(() => gramlot.data.delItem('afterRestart'));
    });
    await check('criterion 9: the page loads no PoC runtime (network requests)', async () => {
        const own = requests.filter(url => url.startsWith(ORIGIN)).map(url => new URL(url).pathname);
        assert.deepEqual([...new Set(own)].sort(), ['/index.html', '/page.js', '/vendor/gramlot.js']);
        const scripts = await page.evaluate(() => [...document.scripts].map(s => s.src));
        assert.ok(scripts.every(src => !src.startsWith('chrome-extension:')), scripts.join());
    });
    await check('disposing the Gramlot instance sends bye; the panel shows it', async () => {
        await page.evaluate(() => gramlot.dispose());
        await panel.waitForFunction(() => document.getElementById('message').textContent === 'The Gramlot instance was removed.',
            null, {timeout: 5000});
        assert.equal(await panel.evaluate(() => window.gramlotDevtools.log.includes('bye')), true);
    });
    await check('navigation to a page without Gramlot shows "No Gramlot instance"', async () => {
        await page.goto(`${ORIGIN}/plain.html`);
        await panel.waitForFunction(() => document.getElementById('status').dataset.state === 'none', null, {timeout: 10000});
        const text = await panel.evaluate(() => document.getElementById('message').textContent);
        assert.equal(text, 'No Gramlot instance in this page.');
    });
    await check('iframes: each frame instance is listed, inspected and edited separately', async () => {
        await page.goto(`${ORIGIN}/frames.html`);
        const frameOf = name => page.frames().find(f => f.url().includes(`frame=${name}`));
        for (const name of ['first', 'second']) await frameOf(name).waitForFunction(() => window.gramlot?.state === 'started');
        await frameOf('second').evaluate(() => gramlot.data.setItem('customer.name', 'Second frame'));
        await panel.waitForFunction(() => document.getElementById('frame').options.length === 2
            && !document.getElementById('frame').hidden
            && document.getElementById('status').dataset.state === 'connected', null, {timeout: 10000});
        const options = await panel.evaluate(() => [...document.getElementById('frame').options].map(o => o.textContent));
        assert.ok(options.every(text => /frame=(first|second) · gramlot-1$/.test(text)), options.join(' | '));
        // Pick the second frame from the selector.
        const value = await panel.evaluate(() => [...document.getElementById('frame').options]
            .find(o => o.textContent.includes('frame=second')).value);
        await panel.selectOption('#frame', value);
        await panel.waitForFunction(() => window.panelScopes.data.bag.getItem('customer.name') === 'Second frame', null, {timeout: 5000});
        const second = frameOf('second');
        const pageWire = await second.evaluate(() => ({data: gramlot.data.toTytx('json'), source: gramlot.source.toTytx('json')}));
        const copyWire = await panel.evaluate(() => ({
            data: window.panelScopes.data.bag.toTytx('json'), source: window.panelScopes.source.bag.toTytx('json')}));
        assert.deepEqual(copyWire, pageWire);
        await editRow('data', 'customer.name', 'value', 'Edited in frame');
        await second.waitForFunction(() => gramlot.data.getItem('customer.name') === 'Edited in frame', null, {timeout: 3000});
        assert.equal(await frameOf('first').evaluate(() => gramlot.data.getItem('customer.name')), 'Ada');
        const out = await panel.evaluate(() => window.gramlotDevtools.evaluate('location.search', 'agent'));
        assert.equal(out.shown.text, '"?frame=second" (string)');
        await second.evaluate(() => gramlot.data.setItem('live', 1));
        await panel.waitForFunction(() => window.panelScopes.data.bag.getItem('live') === 1, null, {timeout: 3000});
    });
    await check('strict page CSP: agent-mode evaluate fails with EvalError, reported', async () => {
        await page.goto(`${ORIGIN}/csp.html`);
        await page.waitForFunction(() => window.gramlot?.state === 'started');
        await panel.waitForFunction(() => document.getElementById('status').dataset.state === 'connected', null, {timeout: 10000});
        const out = await panel.evaluate(() => window.gramlotDevtools.evaluate('1 + 2', 'agent'));
        assert.equal(out.result.ok, false);
        assert.match(out.result.error, /EvalError/);
        // The CSP report of this refused evaluation is an expected console error.
        const index = errors.findIndex(line => line.includes('unsafe-eval'));
        if (index >= 0) errors.splice(index, 1);
    });
    await check('closing the panel unsubscribes and removes the agent from the page', async () => {
        await page.goto(`${ORIGIN}/index.html`);
        await page.waitForFunction(() => window.gramlot?.state === 'started');
        await panel.waitForFunction(() => document.getElementById('status').dataset.state === 'connected'
            && window.gramlotDevtools.log.filter(t => t === 'snapshot').length >= 2, null, {timeout: 10000});
        const during = await page.evaluate(() => ({
            agent: Boolean(window[Symbol.for('gramlot-devtools.agent')]),
            data: Object.keys(gramlot.data._updSubscribers).includes('gramlot-devtools'),
        }));
        assert.deepEqual(during, {agent: true, data: true});
        await panel.close();
        await page.waitForFunction(() => !window[Symbol.for('gramlot-devtools.agent')], null, {timeout: 5000});
        const after = await page.evaluate(() => ({
            subscribers: [gramlot.data, gramlot.source].flatMap(bag =>
                [bag._updSubscribers, bag._insSubscribers, bag._delSubscribers].flatMap(Object.keys))
                .filter(id => id === 'gramlot-devtools'),
        }));
        assert.deepEqual(after.subscribers, []);
    });
    await check('criterion 8: no console errors in page or panel during these steps', async () => {
        assert.deepEqual(errors, []);
    });
} finally {
    await context.close();
    server.close();
}
for (const [status, name, detail] of results) console.log(`${status}  ${name}${detail ? `\n      ${detail}` : ''}`);
process.exitCode = results.some(([status]) => status === 'FAIL') ? 1 : 0;
