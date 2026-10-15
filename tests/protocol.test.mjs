// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {message, isMessage, isVisibility, nextId} from '../src/protocol.js';
test('routing envelopes isolate the current protocol version', () => {
    const m = message('inspector', {connectionId: 'a', data: {type: 'refresh'}});
    assert.ok(isMessage(m)); assert.equal(isMessage({...m, v: 1}), false);
    assert.equal(isMessage({...m, channel: 'other'}), false);
    assert.equal(isMessage(null), false); assert.notEqual(nextId(), nextId());
});
test('visibility requires an explicit boolean', () => {
    assert.ok(isVisibility({visible: false})); assert.ok(isVisibility({visible: true}));
    for (const value of [null, {}, {visible: 1}, {visible: 'true'}]) assert.equal(isVisibility(value), false);
});
