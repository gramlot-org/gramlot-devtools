// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * DevTools panel: PoC runtime + inspector on panel-side copies of the Data and
 * Source Bags of the inspected page.
 *
 * Copies change only from `snapshot` and `change` messages. Edits made in the
 * inspector become commands; the page applies them and the copy follows the
 * change event that comes back (no optimistic update).
 *
 * Every frame of the inspected tab has its own agent. The panel lists the
 * frames that hold a Gramlot instance and inspects one at a time.
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
const frameSelect = document.getElementById('frame');
const evaluateForm = document.getElementById('evaluate');
const evaluateMode = document.getElementById('evaluate-mode');
const expressionInput = document.getElementById('expression');
const resultLine = document.getElementById('result');
// Default: inspectedWindow.eval, which the page CSP does not block. Outside
// DevTools only the agent mode exists.
if (devtools) evaluateMode.value = 'inspectedWindow';
else evaluateMode.querySelector('[value="inspectedWindow"]').disabled = true;

// frames: frameId -> {url, instance: {instanceId, pageId} | null}.
// frameId/instanceId: the inspected frame and its instance.
const state = {frames: new Map(), frameId: null, instanceId: null, pageId: null, pending: new Map(), log: [], violations: []};
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
    renderFrames();
}

/** Frame selector: shown only when more than one frame holds an instance. */
function renderFrames() {
    const withInstance = [...state.frames].filter(([, frame]) => frame.instance);
    frameSelect.hidden = withInstance.length < 2;
    frameSelect.replaceChildren(...withInstance.map(([frameId, frame]) => {
        const option = document.createElement('option');
        option.value = String(frameId);
        option.textContent = `${frameId === 0 ? 'top' : frame.url} · ${frame.instance.instanceId}`;
        option.selected = frameId === state.frameId;
        return option;
    }));
}

// Chrome stops an idle MV3 service worker after about 30 s and closes its
// ports. Every message resets that timer, so the panel sends a ping while it
// is open; if the port closes anyway, the panel connects and attaches again.
const PING_MS = 20000;
let port = null;
function sendTo(frameId, type, payload) {
    const msg = message(type, payload);
    port.postMessage({control: 'to-frame', frameId, msg});
    return msg;
}
function send(type, payload) {
    return sendTo(state.frameId, type, payload);
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

function clearCopies() {
    state.frameId = null;
    state.instanceId = null;
    state.pageId = null;
    for (const root of ROOTS) tool.setBag(root, new Bag());
}

function reset(kind, text) {
    clearCopies();
    show(kind, text);
}

/** Inspect the instance of one frame: new copies from new snapshots. */
function select(frameId) {
    const previous = state.frameId;
    if (previous !== null && previous !== frameId && state.frames.get(previous)?.instance) {
        for (const root of ROOTS) sendTo(previous, 'unsubscribe', {instanceId: state.instanceId, root});
    }
    clearCopies();
    const frame = state.frames.get(frameId);
    const instance = frame.instance;
    state.frameId = frameId;
    state.instanceId = instance.instanceId;
    state.pageId = instance.pageId;
    show('connected', `Gramlot instance ${instance.instanceId}` + (instance.pageId ? ` · page ${instance.pageId}` : '')
        + (frameId === 0 ? '' : ` · frame ${frame.url}`));
    for (const root of ROOTS) send('subscribe', {instanceId: instance.instanceId, root});
}

/** Keep the inspected frame if it still has an instance; otherwise pick one, top frame first. */
function choose(removedText = 'No Gramlot instance in this page.') {
    if (state.frameId !== null && state.frames.get(state.frameId)?.instance) { renderFrames(); return; }
    const candidates = [...state.frames].filter(([, frame]) => frame.instance).map(([frameId]) => frameId);
    if (!candidates.length) { reset('none', removedText); return; }
    select(candidates.includes(0) ? 0 : Math.min(...candidates));
}

frameSelect.addEventListener('change', () => select(Number(frameSelect.value)));

function resubscribe(root) {
    send('unsubscribe', {instanceId: state.instanceId, root});
    send('subscribe', {instanceId: state.instanceId, root});
}

function onProtocol(frameId, url, msg) {
    const p = msg.payload;
    state.log.push(msg.type);
    if (state.log.length > 200) state.log.shift();
    const inspected = frameId === state.frameId && p.instanceId === state.instanceId;
    switch (msg.type) {
        case 'hello': {
            state.frames.set(frameId, {url, instance: p.instances[0] || null});
            // A new hello from the inspected frame means a new instance there.
            if (frameId === state.frameId) state.frameId = null;
            choose();
            return;
        }
        case 'snapshot':
            if (!inspected) return;
            if (p.error) { tool.setBag(p.root, new Bag(), `Snapshot failed: ${p.error}`); return; }
            tool.setBag(p.root, Bag.fromTytx(p.tytx, 'json'));
            return;
        case 'change': {
            if (!inspected) return;
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
        case 'bye': {
            const frame = state.frames.get(frameId);
            if (frame?.instance?.instanceId === p.instanceId) frame.instance = null;
            if (inspected) state.frameId = null;
            choose('The Gramlot instance was removed.');
            return;
        }
        default:
            state.log.push(`unknown message ${msg.type}`);
    }
}

function onPortMessage(msg) {
    if (msg.control === 'frame') { if (isMessage(msg.msg)) onProtocol(msg.frameId, msg.url, msg.msg); return; }
    if (msg.control === 'frame-detached') {
        if (msg.frameId === 0) {
            state.frames.clear();
            reset('waiting', 'Page unloaded. Waiting for the page…');
            return;
        }
        state.frames.delete(msg.frameId);
        if (msg.frameId === state.frameId) state.frameId = null;
        choose();
        return;
    }
    if (msg.control === 'inject-failed') { state.frames.clear(); reset('none', `Cannot inspect this page: ${msg.error}`); }
}

function connect() {
    port = chrome.runtime.connect({name: 'gramlot-devtools-panel'});
    port.onMessage.addListener(onPortMessage);
    port.onDisconnect.addListener(() => {
        for (const pending of state.pending.values()) pending.resolve({ok: false, error: 'Disconnected from the extension.'});
        state.pending.clear();
        state.frames.clear();
        reset('waiting', 'Disconnected from the extension. Reconnecting…');
        connect();
    });
    port.postMessage({control: 'attach', tabId});
}

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
        const frameUrl = state.frameId ? state.frames.get(state.frameId).url : undefined;
        devtools.inspectedWindow.eval(code, frameUrl ? {frameURL: frameUrl} : {}, (value, exception) => {
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
connect();
setInterval(() => port.postMessage({control: 'ping'}), PING_MS);
