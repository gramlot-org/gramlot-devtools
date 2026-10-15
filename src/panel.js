// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Chrome frame routing around the shared Gramlot inspector. */
import {InspectorConnection} from '@gramlot/gramlot/tools/inspector';
import {message, nextId, isMessage, isVisibility} from './protocol.js';
const tabId = chrome.devtools ? chrome.devtools.inspectedWindow.tabId : Number(new URLSearchParams(location.search).get('tabId'));
const statusBar = document.getElementById('status');
const messageLine = document.getElementById('message');
const frameSelect = document.getElementById('frame');
const tool = document.getElementById('inspector');
const state = {frames: new Map(), frameId: null, instanceId: null, pageId: null, connection: null,
    log: [], violations: [], breakpoints: new Map(), tool};
globalThis.gramlotDevtools = state;
document.addEventListener('securitypolicyviolation', event => state.violations.push({directive: event.violatedDirective, sample: event.sample}));
let port = null, relay = null, connectionId = null, release = null;
function show(kind, text) {
    statusBar.dataset.state = kind;
    messageLine.textContent = text;
    messageLine.hidden = kind === 'connected';
    statusBar.title = messageLine.hidden ? text : '';
    tool.hidden = !messageLine.hidden;
    renderFrames();
}
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
    statusBar.hidden = messageLine.hidden && frameSelect.hidden;
}

function availableFrames() {
    return [...state.frames].filter(([id, frame]) => frame.instance && (id === 0 || frame.visible === true))
        .sort(([a], [b]) => a - b);
}

/** List the base window and visible frames that hold an instance. */
function renderFrames() {
    const withInstance = availableFrames();
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


function sendTo(frameId, type, payload) {
    port.postMessage({control: 'to-frame', frameId, msg: message(type, payload)});
}
function clearCopies() {
    release?.(); release = null;
    if (connectionId !== null) sendTo(state.frameId, 'uninspect', {connectionId});
    state.connection?.close();
    relay?.close(); relay = null;
    state.connection = null; connectionId = null;
    tool.targets = [];
    state.frameId = null; state.instanceId = null; state.pageId = null;
}
function reset(kind, text) { clearCopies(); show(kind, text); }
function select(frameId) {
    clearCopies();
    const instance = state.frames.get(frameId).instance;
    state.frameId = frameId; state.instanceId = instance.instanceId; state.pageId = instance.pageId;
    const channel = new MessageChannel(), id = nextId('inspection');
    connectionId = id;
    relay = channel.port2;
    const connection = new InspectorConnection(channel.port1);
    state.connection = connection;
    const pendingBreakpoints = new Map();
    channel.port2.addEventListener('message', event => {
        const data = event.data;
        if (data.type === 'breakpoint') pendingBreakpoints.set(data.id, data.command);
        sendTo(frameId, 'inspector', {connectionId: id, data});
    });
    channel.port2.start();
    state.receive = data => {
        const command = pendingBreakpoints.get(data.id);
        if (data.type === 'result' && command) {
            pendingBreakpoints.delete(data.id);
            if (data.ok) {
                const key = `${command.root}:${command.path}`;
                if (command.mode) state.breakpoints.set(key, {...command});
                else state.breakpoints.delete(key);
            }
        }
        channel.port2.postMessage(data);
    };
    let restored = false;
    release = connection.subscribe(() => {
        if (connection.state !== 'started' || restored) return;
        restored = true;
        tool.targets = [{id, title: frameLabel(frameId), connection}];
        for (const config of state.breakpoints.values()) connection.request('breakpoint', config).catch(error => {
            connection.error = error.message;
            show('connected', error.message);
        });
    });
    show('connected', `Gramlot instance ${instance.instanceId} · ${frameLabel(frameId)}`);
    sendTo(frameId, 'inspect', {instanceId: instance.instanceId, connectionId: id});
}
/** Keep a manual choice until visibility changes; prefer visible subframes. */
function choose(removedText = 'No Gramlot instance in this page.', follow = false, appeared = null) {
    const candidates = availableFrames().map(([frameId]) => frameId);
    if (!follow && candidates.includes(state.frameId)) { renderFrames(); return; }
    if (!candidates.length) {
        reset('none', removedText);
        return;
    }
    const next = appeared !== 0 && candidates.includes(appeared) ? appeared
        : candidates.find(id => id !== 0) ?? candidates[0];
    if (next === state.frameId) { renderFrames(); return; }
    select(next);
}

frameSelect.addEventListener('change', () => select(Number(frameSelect.value)));


function onProtocol(frameId, url, msg) {
    const p = msg.payload;
    state.log.push(msg.type); if (state.log.length > 200) state.log.shift();
    switch (msg.type) {
        case 'visibility': {
            if (!isVisibility(p)) return;
            const frame = state.frames.get(frameId) || {url, instance: null, visible: null};
            const changed = frame.visible !== p.visible;
            frame.visible = p.visible; state.frames.set(frameId, frame);
            if (changed && frame.instance) choose('No Gramlot instance in this page.', frameId !== 0, p.visible ? frameId : null);
            return;
        }
        case 'hello': {
            const previous = state.frames.get(frameId);
            if (frameId === state.frameId) clearCopies();
            state.frames.set(frameId, {url, visible: previous?.visible ?? null, instance: p.instances[0] || null});
            choose('No Gramlot instance in this page.', !previous?.instance && previous?.visible === true && frameId !== 0, frameId);
            return;
        }
        case 'inspector':
            if (frameId === state.frameId && p.instanceId === state.instanceId && p.connectionId === connectionId) state.receive(p.data);
            return;
        case 'bye': {
            const frame = state.frames.get(frameId);
            if (frame?.instance?.instanceId !== p.instanceId) return;
            if (frameId === state.frameId) clearCopies();
            frame.instance = null;
            choose('The Gramlot instance was removed.');
        }
    }
}
function onPortMessage(msg) {
    if (msg.control === 'frame') { if (isMessage(msg.msg)) onProtocol(msg.frameId, msg.url, msg.msg); return; }
    if (msg.control === 'frame-detached') {
        if (msg.frameId === 0) { reset('waiting', 'Page unloaded. Waiting for the page…'); state.frames.clear(); return; }
        if (msg.frameId === state.frameId) clearCopies();
        state.frames.delete(msg.frameId); choose(); return;
    }
    if (msg.control === 'inject-failed') { reset('none', `Cannot inspect this page: ${msg.error}`); state.frames.clear(); }
}
function connect() {
    port = chrome.runtime.connect({name: 'gramlot-devtools-panel'});
    port.onMessage.addListener(onPortMessage);
    port.onDisconnect.addListener(() => {
        const reason = chrome.runtime.lastError?.message;
        state.log.push(`port closed${reason ? `: ${reason}` : ''}`);
        // The old Chrome port is gone; close local inspection before reconnecting.
        connectionId = null;
        reset('waiting', 'Disconnected from the extension. Reconnecting…');
        state.frames.clear();
        connect();
    });
    port.postMessage({control: 'attach', tabId});
}
show('waiting', 'Connecting to the page…');
connect();
setInterval(() => port.postMessage({control: 'ping'}), 20000);
