// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Content script (ISOLATED world), injected after the agent.
 * Bridges window.postMessage (agent) and a chrome.runtime port (background).
 * One random session id per connection marks the messages of this bridge.
 * When the port closes (DevTools closed, page unloaded) it tells the agent to
 * uninstall and removes its own listeners, so a later injection starts clean.
 *
 * Back/forward cache: when the page enters the cache, the port is closed and
 * the agent stays installed; when the page is restored, a new port and a new
 * session connect again, and the agent announces itself with a new hello.
 */
import {isMessage, message} from './protocol.js';

const GUARD = '__gramlotDevtoolsContent';

if (!globalThis[GUARD]) {
    globalThis[GUARD] = true;
    let session = null;
    let port = null;
    let closed = false;
    const toPage = (msg) => window.postMessage({...msg, dir: 'to-page', session}, '*');
    const onWindow = (event) => {
        if (event.source !== window || !port) return;
        const msg = event.data;
        if (!isMessage(msg) || msg.dir !== 'to-panel' || msg.session !== session) return;
        const {dir: _dir, session: _session, ...clean} = msg;
        port.postMessage(clean);
    };
    const teardown = () => {
        if (closed) return;
        closed = true;
        toPage(message('disconnect'));
        window.removeEventListener('message', onWindow);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        delete globalThis[GUARD];
    };
    const connect = () => {
        session = crypto.randomUUID();
        const current = chrome.runtime.connect({name: 'gramlot-devtools-content'});
        port = current;
        current.onMessage.addListener((msg) => {
            if (msg.control === 'detach') { teardown(); current.disconnect(); return; }
            if (isMessage(msg)) toPage(msg);
        });
        current.onDisconnect.addListener(() => {
            void chrome.runtime.lastError; // handled: background or page went away
            // A port closed on entering the back/forward cache is not the end.
            if (current === port) teardown();
        });
        toPage(message('connect', {session}));
    };
    function onPageHide(event) {
        if (!event.persisted || !port) return;
        const current = port;
        port = null;
        current.disconnect();
    }
    function onPageShow(event) {
        if (event.persisted && !closed && !port) connect();
    }
    window.addEventListener('message', onWindow);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    connect();
}
