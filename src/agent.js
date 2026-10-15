// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Chrome page discovery and lifecycle around the shared inspector agent. */
import {attachInspectorAgent} from '@gramlot/gramlot/tools/inspector-agent';
import {isMessage, message} from './protocol.js';

const KEY = Symbol.for('gramlot-devtools.agent');
if (!window[KEY]) install();

function install() {
    const ids = new WeakMap();
    let nextInstance = 1, session = null, tracked = null, watcher = null, visible = null;
    let inspection = null;
    const send = (type, payload) => {
        if (session) window.postMessage({...message(type, payload), dir: 'to-panel', session}, '*');
    };
    const visibilityObserver = new IntersectionObserver(entries => {
        const entry = entries.at(-1);
        const next = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
        if (next === visible) return;
        visible = next;
        send('visibility', {visible});
    });
    visibilityObserver.observe(document.documentElement);
    function stopInspection() {
        if (!inspection) return;
        inspection.agent.dispose();
        inspection.port.close();
        inspection = null;
    }
    function announce() {
        const gramlot = window.gramlot;
        const found = gramlot && gramlot.state !== 'disposed' && gramlot.data && gramlot.src?.source ? gramlot : null;
        if (tracked && tracked.gramlot !== found) {
            stopInspection();
            send('bye', {instanceId: tracked.instanceId});
            tracked = null;
        }
        if (found && !tracked) {
            if (!ids.has(found)) ids.set(found, `gramlot-${nextInstance++}`);
            tracked = {gramlot: found, instanceId: ids.get(found)};
            send('hello', {instances: [{instanceId: tracked.instanceId, pageId: found.pageId ?? null, title: document.title}]});
        }
        return found;
    }
    function handle(msg) {
        const p = msg.payload;
        if (msg.type === 'connect') {
            stopInspection();
            session = p.session;
            tracked = null;
            if (visible !== null) send('visibility', {visible});
            if (!announce()) send('hello', {instances: []});
            clearInterval(watcher);
            watcher = setInterval(announce, 500);
        } else if (msg.type === 'disconnect') uninstall();
        else if (msg.type === 'inspect') {
            if (!tracked || tracked.instanceId !== p.instanceId) throw new Error('Inspected instance changed');
            stopInspection();
            const channel = new MessageChannel();
            const connectionId = p.connectionId, instanceId = p.instanceId;
            channel.port2.addEventListener('message', event => send('inspector', {connectionId, instanceId, data: event.data}));
            channel.port2.start();
            inspection = {connectionId, port: channel.port2, agent: attachInspectorAgent(tracked.gramlot, channel.port1)};
        } else if (msg.type === 'inspector') {
            if (inspection?.connectionId === p.connectionId) inspection.port.postMessage(p.data);
        } else if (msg.type === 'uninspect') {
            if (inspection?.connectionId === p.connectionId) stopInspection();
        } else throw new Error(`Unknown message type: ${msg.type}`);
    }
    const onMessage = event => {
        const msg = event.data;
        if (event.source !== window || !isMessage(msg) || msg.dir !== 'to-page') return;
        if (msg.type !== 'connect' && msg.session !== session) return;
        try { handle(msg); }
        catch (error) {
            send('inspector', {connectionId: msg.payload.connectionId, instanceId: tracked?.instanceId,
                data: {type: 'error', error: error.message}});
        }
    };
    const onPageHide = () => {
        stopInspection();
        if (tracked) send('bye', {instanceId: tracked.instanceId});
        tracked = null;
    };
    function uninstall() {
        stopInspection();
        clearInterval(watcher);
        visibilityObserver.disconnect();
        window.removeEventListener('message', onMessage);
        window.removeEventListener('pagehide', onPageHide);
        session = null; tracked = null;
        delete window[KEY];
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('pagehide', onPageHide);
    Object.defineProperty(window, KEY, {value: {uninstall}, configurable: true});
}
