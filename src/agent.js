// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Page agent, injected by the extension in the MAIN world of the inspected tab.
 *
 * It uses only `window.gramlot`, `gramlot.data`, `gramlot.source` and public
 * Bag APIs. It bundles no Bag or TYTX library: values are encoded with the
 * Bag class of the page (`gramlot.data.constructor`).
 * It talks to the content script through window.postMessage; a message is
 * accepted only with channel 'gramlot-devtools', dir 'to-page' and the
 * session announced by the last `connect`.
 */
import {
    ROOTS, isMessage, message, encodeValue, decodeValue, encodeAttrs, decodeAttrs, changesFromEvent,
} from './protocol.js';

const KEY = Symbol.for('gramlot-devtools.agent');
const WATCH_MS = 500;
const SUBSCRIBER = 'gramlot-devtools';

if (!window[KEY]) install();

function install() {
    const ids = new WeakMap();
    let nextInstance = 1;
    let session = null;
    let tracked = null;           // {instanceId, gramlot}
    const subscriptions = new Map(); // root -> Bag
    let watcher = null;

    const send = (type, payload, id) => {
        if (!session) return;
        window.postMessage({...message(type, payload, id), dir: 'to-panel', session}, '*');
    };
    const current = () => {
        const gramlot = window.gramlot;
        const valid = gramlot && gramlot.state !== 'disposed' && gramlot.data && gramlot.source
            && typeof gramlot.data.subscribe === 'function' && typeof gramlot.source.subscribe === 'function';
        if (!valid) return null;
        if (!ids.has(gramlot)) ids.set(gramlot, `gramlot-${nextInstance++}`);
        return {instanceId: ids.get(gramlot), gramlot};
    };
    const bagOf = (instanceId, root) => {
        if (!tracked || tracked.instanceId !== instanceId) throw new Error(`Unknown Gramlot instance: ${instanceId}`);
        if (!ROOTS.includes(root)) throw new Error(`Unknown root: ${root}`);
        return tracked.gramlot[root];
    };
    const nodeOf = (payload) => {
        const node = bagOf(payload.instanceId, payload.root).getNode(payload.path);
        if (!node) throw new Error(`No node at ${payload.root}:${payload.path}`);
        return node;
    };
    const BagClass = () => tracked.gramlot.data.constructor;
    const bagClasses = () => ({X: BagClass(), XS: tracked.gramlot.source.constructor});

    const unsubscribe = (root) => {
        subscriptions.get(root)?.unsubscribe(SUBSCRIBER, {any: true});
        subscriptions.delete(root);
    };
    const unsubscribeAll = () => { for (const root of [...subscriptions.keys()]) unsubscribe(root); };
    const subscribe = (instanceId, root) => {
        const bag = bagOf(instanceId, root);
        unsubscribe(root);
        const Bag = BagClass();
        let tytx;
        try { tytx = bag.toTytx('json'); }
        catch (error) { send('snapshot', {instanceId, root, error: String(error.message || error)}); return; }
        send('snapshot', {instanceId, root, tytx});
        bag.subscribe(SUBSCRIBER, {any: event => {
            let changes;
            try { changes = changesFromEvent(Bag, event); }
            catch (error) {
                send('change', {instanceId, root, evt: 'error', path: (event.pathlist || []).join('.'),
                    error: String(error.message || error)});
                return;
            }
            for (const change of changes) send('change', {instanceId, root, ...change});
        }});
        subscriptions.set(root, bag);
    };
    const announce = () => {
        const found = current();
        if (tracked && (!found || found.instanceId !== tracked.instanceId)) {
            unsubscribeAll();
            send('bye', {instanceId: tracked.instanceId});
            tracked = null;
        }
        if (found && !tracked) {
            tracked = found;
            send('hello', {instances: [{instanceId: found.instanceId, pageId: found.gramlot.pageId ?? null,
                title: document.title}]});
        }
        return found;
    };
    const evaluate = (payload) => {
        const gramlot = tracked ? tracked.gramlot : window.gramlot;
        const root = payload.root || 'data';
        const node = payload.nodePath ? gramlot[root].getNode(payload.nodePath) : null;
        // Runs in the page, so the page CSP applies: without 'unsafe-eval'
        // this throws EvalError, reported in the result.
        const fn = new Function('gramlot', 'node', 'value', `"use strict"; return (${payload.expression});`);
        return fn(gramlot, node, node ? node.staticValue : undefined);
    };
    const encodeResult = (value) => {
        try { return encodeValue(BagClass(), value); }
        catch { return {text: String(value)}; }
    };
    const handle = (msg) => {
        const p = msg.payload || {};
        switch (msg.type) {
            case 'connect':
                session = p.session;
                tracked = null;
                unsubscribeAll();
                if (!announce()) send('hello', {instances: []});
                clearInterval(watcher);
                watcher = setInterval(announce, WATCH_MS);
                return;
            case 'disconnect': uninstall(); return;
            case 'subscribe': subscribe(p.instanceId, p.root); return;
            case 'unsubscribe': bagOf(p.instanceId, p.root); unsubscribe(p.root); return;
            case 'setValue': {
                const node = nodeOf(p);
                node.setValue(decodeValue(bagClasses(), p));
                return;
            }
            case 'setAttributes': {
                const node = nodeOf(p);
                node.setAttr(decodeAttrs(BagClass(), p.attrs), true, true, false);
                return;
            }
            case 'deleteAttribute': {
                const node = nodeOf(p);
                if (!Object.hasOwn(node.attr, p.name)) throw new Error(`No attribute ${p.name} at ${p.path}`);
                const next = {...node.attr};
                delete next[p.name];
                // Replacement notifies the removal; delAttr() emits no event.
                node.setAttr(next, true, false, false);
                return;
            }
            case 'evaluate': return encodeResult(evaluate(p));
            default: throw new Error(`Unknown message type: ${msg.type}`);
        }
    };
    const onMessage = (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!isMessage(msg) || msg.dir !== 'to-page') return;
        if (msg.type !== 'connect' && msg.session !== session) return;
        const requestId = msg.payload?.requestId;
        try {
            const result = handle(msg);
            if (requestId) send('result', {requestId, ok: true, ...(result || {})});
        } catch (error) {
            const text = `${error?.name || 'Error'}: ${error?.message || error}`;
            if (requestId) send('result', {requestId, ok: false, error: text});
            else send('result', {requestId: null, ok: false, error: text, type: msg.type});
        }
    };
    const onPageHide = () => { if (tracked) send('bye', {instanceId: tracked.instanceId}); };
    function uninstall() {
        unsubscribeAll();
        clearInterval(watcher);
        watcher = null;
        window.removeEventListener('message', onMessage);
        window.removeEventListener('pagehide', onPageHide);
        session = null;
        tracked = null;
        delete window[KEY];
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('pagehide', onPageHide);
    Object.defineProperty(window, KEY, {value: {uninstall}, configurable: true, enumerable: false});
}
