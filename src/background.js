// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Service worker: routes messages between one panel and the content scripts
 * of the frames of its inspected tab, and injects agent + content script on
 * demand, in every frame the host permissions allow.
 *
 * Protocol messages are not rewritten: the frame travels in a control
 * envelope around them.
 *
 * Panel port messages:  {control: 'attach', tabId} | {control: 'ping'} |
 *   {control: 'to-frame', frameId, msg}
 * Content port messages: protocol message
 * Messages to the panel: {control: 'frame', frameId, url, msg} |
 *   {control: 'frame-detached', frameId} | {control: 'inject-failed', error}
 * Messages to content:  protocol message | {control: 'detach'}
 */
const tabs = new Map(); // tabId -> {panel, frames: Map(frameId -> content port)}

async function inject(tabId, frameIds = null) {
    const entry = tabs.get(tabId);
    if (!entry) return;
    const target = frameIds ? {tabId, frameIds} : {tabId, allFrames: true};
    try {
        // Agent first, so it listens before the content script says `connect`.
        await chrome.scripting.executeScript({target, world: 'MAIN', files: ['agent.js']});
        await chrome.scripting.executeScript({target, world: 'ISOLATED', files: ['content.js']});
    } catch (error) {
        // A sub-frame the extension cannot access is simply not inspected.
        if (!frameIds || frameIds.includes(0)) {
            entry.panel.postMessage({control: 'inject-failed', error: String(error.message || error)});
        }
    }
}

function detachAll(entry) {
    for (const content of entry.frames.values()) content.postMessage({control: 'detach'});
    entry.frames.clear();
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'gramlot-devtools-panel') {
        let tabId = null;
        port.onMessage.addListener((msg) => {
            if (msg.control === 'attach') {
                tabId = msg.tabId;
                const previous = tabs.get(tabId);
                if (previous) detachAll(previous);
                tabs.set(tabId, {panel: port, frames: new Map()});
                inject(tabId);
                return;
            }
            // Keeps the service worker alive while the panel is open.
            if (msg.control === 'ping') return;
            if (msg.control === 'to-frame') tabs.get(tabId)?.frames.get(msg.frameId)?.postMessage(msg.msg);
        });
        port.onDisconnect.addListener(() => {
            const entry = tabs.get(tabId);
            if (!entry || entry.panel !== port) return;
            detachAll(entry);
            tabs.delete(tabId);
        });
        return;
    }
    if (port.name === 'gramlot-devtools-content') {
        const tabId = port.sender?.tab?.id;
        const frameId = port.sender?.frameId;
        const url = port.sender?.url;
        const entry = tabs.get(tabId);
        if (!entry) { port.disconnect(); return; }
        entry.frames.get(frameId)?.postMessage({control: 'detach'});
        entry.frames.set(frameId, port);
        port.onMessage.addListener((msg) => {
            if (entry.frames.get(frameId) === port) entry.panel.postMessage({control: 'frame', frameId, url, msg});
        });
        port.onDisconnect.addListener(() => {
            if (entry.frames.get(frameId) !== port) return;
            entry.frames.delete(frameId);
            if (tabs.get(tabId) === entry) entry.panel.postMessage({control: 'frame-detached', frameId});
        });
    }
});

// Reload, navigation, or a frame loaded later: inject in that frame once its
// document is complete.
chrome.webNavigation.onCompleted.addListener(({tabId, frameId}) => {
    const entry = tabs.get(tabId);
    if (entry && !entry.frames.has(frameId)) inject(tabId, [frameId]);
});
