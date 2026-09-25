// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * DevTools panel: PoC runtime + inspector on panel-side copies of the Data and
 * Source Bags of the inspected page.
 *
 * Copies change only from `snapshot` and `change` messages. Edits made in the
 * inspector become commands; the page applies them and the copy follows the
 * change event that comes back (no optimistic update).
 *
 * Outside DevTools (automated tests) the page can be opened as
 * panel.html?tabId=N: then `inspectedWindow.eval` is not available.
 */
import {Bag} from 'genro-bag-js';
import {fromTytx} from 'genro-tytx';
import {BAG_CLASSES} from './panel-bags.js';
import {ROOTS, message, nextId, isMessage, encodeValue, encodeAttrs, decodeValue, applyChange} from './protocol.js';
import {mountPanelInspector} from './inspector/panel-inspector.js';
import recipe from './inspector/inspector-embedded.tytx';

const devtools = globalThis.chrome?.devtools;
const tabId = devtools ? devtools.inspectedWindow.tabId : Number(new URLSearchParams(location.search).get('tabId'));

const statusBar = document.getElementById('status');
const messageLine = document.getElementById('message');
const inspectorHost = document.getElementById('inspector');
const evaluateForm = document.getElementById('evaluate');
const evaluateMode = document.getElementById('evaluate-mode');
const expressionInput = document.getElementById('expression');
const resultLine = document.getElementById('result');
// Default: inspectedWindow.eval, which the page CSP does not block. Outside
// DevTools only the agent mode exists.
if (devtools) evaluateMode.value = 'inspectedWindow';
else evaluateMode.querySelector('[value="inspectedWindow"]').disabled = true;

const state = {instanceId: null, pageId: null, pending: new Map(), log: [], violations: []};
// Diagnostics for manual and automated verification; read-only use.
globalThis.gramlotDevtools = state;
// The extension CSP forbids eval/new Function: any attempt is recorded here.
document.addEventListener('securitypolicyviolation', (event) => {
    state.violations.push({directive: event.violatedDirective, sample: event.sample});
});

function show(kind, text) {
    statusBar.dataset.state = kind;
    messageLine.textContent = text;
    const connected = kind === 'connected';
    inspectorHost.hidden = !connected;
    evaluateForm.hidden = !connected;
}

const port = chrome.runtime.connect({name: 'gramlot-devtools-panel'});
function send(type, payload) {
    const msg = message(type, payload);
    port.postMessage(msg);
    return msg;
}
function request(type, payload, kind = null) {
    const requestId = nextId('r');
    return new Promise((resolve) => {
        state.pending.set(requestId, {kind, type, resolve});
        send(type, {...payload, requestId});
    });
}

const sink = {
    /** Turn one committed editor edit into commands for the page. */
    async commit(edit) {
        const base = {instanceId: state.instanceId, root: edit.kind, path: edit.path};
        const results = [];
        if (edit.setAttributes) {
            results.push(await request('setAttributes', {...base, attrs: encodeAttrs(Bag, edit.setAttributes)}, edit.kind));
        }
        for (const name of edit.deleteAttributes) {
            results.push(await request('deleteAttribute', {...base, name}, edit.kind));
        }
        if (edit.value !== undefined) {
            results.push(await request('setValue', {...base, ...encodeValue(Bag, edit.value)}, edit.kind));
        }
        const failed = results.find(result => !result.ok);
        if (failed) tool.setStatus(edit.kind, failed.error, true);
    },
};
const tool = mountPanelInspector(inspectorHost, fromTytx(recipe, 'json'), sink);
state.tool = tool;
state.request = request;

function reset(kind, text) {
    state.instanceId = null;
    state.pageId = null;
    for (const root of ROOTS) tool.setBag(root, new Bag());
    show(kind, text);
}

function resubscribe(root) {
    send('unsubscribe', {instanceId: state.instanceId, root});
    send('subscribe', {instanceId: state.instanceId, root});
}

function onProtocol(msg) {
    const p = msg.payload;
    state.log.push(msg.type);
    if (state.log.length > 200) state.log.shift();
    switch (msg.type) {
        case 'hello': {
            const instance = p.instances[0];
            if (!instance) { reset('none', 'No Gramlot instance in this page.'); return; }
            state.instanceId = instance.instanceId;
            state.pageId = instance.pageId;
            show('connected', `Gramlot instance ${instance.instanceId}` + (instance.pageId ? ` · page ${instance.pageId}` : ''));
            for (const root of ROOTS) send('subscribe', {instanceId: instance.instanceId, root});
            return;
        }
        case 'snapshot':
            if (p.instanceId !== state.instanceId) return;
            if (p.error) { tool.setBag(p.root, new Bag(), `Snapshot failed: ${p.error}`); return; }
            tool.setBag(p.root, Bag.fromTytx(p.tytx, 'json'));
            return;
        case 'change': {
            if (p.instanceId !== state.instanceId) return;
            const bag = tool.scopes[p.root].bag;
            try {
                if (p.evt === 'error') throw new Error(p.error);
                applyChange(BAG_CLASSES, bag, p);
            } catch (error) {
                // The copy cannot follow this change: take a new snapshot.
                state.log.push(`resync ${p.root}: ${error.message}`);
                resubscribe(p.root);
            }
            return;
        }
        case 'result': {
            const pending = state.pending.get(p.requestId);
            if (!pending) { if (!p.ok) state.log.push(`page error: ${p.error}`); return; }
            state.pending.delete(p.requestId);
            pending.resolve(p);
            return;
        }
        case 'bye':
            if (p.instanceId === state.instanceId) reset('none', 'The Gramlot instance was removed.');
            return;
        default:
            state.log.push(`unknown message ${msg.type}`);
    }
}

port.onMessage.addListener((msg) => {
    if (msg.control === 'page-detached') { reset('waiting', 'Page unloaded. Waiting for the page…'); return; }
    if (msg.control === 'inject-failed') { reset('none', `Cannot inspect this page: ${msg.error}`); return; }
    if (isMessage(msg)) onProtocol(msg);
});
port.onDisconnect.addListener(() => reset('none', 'Disconnected from the extension.'));

function formatResult(result) {
    if (!result.ok) return {text: result.error, error: true};
    if (result.text !== undefined) return {text: result.text, error: false};
    const value = decodeValue(BAG_CLASSES, result);
    if (value instanceof Bag) return {text: `Bag (${value.len ?? [...value].length} nodes)`, error: false};
    if (value instanceof Date) return {text: `${value.toISOString()} (date)`, error: false};
    const type = value === null ? 'null' : typeof value === 'object' ? (value.constructor?.name || 'object') : typeof value;
    return {text: `${type === 'string' ? JSON.stringify(value) : String(value)} (${type})`, error: false};
}

/** Evaluate through chrome.devtools.inspectedWindow.eval: DevTools evaluates in the page. */
function evaluateInspectedWindow(expression, root, nodePath) {
    const node = nodePath ? `gramlot[${JSON.stringify(root)}].getNode(${JSON.stringify(nodePath)})` : 'null';
    const code = `(() => {
        const gramlot = window.gramlot;
        if (!gramlot) throw new Error('No Gramlot instance');
        const node = ${node};
        const value = node ? node.staticValue : undefined;
        const result = (function (gramlot, node, value) { "use strict"; return (${expression}); })(gramlot, node, value);
        const Bag = gramlot.data.constructor;
        if (result instanceof Bag) return {tytxValue: result.toTytx('json'), bag: result.constructor.tytxSuffix || 'X'};
        try { const wrapper = new Bag(); wrapper.setItem('v', result); return {tytxValue: wrapper.toTytx('json')}; }
        catch (error) { return {text: String(result)}; }
    })()`;
    return new Promise((resolve) => {
        devtools.inspectedWindow.eval(code, (value, exception) => {
            if (exception?.isException) resolve({ok: false, error: String(exception.value)});
            else if (exception?.isError) resolve({ok: false, error: `${exception.code}: ${exception.description}`});
            else resolve({ok: true, ...value});
        });
    });
}

async function evaluate(expression, mode = evaluateMode.value) {
    const nodePath = tool.app.builder.data.getItem('dataPath') || undefined;
    const payload = {instanceId: state.instanceId, root: 'data', nodePath, expression};
    const result = mode === 'inspectedWindow'
        ? await evaluateInspectedWindow(expression, 'data', nodePath)
        : await request('evaluate', payload);
    const shown = formatResult(result);
    resultLine.textContent = shown.text;
    resultLine.dataset.error = String(shown.error);
    return {result, shown};
}
state.evaluate = evaluate;
evaluateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (expressionInput.value.trim()) evaluate(expressionInput.value);
});

show('waiting', 'Connecting to the page…');
port.postMessage({control: 'attach', tabId});
