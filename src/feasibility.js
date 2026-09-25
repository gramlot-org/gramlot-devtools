// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Step 1 feasibility page: the PoC runtime and inspector mounted in an MV3
 * extension page on local test Bags. The extension CSP forbids eval and
 * new Function; any attempt is recorded in `window.feasibility.violations`.
 * Edits are written directly to the local Bags (no inspected page here).
 */
import {Bag} from 'genro-bag-js';
import {fromTytx} from 'genro-tytx';
import {mountPanelInspector} from './inspector/panel-inspector.js';
import recipe from './inspector/inspector.tytx';

const report = {violations: [], errors: [], mounted: false};
window.feasibility = report;
document.addEventListener('securitypolicyviolation', event => {
    report.violations.push({directive: event.violatedDirective, blocked: event.blockedURI, sample: event.sample});
});
window.addEventListener('error', event => report.errors.push(String(event.message)));
window.addEventListener('unhandledrejection', event => report.errors.push(String(event.reason?.message || event.reason)));

try {
    const data = new Bag();
    data.setItem('customer.name', 'Ada');
    data.setItem('customer.born', new Date(Date.UTC(1815, 11, 10)));
    data.setItem('customer.score', 42, {dtype: 'L'});
    const source = new Bag();
    const main = new Bag();
    main.setItem('div_0', 'Hello', {id: 'box', class: 'x'});
    source.setItem('main', main, {tag: 'div'});
    const bags = {data, source};
    const tool = mountPanelInspector(document.getElementById('inspector'), fromTytx(recipe, 'json'), {
        commit(edit) {
            const node = bags[edit.kind].getNode(edit.path);
            if (edit.setAttributes) node.setAttr(edit.setAttributes, true, true, false);
            if (edit.deleteAttributes.length) {
                const next = {...node.attr};
                for (const name of edit.deleteAttributes) delete next[name];
                node.setAttr(next, true, false, false);
            }
            if (edit.value !== undefined) node.setValue(edit.value);
        },
    });
    tool.setBag('data', data);
    tool.setBag('source', source);
    report.mounted = true;
    report.tool = tool;
    report.bags = bags;
} catch (error) {
    report.errors.push(error.stack || String(error));
}
