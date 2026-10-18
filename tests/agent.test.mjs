// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {Bag, GramlotBuilder} from '@gramlot/gramlot';
import {message} from '../src/protocol.js';
const bundle = (await build({entryPoints: [new URL('../src/agent.js', import.meta.url).pathname],
    bundle: true, write: false, format: 'iife'})).outputFiles[0].text;
const until = async fn => { for(let i=0;i<100;i++){const result=fn();if(result)return result;await new Promise(r=>setTimeout(r,5));}throw new Error('No agent response'); };
function fixture(gramlot) {
    const sent = [], listeners = new Map();
    const window = {gramlot, console, Function, crypto, postMessage: msg => sent.push(msg),
        addEventListener(type, fn) {if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
        removeEventListener(type, fn) {listeners.get(type)?.delete(fn);}};
    const document = {documentElement: {}, defaultView: window, title: 'Current Gramlot'};
    if(gramlot?.src)gramlot.src.renderer={destination:{ownerDocument:document}};
    runInNewContext(bundle, {window, document, MessageChannel, queueMicrotask, Date,
        IntersectionObserver: class {observe() {} disconnect() {}}, console,
        setInterval: () => 1, clearInterval() {}});
    const send = (type, payload = {}, session = 'test') => {for(const listener of listeners.get('message')||[])listener({source:window,
        data:{...message(type,payload),dir:'to-page',session}});};
    send('connect',{session:'test'});
    return {sent,send,window};
}
test('shared agent inspects and edits the page Bag class; stale connection and session are ignored', async () => {
    const data = new Bag(), builder = new GramlotBuilder();
    data.setItem('caption', 'Data');
    builder.root.p('Source', {node_label: 'caption'});
    const source = builder.source;
    const app={state:'started',data,src:{source}};
    Object.defineProperty(app,'source',{get(){throw new Error('Legacy access');}});
    const f=fixture(app);
    try {
        const instanceId=f.sent.find(m=>m.type==='hello').payload.instances[0].instanceId;
        f.send('inspect',{instanceId,connectionId:'first'});
        const initial=await until(()=>f.sent.find(m=>m.payload.data?.snapshot));
        const row=initial.payload.data.snapshot.source[0];
        assert.equal(Bag.fromTytx(row.value.encoded,'json').getItem('value'),'Source');
        const wrapper=new Bag();wrapper.setItem('value','Edited');
        const edit={type:'edit',id:1,command:{root:'source',path:'caption',nodeId:row.id,revision:row.revision,remove:[],set:[],value:wrapper.toTytx('json')}};
        f.send('inspector',{connectionId:'wrong',data:edit});
        f.send('inspector',{connectionId:'first',data:edit},'wrong-session');
        assert.equal(source.getItem('caption'),'Source');
        f.send('inspector',{connectionId:'first',data:edit});
        await until(()=>f.sent.find(m=>m.payload.data?.id===1));
        assert.equal(source.getItem('caption'),'Edited');assert.equal(data.getItem('caption'),'Data');
        f.send('inspector',{connectionId:'first',data:{...edit,id:2}});
        const stale=await until(()=>f.sent.find(m=>m.payload.data?.id===2));
        assert.equal(stale.payload.data.ok,false);
        const edited = f.sent.find(m => m.payload.data?.id === 1).payload.data.snapshot.source[0];
        f.send('inspector', {connectionId: 'first', data: {type: 'insert', id: 3, command: {
            path: 'caption', nodeId: edited.id, revision: edited.revision, tag: 'span', attrs: {title: 'Inserted'},
        }}});
        const inserted = await until(() => f.sent.find(m => m.payload.data?.id === 3));
        assert.equal(inserted.payload.data.ok, true);
        const childPath = inserted.payload.data.selection;
        assert.equal(source.getNode(childPath).getAttr('title'), 'Inserted');
        f.send('inspector', {connectionId: 'first', data: {type: 'undo', id: 4, command: {}}});
        const undone = await until(() => f.sent.find(m => m.payload.data?.id === 4));
        assert.equal(undone.payload.data.ok, true);
        assert.equal(source.getItem('caption'), 'Edited');
        f.send('inspector', {connectionId: 'first', data: {type: 'redo', id: 5, command: {}}});
        const redone = await until(() => f.sent.find(m => m.payload.data?.id === 5));
        assert.equal(redone.payload.data.ok, true);
        assert.equal(source.getNode(childPath).getAttr('title'), 'Inserted');
        f.send('uninspect',{connectionId:'first'});
        assert.equal(Object.keys(data._updSubscribers).length,0);
    } finally {f.send('disconnect');}
    assert.equal(f.window[Symbol.for('gramlot-devtools.agent')],undefined);
});
test('discovery excludes absent, legacy-only and disposed instances', () => {
    for(const app of [undefined,{data:new Bag(),source:new Bag()},{state:'disposed',data:new Bag(),src:{source:new Bag()}}]) {
        const f=fixture(app);assert.equal(f.sent.find(m=>m.type==='hello').payload.instances.length,0);f.send('disconnect');
    }
});
test('the injected agent bundles no application runtime or duplicate Bag class', () => {
    assert.doesNotMatch(bundle,/class Gramlot|class Bag[ {]|class GramlotBuilder|customElements/);
});
