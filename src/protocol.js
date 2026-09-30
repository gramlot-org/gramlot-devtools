// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Message protocol, version 1, shared by the page agent and the panel.
 *
 * This module imports nothing. Functions that encode or decode values take
 * the Bag class as an argument: the agent passes the class of the inspected
 * page (`gramlot.data.constructor`), the panel passes its own. Both classes
 * come from @jsr/genro__bag, whose `toTytx`/`fromTytx` use @jsr/genro__tytx.
 *
 * Every message: {channel: 'gramlot-devtools', v: 1, id, type, payload}.
 * Between content script and agent two routing fields are added:
 * `dir` ('to-page' | 'to-panel') and `session` (random id per connection).
 */
export const CHANNEL = 'gramlot-devtools';
export const VERSION = 1;
export const ROOTS = ['data', 'source'];

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

/**
 * Encode a node value.
 * A Bag value is sent as its own TYTX text, with `bag` set to its TYTX
 * suffix ('X' for Bag, 'XS' for SourceBag). Any other value is sent as the
 * TYTX text of a one-node wrapper Bag, so that dates, decimals and nulls keep
 * their type. The live Bag is never inserted in the wrapper: that would
 * change its parent.
 */
export function encodeValue(BagClass, value) {
    if (value instanceof BagClass) {
        return {tytxValue: value.toTytx('json'), bag: value.constructor.tytxSuffix || 'X'};
    }
    const wrapper = new BagClass();
    wrapper.setItem('v', value);
    return {tytxValue: wrapper.toTytx('json')};
}

/** @param {Object<string, Function>} bagClasses - suffix -> Bag class, must include 'X' */
export function decodeValue(bagClasses, encoded) {
    if (encoded.bag) {
        const cls = bagClasses[encoded.bag] || bagClasses.X;
        return cls.fromTytx(encoded.tytxValue, 'json');
    }
    return bagClasses.X.fromTytx(encoded.tytxValue, 'json').getItem('v');
}

/**
 * Encode attributes as the TYTX text of a one-node wrapper Bag.
 * In a Bag an absent attribute and a null attribute are the same thing, so
 * Bag.fromTytx() does not rebuild null attributes. In a partial update they
 * differ: absent means unchanged, null means remove. When an attribute is
 * null, the ordered list of all attribute names travels as the wrapper node
 * value, and decodeAttrs() restores the nulls in their place.
 */
export function encodeAttrs(BagClass, attrs) {
    const wrapper = new BagClass();
    const names = Object.keys(attrs);
    const order = names.some(name => attrs[name] === null) ? names : null;
    wrapper.setItem('v', order).setAttr({...attrs}, false, false, true);
    return wrapper.toTytx('json');
}

export function decodeAttrs(BagClass, text) {
    const node = BagClass.fromTytx(text, 'json').getNode('v');
    const order = node.getValue();
    if (!Array.isArray(order)) return {...node.attr};
    return Object.fromEntries(order.map(name => [name, Object.hasOwn(node.attr, name) ? node.attr[name] : null]));
}

/** Split a dotted path into parent path and label. */
export function splitPath(path) {
    const index = path.lastIndexOf('.');
    return index < 0 ? ['', path] : [path.slice(0, index), path.slice(index + 1)];
}

/**
 * Turn one Bag subscription event into `change` payloads (without instanceId/root).
 * Bag events: ins/del carry the parent pathlist; upd_* carry the node pathlist.
 * A clear() delivers an array of nodes: it becomes one `del` per node.
 */
export function changesFromEvent(BagClass, event) {
    const pathlist = event.pathlist || [];
    if (event.evt === 'del') {
        const nodes = Array.isArray(event.node) ? event.node : [event.node];
        return nodes.map(node => ({evt: 'del', path: [...pathlist, node.label].join('.')}));
    }
    const node = event.node;
    const change = {
        evt: event.evt === 'ins' ? 'ins' : 'upd',
        path: event.evt === 'ins' ? [...pathlist, node.label].join('.') : pathlist.join('.'),
        attrs: encodeAttrs(BagClass, node.attr),
    };
    // Static value: the agent never triggers a resolver. An attribute-only
    // update carries no value, so a Bag branch is not re-sent.
    if (event.evt !== 'upd_attrs') Object.assign(change, encodeValue(BagClass, node.staticValue));
    if (event.evt === 'ins') change.ind = event.ind;
    return [change];
}

/** Apply a `change` payload to a panel-side copy. Throws when the copy diverged. */
export function applyChange(bagClasses, bag, change) {
    const BagClass = bagClasses.X;
    const [parentPath, label] = splitPath(change.path);
    const parent = parentPath ? bag.getItem(parentPath) : bag;
    if (!(parent instanceof BagClass)) throw new Error(`Copy diverged: no branch at ${parentPath}`);
    if (change.evt === 'del') {
        if (!parent.getNode(label)) throw new Error(`Copy diverged: no node at ${change.path}`);
        parent.popNode(label);
        return;
    }
    const value = change.tytxValue === undefined ? undefined : decodeValue(bagClasses, change);
    const attrs = decodeAttrs(BagClass, change.attrs);
    if (change.evt === 'ins') {
        if (parent.getNode(label)) throw new Error(`Copy diverged: node already at ${change.path}`);
        parent.setItem(label, value, attrs, change.ind ?? '>', false, false);
        return;
    }
    const node = parent.getNode(label);
    if (!node) throw new Error(`Copy diverged: no node at ${change.path}`);
    node.setAttr(attrs, true, false, false);
    if (value !== undefined) node.setValue(value);
}
