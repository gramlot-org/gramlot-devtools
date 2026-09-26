// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Step 1 feasibility: PoC runtime + inspector (recipe inspector.tytx) in an
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
    await page.waitForFunction(() => window.feasibility && (window.feasibility.mounted || window.feasibility.errors.length));
    const outcome = await page.evaluate(async () => {
        const f = window.feasibility;
        const labels = kind => [...document.querySelector(`[data-inspector="${kind}"]`).shadowRoot.querySelectorAll('summary, li')]
            .map(el => el.firstChild?.textContent?.trim() || el.textContent.trim());
        const tool = f.tool;
        tool.app.live(() => tool.app.builder.data.setItem('dataPath', 'customer.name'));
        await new Promise(r => setTimeout(r, 50));
        const input = document.querySelector('[data-inspector="data-editor"] [data-field="rows"]').shadowRoot
            .querySelector('[data-property="value"] [data-cell="value"]');
        input.focus();
        input.value = 'Grace';
        input.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
        input.blur();
        f.bags.data.setItem('customer.city', 'Rome');
        await new Promise(r => setTimeout(r, 50));
        return {mounted: f.mounted, errors: f.errors, violations: f.violations, data: labels('data'), source: labels('source'),
            edited: f.bags.data.getItem('customer.name'), live: labels('data').includes('city')};
    });
    console.log(JSON.stringify(outcome));
    assert.equal(outcome.mounted, true);
    assert.deepEqual(outcome.errors, []);
    assert.deepEqual(outcome.violations, []);
    assert.deepEqual(console_, []);
    assert.equal(outcome.edited, 'Grace');
    assert.equal(outcome.live, true);
    console.log('PASS  feasibility: inspector mounted, edited and updated live with no eval and no console errors');
} finally {
    await context.close();
}
