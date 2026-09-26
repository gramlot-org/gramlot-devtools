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
 * panel.html?tabId=N.
 */
import {Bag} from 'genro-bag-js';
import {fromTytx} from 'genro-tytx';
import {BAG_CLASSES} from './panel-bags.js';
import {ROOTS, message, nextId, isMessage, encodeValue, encodeAttrs, applyChange} from './protocol.js';
import {mountPanelInspector} from './inspector/panel-inspector.js';
import recipe from './inspector/inspector-embedded.tytx';

const devtools = globalThis.chrome?.devtools;
const tabId = devtools ? devtools.inspectedWindow.tabId : Number(new URLSearchParams(location.search).get('tabId'));

const statusBar = document.getElementById('status');
const messageLine = document.getElementById('message');
const inspectorHost = document.getElementById('inspector');
const frameSelect = document.getElementById('frame');
const breakpointsButton = document.getElementById('breakpoints');
const breakpointDialog = document.getElementById('breakpoint-dialog');
const breakpointList = document.getElementById('breakpoint-list');

// frames: frameId -> {url, instance: {instanceId, pageId} | null}.
// frameId/instanceId: the inspected frame and its instance.
// breakpoints: `${root}:${path}` -> {root, path, mode, condition, error}. They
// belong to the panel and are sent to the inspected instance (legacy
// genro._debugPaths), so they survive reloads and frame changes.
const state = {frames: new Map(), frameId: null, instanceId: null, pageId: null, pending: new Map(), log: [], violations: [],
    breakpoints: new Map()};
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
    // Connected, the trees speak for themselves: the text is only a tooltip.
    messageLine.hidden = connected;
    statusBar.title = connected ? text : '';
    inspectorHost.hidden = !connected;
    renderFrames();
}

/**
 * Path of a frame: 'top' for the top frame; for a sub-frame its URL relative
 * to the top frame directory, the path from the root on the same origin, or
 * the full URL on another origin.
 */
function framePath(frameId) {
    if (frameId === 0) return 'top';
    const url = new URL(state.frames.get(frameId).url);
    const topUrl = state.frames.get(0)?.url;
    if (!topUrl) return url.href;
    const top = new URL(topUrl);
    if (url.origin !== top.origin) return url.href;
    const directory = top.pathname.slice(0, top.pathname.lastIndexOf('/') + 1);
    const path = url.pathname + url.search + url.hash;
    return url.pathname.startsWith(directory) ? path.slice(directory.length) : path;
}

/** Label of a frame: the page title of its instance, else its path; '(top)' marks the top frame. */
function frameLabel(frameId) {
    const title = state.frames.get(frameId).instance?.title;
    if (!title) return framePath(frameId);
    return frameId === 0 ? `${title} (top)` : title;
}

/** Nothing to show: no bar at all. */
function renderStatusBar() {
    statusBar.hidden = messageLine.hidden && frameSelect.hidden && breakpointsButton.hidden;
}

/** Frame selector: shown only when more than one frame holds an instance. */
function renderFrames() {
    const withInstance = [...state.frames].filter(([, frame]) => frame.instance);
    frameSelect.hidden = withInstance.length < 2;
    renderStatusBar();
    frameSelect.replaceChildren(...withInstance.map(([frameId, frame]) => {
        const option = document.createElement('option');
        option.value = String(frameId);
        option.textContent = frameLabel(frameId);
        option.title = `${framePath(frameId)} · ${frame.instance.instanceId}`;
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
        + (frameId === 0 ? '' : ` · frame ${frameLabel(frameId)}`));
    for (const root of ROOTS) send('subscribe', {instanceId: instance.instanceId, root});
    sendBreakpoints();
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
        // Reading lastError marks it as handled (for example: the inspected
        // page moved into the back/forward cache); the panel reconnects.
        const reason = chrome.runtime.lastError?.message;
        state.log.push(`port closed${reason ? `: ${reason}` : ''}`);
        for (const pending of state.pending.values()) pending.resolve({ok: false, error: 'Disconnected from the extension.'});
        state.pending.clear();
        state.frames.clear();
        reset('waiting', 'Disconnected from the extension. Reconnecting…');
        connect();
    });
    port.postMessage({control: 'attach', tabId});
}

/** Send the whole breakpoint set to the inspected instance; record compile errors. */
async function sendBreakpoints() {
    if (!state.instanceId) { renderBreakpoints(); return; }
    const breakpoints = [...state.breakpoints.values()].map(({root, path, mode, condition}) => ({root, path, mode, condition}));
    const result = await request('setBreakpoints', {instanceId: state.instanceId, breakpoints});
    for (const [key, breakpoint] of state.breakpoints) {
        breakpoint.error = result.ok ? result.errors?.[key] || null : result.error;
    }
    renderBreakpoints();
}

/** Add, change or (mode '') remove one breakpoint. */
function setBreakpoint(root, path, mode, condition = '') {
    const key = `${root}:${path}`;
    if (!mode) state.breakpoints.delete(key);
    else state.breakpoints.set(key, {root, path, mode, condition: condition.trim(), error: null});
    return sendBreakpoints();
}
state.setBreakpoint = setBreakpoint;

function describeBreakpoint(breakpoint) {
    return (breakpoint.mode === 'debugger' ? 'Debugger' : 'Console')
        + (breakpoint.condition ? ` · if ${breakpoint.condition}` : '');
}

// Editor line: the breakpoint of the selected node, above the property rows.
const breakpointLines = {};
for (const kind of ROOTS) {
    const scope = tool.scopes[kind];
    const line = document.createElement('div');
    line.hidden = true;
    line.dataset.breakpointLine = kind;
    line.style.cssText = 'padding:3px 8px;font:11px system-ui,sans-serif;color:#8a1c1c;background:#fdecea;border-bottom:1px solid #f3c7c3';
    scope.editor.rows.before(line);
    breakpointLines[kind] = line;
    tool.app.builder.data.subscribe(`breakpoint-line-${kind}`, {any: () => renderBreakpointLine(kind)});
    scope.tree.rowActions = [{id: 'breakpoint', icon: '●', label: 'Breakpoint'}];
    scope.tree.addEventListener('tree-action', (event) => {
        if (event.detail.action === 'breakpoint') openBreakpointDialog(kind, event.detail.path);
    });
}

function renderBreakpointLine(kind) {
    const breakpoint = state.breakpoints.get(`${kind}:${tool.app.builder.data.getItem(kind + 'Path')}`);
    breakpointLines[kind].hidden = !breakpoint;
    if (breakpoint) {
        breakpointLines[kind].textContent = `Breakpoint: ${describeBreakpoint(breakpoint)}`
            + (breakpoint.error ? ` · ${breakpoint.error}` : '');
    }
}

function renderBreakpoints() {
    const count = state.breakpoints.size;
    const failed = [...state.breakpoints.values()].some(breakpoint => breakpoint.error);
    breakpointsButton.hidden = count === 0;
    breakpointsButton.textContent = `${count} breakpoint${count === 1 ? '' : 's'}`;
    breakpointsButton.dataset.error = String(failed);
    renderStatusBar();
    for (const kind of ROOTS) renderBreakpointLine(kind);
    if (breakpointList.open) renderBreakpointList();
}

function openBreakpointDialog(root, path) {
    const form = breakpointDialog.querySelector('form');
    const existing = state.breakpoints.get(`${root}:${path}`);
    document.getElementById('breakpoint-where').textContent = `${root}: ${path}`;
    form.elements.mode.value = existing ? existing.mode : 'debugger';
    form.elements.condition.value = existing ? existing.condition : '';
    breakpointDialog.dataset.root = root;
    breakpointDialog.dataset.path = path;
    breakpointDialog.returnValue = '';
    breakpointDialog.showModal();
}
breakpointDialog.addEventListener('close', () => {
    if (breakpointDialog.returnValue !== 'ok') return;
    const form = breakpointDialog.querySelector('form');
    setBreakpoint(breakpointDialog.dataset.root, breakpointDialog.dataset.path,
        form.elements.mode.value, form.elements.condition.value);
});

function renderBreakpointList() {
    document.getElementById('breakpoint-items').replaceChildren(...[...state.breakpoints.values()].map((breakpoint) => {
        const item = document.createElement('li');
        const where = document.createElement('span');
        where.className = 'where';
        where.textContent = `${breakpoint.root}: ${breakpoint.path}`;
        const what = document.createElement('span');
        what.textContent = describeBreakpoint(breakpoint);
        item.append(where, what);
        if (breakpoint.error) {
            const error = document.createElement('span');
            error.className = 'error';
            error.textContent = breakpoint.error;
            item.append(error);
        }
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => { breakpointList.close(); openBreakpointDialog(breakpoint.root, breakpoint.path); });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => setBreakpoint(breakpoint.root, breakpoint.path, ''));
        item.append(edit, remove);
        return item;
    }));
}
breakpointsButton.addEventListener('click', () => { renderBreakpointList(); breakpointList.showModal(); });

show('waiting', 'Connecting to the page…');
connect();
setInterval(() => port.postMessage({control: 'ping'}), PING_MS);
