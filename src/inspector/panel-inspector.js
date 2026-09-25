// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Adapted copy of js/pages/src/inspector.js (gramlot-poc).
// Changes for the DevTools panel:
// - the inspected Bags are panel-side copies, swapped with setBag() when a
//   new snapshot arrives (no data_root/source_root origins);
// - no keyboard shortcuts, no DeveloperTools registry, no toggle button:
//   the panel is always open;
// - edits go through `sink.commit(...)` (see panel-editor.js) instead of
//   writing to the Bag, so the panel can turn them into protocol commands.
import {Application} from 'gramlot-dom';
import {Bag} from 'genro-bag-js';
import {PanelBuilder} from './panel-builder.js';
import {PanelEditor} from './panel-editor.js';

const KINDS = ['data', 'source'];

function describe(scope, path) {
    const node = path ? scope.bag.getNode(path) : null;
    if (!node) return scope.error || 'Select a node';
    const value = node.getValue();
    const seen = new WeakSet();
    return 'Path: ' + path + '\n' + JSON.stringify({
        value: value instanceof Bag ? '[Bag]' : value,
        attributes: node.attr,
    }, (_key, item) => {
        if (item instanceof Bag) return '[Bag]';
        if (typeof item === 'bigint' || typeof item === 'function') return String(item);
        if (item && typeof item === 'object') {
            if (seen.has(item)) return '[Circular reference]';
            seen.add(item);
        }
        return item;
    }, 2);
}

/**
 * Mount the PoC inspector recipe on `host`.
 * @param {Element} host
 * @param {Bag} source - decoded inspector recipe
 * @param {{commit: Function}} sink - receives committed edits
 */
export function mountPanelInspector(host, source, sink) {
    const builder = new PanelBuilder('inspector');
    builder.loadSource(source);
    const mount = host.ownerDocument.createElement('div');
    mount.className = 'gramlot-devtools-inspector';
    const stylesheet = host.ownerDocument.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./inspector.css', import.meta.url).href;
    host.append(mount);
    const app = new Application(mount, builder, {inspector: false});
    mount.append(stylesheet);
    mount.querySelector('[data-inspector="toggle"]').hidden = true;
    app.live(() => builder.data.setItem('opened', true));
    const scopes = {};
    for (const kind of KINDS) {
        const tree = mount.querySelector(`[data-inspector="${kind}"]`);
        const editor = new PanelEditor(
            mount.querySelector(`[data-inspector="${kind}-editor"]`), new Bag(), kind, sink);
        const scope = {kind, bag: null, error: null, tree, editor, id: 'inspector-detail-' + kind};
        scope.refresh = () => {
            const path = builder.data.getItem(kind + 'Path');
            editor.refresh(path);
            const text = describe(scope, path);
            if (builder.data.getItem(kind + 'Detail') !== text) {
                app.live(() => builder.data.setItem(kind + 'Detail', text));
            }
        };
        builder.data.subscribe(scope.id, {any: scope.refresh});
        scopes[kind] = scope;
    }
    let disposed = false;
    const tool = {
        app,
        scopes,
        /** Replace the inspected copy of one root (`data` or `source`). */
        setBag(kind, bag, error = null) {
            const scope = scopes[kind];
            if (scope.bag) scope.bag.unsubscribe(scope.id, {any: true});
            scope.bag = bag;
            scope.error = error;
            scope.tree.storeBag = bag;
            scope.editor.setBag(bag);
            bag.subscribe(scope.id, {any: scope.refresh});
            app.live(() => builder.data.setItem(kind + 'Path', null));
            scope.refresh();
        },
        /** Report a failed command in the editor status line. */
        setStatus(kind, message, error = false) { scopes[kind].editor.setStatus(message, error); },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const scope of Object.values(scopes)) {
                scope.bag?.unsubscribe(scope.id, {any: true});
                builder.data.unsubscribe(scope.id, {any: true});
                scope.editor.dispose();
            }
            app.dispose();
            mount.remove();
        },
    };
    for (const kind of KINDS) tool.setBag(kind, new Bag());
    return tool;
}
