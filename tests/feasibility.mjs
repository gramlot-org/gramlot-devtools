// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Shared inspector qualification in an
 * MV3 extension page, on local Bags, under the extension CSP (no eval).
 * Run after `node build.mjs`: `node tests/feasibility.mjs`.
 */
import assert from 'node:assert/strict';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
import {chromium} from 'playwright';
const context = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
    let [worker] = context.serviceWorkers();
    worker ||= await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    const console_ = [];
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) console_.push(msg.text()); });
    page.on('pageerror', error => console_.push(error.message));
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/feasibility.html`);
    await page.waitForFunction(() => window.fixture?.connection.state === 'started');
    const tool=page.locator('gramlot-tools-inspector');
    await tool.locator('gramlot-poc-tree[data-root=data] [data-node-path=name]').click();
    await tool.getByLabel('Value',{exact:true}).fill('Grace');
    await tool.getByLabel('Value',{exact:true}).press('Enter');
    await page.waitForFunction(()=>fixture.app.data.getItem('name')==='Grace');
    await page.evaluate(()=>fixture.app.data.setItem('city','Rome'));
    await tool.locator('gramlot-poc-tree[data-root=data] [data-node-path=city]').waitFor();
    assert.equal(await tool.locator('gramlot-poc-palette').count(),0);
    assert.deepEqual(console_,[]);
    console.log('PASS shared inspector in MV3: embedded UI, editing, live updates, no eval');
} finally {
    await context.close();
}
