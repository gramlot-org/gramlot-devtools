// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Chrome routing envelope; inspection payloads use the shared inspector protocol. */
export const CHANNEL = 'gramlot-devtools';
export const VERSION = 2;

/** Frame visibility is independent of the presence of a Gramlot instance. */
export function isVisibility(payload) {
    return payload !== null && typeof payload === 'object' && typeof payload.visible === 'boolean';
}

let counter = 0;
export function nextId(prefix = 'm') {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function message(type, payload = {}, id = nextId()) {
    return {channel: CHANNEL, v: VERSION, id, type, payload};
}

export function isMessage(data) {
    return Boolean(data) && typeof data === 'object' && data.channel === CHANNEL && data.v === VERSION
        && typeof data.type === 'string';
}
