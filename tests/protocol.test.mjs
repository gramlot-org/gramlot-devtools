// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Protocol unit tests with the real @genrojs/bag used by Gramlot.
 * Run: `node --test tests/protocol.test.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHANNEL, VERSION, message, isMessage, isVisibility, encodeValue, decodeValue, encodeAttrs, decodeAttrs,
    changesFromEvent, applyChange, splitPath,
} from '../src/protocol.js';

import {Bag} from '@genrojs/bag';
import {createDecimal, isDecimal} from '@genrojs/tytx';
const CLASSES = {X: Bag};

/** Page Bag + copy kept in sync through changesFromEvent/applyChange, as agent and panel do. */
function mirror(page) {
    const copy = Bag.fromTytx(page.toTytx('json'), 'json');
    const sent = [];
    page.subscribe('test', {any: event => {
        for (const change of changesFromEvent(Bag, event)) {
            const wire = JSON.parse(JSON.stringify(change)); // what crosses the ports
            sent.push(wire);
            applyChange(CLASSES, copy, wire);
        }
    }});
    return {copy, sent};
}

test('message envelope', () => {
    const msg = message('hello', {instances: []}, 'x1');
    assert.deepEqual(msg, {channel: CHANNEL, v: VERSION, id: 'x1', type: 'hello', payload: {instances: []}});
    assert.equal(isMessage(msg), true);
    assert.equal(isMessage({...msg, v: 2}), false);
    assert.equal(isMessage({...msg, channel: 'other'}), false);
    assert.equal(isMessage(null), false);
});

test('visibility messages carry a boolean independently of an instance', () => {
    for (const visible of [true, false]) {
        const msg = JSON.parse(JSON.stringify(message('visibility', {visible})));
        assert.equal(isMessage(msg), true);
        assert.equal(isVisibility(msg.payload), true);
        assert.equal(msg.payload.visible, visible);
    }
    for (const payload of [null, undefined, {}, {visible: 'false'}, {visible: 0}]) {
        assert.equal(isVisibility(payload), false);
    }
});

test('scalar values keep their TYTX type', () => {
    const date = new Date(Date.UTC(2026, 8, 25));
    for (const value of ['text', 12, 12.5, true, false, null, date, createDecimal('10.25')]) {
        const decoded = decodeValue(CLASSES, JSON.parse(JSON.stringify(encodeValue(Bag, value))));
        if (value instanceof Date) assert.equal(decoded.getTime(), value.getTime());
        else if (isDecimal(value)) { assert.ok(isDecimal(decoded)); assert.equal(decoded.toString(), '10.25'); }
        else assert.equal(decoded, value);
    }
});

test('a Bag value is sent as its own TYTX and the live Bag keeps its parent', () => {
    const page = new Bag();
    page.setItem('a.b', 1);
    page.subscribe('backref', {any: () => {}});
    const branch = page.getItem('a');
    const before = [branch.parent, branch.parentNode];
    const encoded = encodeValue(Bag, branch);
    assert.equal(encoded.bag, 'X');
    assert.deepEqual([branch.parent, branch.parentNode], before);
    assert.equal(branch.parent, page);
    assert.equal(decodeValue(CLASSES, encoded).getItem('b'), 1);
});

test('attributes keep types and nulls', () => {
    const date = new Date(Date.UTC(2026, 0, 1));
    const attrs = decodeAttrs(Bag, encodeAttrs(Bag, {a: 1, b: null, c: date, d: 'x'}));
    assert.deepEqual(Object.keys(attrs), ['a', 'b', 'c', 'd']);
    assert.equal(attrs.b, null);
    assert.equal(attrs.c.getTime(), date.getTime());
});

test('splitPath', () => {
    assert.deepEqual(splitPath('a'), ['', 'a']);
    assert.deepEqual(splitPath('a.b.c'), ['a.b', 'c']);
});

test('insert, update, attribute update and delete reach the copy', () => {
    const page = new Bag();
    page.setItem('customer.name', 'Ada', {hint: 'n'});
    const {copy, sent} = mirror(page);
    page.setItem('customer.orders.o1', 5, {currency: 'EUR'});
    page.setItem('customer.name', 'Grace', {hint: 'n'});
    page.getNode('customer.name').setAttr({hint: 'changed', extra: 1});
    page.setItem('x', 1);
    page.delItem('x');
    assert.equal(copy.toTytx('json'), page.toTytx('json'));
    assert.deepEqual(sent.map(change => change.evt), ['ins', 'ins', 'upd', 'upd', 'ins', 'del']);
    const attrOnly = sent.find(change => change.evt === 'upd' && change.tytxValue === undefined);
    assert.ok(attrOnly, 'attribute-only update carries no value');
});

test('insert position is preserved', () => {
    const page = new Bag();
    page.setItem('a', 1);
    page.setItem('c', 3);
    const {copy} = mirror(page);
    page.setItem('b', 2, null, 1);
    assert.deepEqual([...copy.keys()], ['a', 'b', 'c']);
});

test('clear becomes one delete per node', () => {
    const page = new Bag();
    page.setItem('group.a', 1);
    page.setItem('group.b', 2);
    const {copy, sent} = mirror(page);
    page.getItem('group').clear();
    assert.deepEqual(sent.map(change => [change.evt, change.path]), [['del', 'group.a'], ['del', 'group.b']]);
    assert.equal(copy.toTytx('json'), page.toTytx('json'));
});

test('a Bag inserted with children arrives whole', () => {
    const page = new Bag();
    const {copy} = mirror(page);
    const branch = new Bag();
    branch.setItem('x.y', 'deep', {k: 'v'});
    page.setItem('tree', branch);
    assert.equal(copy.getItem('tree.x.y'), 'deep');
    assert.equal(copy.toTytx('json'), page.toTytx('json'));
});

test('replacing attributes removes the dropped ones (deleteAttribute path)', () => {
    const page = new Bag();
    page.setItem('n', 1, {a: 1, b: 2});
    const {copy} = mirror(page);
    const node = page.getNode('n');
    const next = {...node.attr};
    delete next.a;
    node.setAttr(next, true, false, false);
    assert.deepEqual(copy.getNode('n').attr, {b: 2});
});

test('a diverged copy is reported, not silently patched', () => {
    const copy = new Bag();
    assert.throws(() => applyChange(CLASSES, copy, {evt: 'del', path: 'missing'}), /Copy diverged/);
    assert.throws(() => applyChange(CLASSES, copy, {evt: 'upd', path: 'a.b', attrs: encodeAttrs(Bag, {})}), /Copy diverged/);
});
