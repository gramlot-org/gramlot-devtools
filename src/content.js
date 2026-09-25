// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Content script (ISOLATED world), injected after the agent.
 * Bridges window.postMessage (agent) and a chrome.runtime port (background).
 * One random session id per injection marks the messages of this bridge.
 * When the port closes (DevTools closed, page unloaded) it tells the agent to
 * uninstall and removes its own listener, so a later injection starts clean.
 */
import {isMessage, message} from './protocol.js';

const GUARD = '__gramlotDevtoolsContent';

if (!globalThis[GUARD]) {
    globalThis[GUARD] = true;
    const session = crypto.randomUUID();
    const port = chrome.runtime.connect({name: 'gramlot-devtools-content'});
    const toPage = (msg) => window.postMessage({...msg, dir: 'to-page', session}, '*');
    const onWindow = (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!isMessage(msg) || msg.dir !== 'to-panel' || msg.session !== session) return;
        const {dir: _dir, session: _session, ...clean} = msg;
        port.postMessage(clean);
    };
    let closed = false;
    const teardown = () => {
        if (closed) return;
        closed = true;
        toPage(message('disconnect'));
        window.removeEventListener('message', onWindow);
        delete globalThis[GUARD];
    };
    window.addEventListener('message', onWindow);
    port.onMessage.addListener((msg) => {
        if (msg.control === 'detach') { teardown(); port.disconnect(); return; }
        if (isMessage(msg)) toPage(msg);
    });
    port.onDisconnect.addListener(teardown);
    toPage(message('connect', {session}));
}
