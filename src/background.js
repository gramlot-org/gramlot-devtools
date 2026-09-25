// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Service worker: routes messages between one panel and the content script of
 * its inspected tab, and injects agent + content script on demand.
 *
 * Panel port messages:  {control: 'attach', tabId} | protocol message
 * Content port messages: protocol message
 * Messages to the panel: protocol message | {control: 'page-detached'} |
 *   {control: 'inject-failed', error}
 * Messages to content:  protocol message | {control: 'detach'}
 */
const tabs = new Map(); // tabId -> {panel, content}

async function inject(tabId) {
    const entry = tabs.get(tabId);
    if (!entry) return;
    try {
        // Agent first, so it listens before the content script says `connect`.
        await chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', files: ['agent.js']});
        await chrome.scripting.executeScript({target: {tabId}, world: 'ISOLATED', files: ['content.js']});
    } catch (error) {
        entry.panel?.postMessage({control: 'inject-failed', error: String(error.message || error)});
    }
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'gramlot-devtools-panel') {
        let tabId = null;
        port.onMessage.addListener((msg) => {
            if (msg.control === 'attach') {
                tabId = msg.tabId;
                const previous = tabs.get(tabId);
                previous?.content?.postMessage({control: 'detach'});
                tabs.set(tabId, {panel: port, content: null});
                inject(tabId);
                return;
            }
            tabs.get(tabId)?.content?.postMessage(msg);
        });
        port.onDisconnect.addListener(() => {
            const entry = tabs.get(tabId);
            if (!entry || entry.panel !== port) return;
            entry.content?.postMessage({control: 'detach'});
            tabs.delete(tabId);
        });
        return;
    }
    if (port.name === 'gramlot-devtools-content') {
        const tabId = port.sender?.tab?.id;
        const entry = tabs.get(tabId);
        if (!entry || port.sender.frameId !== 0) { port.disconnect(); return; }
        entry.content?.postMessage({control: 'detach'});
        entry.content = port;
        port.onMessage.addListener((msg) => { if (entry.content === port) entry.panel.postMessage(msg); });
        port.onDisconnect.addListener(() => {
            if (entry.content !== port) return;
            entry.content = null;
            if (tabs.get(tabId) === entry) entry.panel.postMessage({control: 'page-detached'});
        });
    }
});

// Reload or navigation: inject again once the new document is complete.
chrome.tabs.onUpdated.addListener((tabId, info) => {
    const entry = tabs.get(tabId);
    if (entry && info.status === 'complete' && !entry.content) inject(tabId);
});
