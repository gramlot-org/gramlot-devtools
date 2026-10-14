// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {Bag} from '@genrojs/bag';
import {message, encodeValue} from '../src/protocol.js';

const bundle = (await build({entryPoints: [new URL('../src/agent.js', import.meta.url).pathname],
    bundle: true, write: false, format: 'iife'})).outputFiles[0].text;

function agent(gramlot) {
    const sent = [], listeners = new Map();
    const window = {gramlot, postMessage: msg => sent.push(msg),
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: type => listeners.delete(type)};
    runInNewContext(bundle, {window, document: {documentElement: {}, title: 'Current Gramlot'},
        IntersectionObserver: class {observe() {} disconnect() {}}, console,
        setInterval: () => 1, clearInterval() {}});
    const send = (type, payload = {}) => listeners.get('message')({source: window,
        data: {...message(type, payload), dir: 'to-page', session: 'test'}});
    send('connect', {session: 'test'});
    return {sent, send};
}

test('current src.source is detected, subscribed and edited without a top-level alias', () => {
    const data = new Bag(), source = new Bag();
    data.setItem('caption', 'Data'); source.setItem('caption', 'Source');
    const gramlot = {state: 'started', data, src: {source}};
    Object.defineProperty(gramlot, 'source', {get() { throw new Error('Legacy access'); }});
    const a = agent(gramlot);
    const instanceId = a.sent.find(msg => msg.type === 'hello').payload.instances[0].instanceId;
    for (const root of ['data', 'source']) a.send('subscribe', {instanceId, root});
    const snapshot = a.sent.find(msg => msg.type === 'snapshot' && msg.payload.root === 'source');
    assert.equal(snapshot.payload.tytx, source.toTytx('json'));
    a.send('setValue', {instanceId, root: 'source', path: 'caption', ...encodeValue(Bag, 'Edited')});
    assert.equal(source.getItem('caption'), 'Edited');
    assert.equal(data.getItem('caption'), 'Data');
    assert.ok(a.sent.some(msg => msg.type === 'change' && msg.payload.root === 'source'));
    a.send('disconnect');
});

test('a legacy-only or disposed instance is not accepted as the current API', () => {
    for (const gramlot of [undefined, {data: new Bag(), source: new Bag()},
        {state: 'disposed', data: new Bag(), src: {source: new Bag()}}]) {
        const a = agent(gramlot);
        assert.equal(a.sent.find(msg => msg.type === 'hello').payload.instances.length, 0);
        a.send('disconnect');
    }
});
