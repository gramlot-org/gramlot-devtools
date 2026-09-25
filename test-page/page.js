// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Local Gramlot test page for the DevTools extension. No application server:
 * the Source is authored with GramlotBuilder and started with startSource(),
 * Data is written with setItem(). window.gramlot is set as the real bootstrap
 * does (gramlot/src/gramlot/server/host.py). vendor/gramlot.js is a copy of
 * the Gramlot runtime made by ../build.mjs.
 */
import {Gramlot, GramlotBuilder} from './vendor/gramlot.js';

const authored = new GramlotBuilder();
const box = authored.root.div({id: 'box', class: 'x'});
box.h1('Hello from Gramlot');
const list = box.ul({id: 'list', class: 'items'});
list.li('First', {class: 'item'});
list.li('Second', {class: 'item'});
box.p('Edit my class from the Gramlot panel.', {id: 'note', class: 'plain'});

const app = new Gramlot({document, transport: false, element: document.getElementById('gramlot-root')});
window.gramlot = app;
app.startSource(authored.toTytx());
app.data.setItem('customer.name', 'Ada');
app.data.setItem('customer.born', new Date(Date.UTC(1815, 11, 10)), {note: 'birth date'});
app.data.setItem('customer.active', true);
app.data.setItem('customer.orders.o1.total', 12.5, {currency: 'EUR'});
app.data.setItem('customer.orders.o2.total', 7, {currency: 'EUR'});
