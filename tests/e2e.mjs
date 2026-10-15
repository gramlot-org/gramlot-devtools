// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Headless end-to-end check of the unpacked extension in Chromium.
 * Run after `node build.mjs`: `node tests/e2e.mjs`.
 *
 * Playwright is a development dependency (`npm install`, then
 * `npx playwright install chromium` once).
 * DevTools cannot be opened headlessly, so the panel is opened as a tab
 * (panel.html?tabId=N). That exercises agent, content script, background and
 * panel, but not chrome.devtools.* (panel registration).
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, '..');
const EXT = join(TOOL, 'dist');
const PAGES = join(TOOL, 'test-page');
import {chromium} from 'playwright';

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
    try {
        const body = await readFile(join(PAGES, path || 'index.html'));
        res.writeHead(200, {'content-type': TYPES[extname(path)] || 'application/octet-stream'});
        res.end(body);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = async (name, fn) => {
    try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
    catch (error) { results.push(['FAIL', name, error.stack || error.message]); console.log('FAIL', name, error.stack || error.message); }
};
const errors = [];
const watch = (page, label) => {
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) errors.push(`${label} ${msg.type()}: ${msg.text()}`); });
    page.on('pageerror', error => errors.push(`${label} pageerror: ${error.message}`));
};

const context = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium', acceptDownloads: true,
    // Playwright disables the back/forward cache by default; Chrome has it on.
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
context.setDefaultTimeout(7000);
try {
    let [worker] = context.serviceWorkers();
    worker ||= await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;

    const page = await context.newPage();
    watch(page, '[page]');
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => window.gramlot?.state === 'started');
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({url}))[0].id, `${ORIGIN}/index.html`);

    const panel = await context.newPage(); watch(panel,'[panel]');
    await panel.goto(`chrome-extension://${extensionId}/panel.html?tabId=${tabId}`);
    const ready=()=>panel.waitForFunction(()=>gramlotDevtools.connection?.state==='started');
    await ready();
    const tool=panel.locator('gramlot-tools-inspector');
    const selectNode=async(root,path)=>{
        await tool.getByRole('tab',{name:root==='data'?'Data':'Source',exact:true}).click();
        const tree=tool.locator(`gramlot-poc-tree[data-root=${root}]`);
        const parts=path.split('.');
        for(let i=1;i<parts.length;i++) {
            const ancestor=tree.locator(`[data-node-path="${parts.slice(0,i).join('.')}"]`);
            if(!await ancestor.evaluate(el=>el.parentElement.open))await ancestor.click();
        }
        await tree.locator(`[data-node-path="${path}"]`).click();
    };
    const edit=async(root,path,label,text)=>{
        await selectNode(root,path);const input=tool.getByLabel(label,{exact:true});await input.fill(text);await input.press('Enter');
    };
    const breakpoint=(root,path,mode,condition='')=>panel.evaluate(config=>gramlotDevtools.connection.request('breakpoint',config),{root,path,mode,condition});
    const waitValue=(path,value)=>panel.waitForFunction(({path,value})=>gramlotDevtools.connection?.data.getItem(path)===value,{path,value});
    const logs=[];page.on('console',m=>{if(m.text().startsWith('** Gramlot breakpoint **'))logs.push(m.text());});
    const hit=async(action,count)=>{const before=logs.length;await page.evaluate(action);await panel.evaluate(()=>gramlotDevtools.connection.request('refresh'));assert.equal(logs.length-before,count);};
    await check('shared component is embedded with Data, Source and Styles',async()=>{
        assert.equal(await tool.locator('gramlot-poc-palette').count(),0);
        assert.equal(await tool.getByRole('tab').count(),3);
        assert.deepEqual(await panel.evaluate(()=>gramlotDevtools.violations),[]);
    });
    await check('snapshot preserves nested values, dates and attributes',async()=>{
        const actual=await panel.evaluate(()=>({name:gramlotDevtools.connection.data.getItem('customer.name'),
            born:gramlotDevtools.connection.data.getItem('customer.born').toISOString(),
            currency:gramlotDevtools.connection.data.getNode('customer.orders.o1.total').getAttr('currency'),
            source:gramlotDevtools.connection.source.getNode('main.div_0').getAttr('id')}));
        assert.deepEqual(actual,{name:'Ada',born:'1815-12-10T00:00:00.000Z',currency:'EUR',source:'box'});
    });
    await check('tree selection opens scalar value and attributes',async()=>{
        await selectNode('data','customer.born');
        assert.equal(await tool.getByLabel('Value',{exact:true}).inputValue(),'1815-12-10');
        assert.equal(await tool.getByLabel('note value',{exact:true}).inputValue(),'birth date');
    });
    await check('insert, update, attributes, nested Bags and deletion reach the shared copy',async()=>{
        await page.evaluate(()=>{gramlot.data.setItem('live.branch.value',3,{note:'a'});gramlot.data.setItem('customer.name','Changed');});
        await waitValue('live.branch.value',3);await waitValue('customer.name','Changed');
        await page.evaluate(()=>gramlot.data.getNode('live.branch.value').setAttr({note:'b'}));
        await panel.waitForFunction(()=>gramlotDevtools.connection.data.getNode('live.branch.value').getAttr('note')==='b');
        await page.evaluate(()=>gramlot.data.popNode('live'));await panel.waitForFunction(()=>!gramlotDevtools.connection.data.getNode('live'));
    });
    await check('Data text and typed number edits reach the real page',async()=>{
        await edit('data','customer.name','Value','Grace');await page.waitForFunction(()=>gramlot.data.getItem('customer.name')==='Grace');
        await edit('data','customer.orders.o1.total','Value','99.25');await page.waitForFunction(()=>gramlot.data.getItem('customer.orders.o1.total')===99.25);
    });
    await check('Source attribute edit and removal update page DOM',async()=>{
        await edit('source','main.div_0','class value','y');await page.waitForFunction(()=>document.getElementById('box').className==='y');
        await selectNode('source','main.div_0.p_0');await tool.getByLabel('Remove class',{exact:true}).click();
        await page.waitForFunction(()=>!document.getElementById('note').hasAttribute('class'));
    });
    await check('missing or stale nodes are rejected before mutation',async()=>{
        const error=await panel.evaluate(async()=>{try{await gramlotDevtools.connection.request('edit',{root:'data',path:'missing',nodeId:0,revision:0,set:[],remove:[]});}catch(e){return e.message;}});
        assert.match(error,/changed or was removed/);
    });
    await check('page reload reconnects with fresh values',async()=>{
        await page.reload();await waitValue('customer.name','Ada');await ready();
    });
    await check('service worker restart reconnects and continues live updates',async()=>{
        const count=await panel.evaluate(()=>gramlotDevtools.log.filter(t=>t==='hello').length);
        const cdp=await context.newCDPSession(panel);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');await cdp.detach();
        await panel.waitForFunction(n=>gramlotDevtools.log.filter(t=>t==='hello').length>n&&gramlotDevtools.connection?.state==='started',count);
        await page.evaluate(()=>gramlot.data.setItem('afterRestart',1));await waitValue('afterRestart',1);
    });
    await check('row breakpoint dialog, marks and console action use the shared UI',async()=>{
        await selectNode('data','customer.name');
        const row=tool.locator('gramlot-poc-tree[data-root=data] [data-node-path="customer.name"]');
        await row.hover();await row.getByRole('button',{name:'Breakpoint',exact:true}).click();
        const dialog=tool.getByRole('dialog',{name:'Breakpoint',exact:true});
        await dialog.getByLabel('Breakpoint mode',{exact:true}).selectOption('console');await dialog.getByRole('button',{name:'Save',exact:true}).click();
        await panel.waitForFunction(()=>gramlotDevtools.connection.breakpoints.some(b=>b.path==='customer.name'));
        await hit(()=>gramlot.data.setItem('customer.name','Marked'),1);
        await breakpoint('data','customer.name','');
    });
    await check('breakpoint exact paths, conditions, attribute changes and removal',async()=>{
        await breakpoint('data','customer.orders.o1.total','console','value > 78');
        await hit(()=>gramlot.data.setItem('customer.orders.o1.total',50),0);
        await hit(()=>gramlot.data.setItem('customer.orders.o1.total',80),1);
        await hit(()=>gramlot.data.setItem('customer.orders.o2.total',99),0);
        await breakpoint('data','customer.orders.o1.total','console');
        await hit(()=>gramlot.data.getNode('customer.orders.o1.total').setAttr({currency:'USD'}),1);
        await breakpoint('data','customer.orders.o1.total','');
        await hit(()=>gramlot.data.setItem('customer.orders.o1.total',90),0);
    });
    await check('Source breakpoints survive page reload',async()=>{
        await breakpoint('source','main.div_0','console');await page.reload();await waitValue('customer.name','Ada');
        await panel.waitForFunction(()=>gramlotDevtools.connection.breakpoints.some(b=>b.root==='source'));
        await hit(()=>gramlot.src.source.getNode('main.div_0').setAttr({class:'afterReload'}),1);
        await breakpoint('source','main.div_0','');
    });
    await check('debugger pauses on the writer stack in the shared agent',async()=>{
        const cdp=await context.newCDPSession(page);await cdp.send('Debugger.enable');
        await breakpoint('data','customer.name','debugger');
        const paused=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Debugger did not pause')),7000);cdp.once('Debugger.paused',event=>{clearTimeout(timer);resolve(event);});});
        const write=page.evaluate(()=>gramlot.data.setItem('customer.name','Paused'));
        const event=await paused;await cdp.send('Debugger.resume');await write;await cdp.detach();
        assert.ok(event.callFrames.some(f=>f.functionName==='hit'));await breakpoint('data','customer.name','');
    });
    await check('Styles edits the target root, downloads applied CSS and resets it',async()=>{
        await page.evaluate(()=>document.documentElement.style.setProperty('--gramlot-action','#456bc4'));
        await tool.getByRole('tab',{name:'Styles',exact:true}).click();
        const field=tool.getByLabel('--gramlot-action value',{exact:true});await field.fill('#cc2244');await field.press('Enter');
        await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--gramlot-action').trim()==='#cc2244');
        const link=tool.getByText('Download CSS',{exact:true});await panel.waitForFunction(()=>document.querySelector('gramlot-tools-inspector').shadowRoot.querySelector('a[download]')?.hasAttribute('href'));
        const downloading=panel.waitForEvent('download');await link.click();const download=await downloading;
        assert.equal(download.suggestedFilename(),'theme-overrides.css');assert.match(await readFile(await download.path(),'utf8'),/--gramlot-action: #cc2244 !important;/);
        await panel.screenshot({path:'/private/tmp/gramlot-shared-devtools.png'});
        await tool.getByLabel('Reset --gramlot-action',{exact:true}).click();await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--gramlot-action').trim()==='#456bc4');
    });
    await check('no PoC runtime is loaded into the inspected page',async()=>{assert.equal(requests.some(url=>/poc|inspector/.test(url)),false);});
    await check('disposal and no-instance navigation are reported',async()=>{
        await page.evaluate(()=>gramlot.dispose());await panel.getByText('The Gramlot instance was removed.',{exact:true}).waitFor();
        await page.goto(`${ORIGIN}/plain.html`);await panel.getByText('No Gramlot instance in this page.',{exact:true}).waitFor();
    });
    await check('back/forward cache reconnects the shared inspector',async()=>{
        await page.goto(`${ORIGIN}/index.html`);await waitValue('customer.name','Ada');
        await page.goto(`${ORIGIN}/plain.html`);await panel.getByText('No Gramlot instance in this page.',{exact:true}).waitFor();
        await page.goBack({waitUntil:"commit"});await ready();await waitValue('customer.name','Ada');
    });
    await check('frame selection isolates Data and Source edits',async()=>{
        await page.goto(`${ORIGIN}/frames.html`);
        await panel.waitForFunction(()=>document.getElementById('frame').options.length===2&&gramlotDevtools.connection?.state==='started');
        const entries=await panel.locator('#frame option').evaluateAll(els=>els.map(e=>({id:e.value,title:e.textContent})));
        await panel.selectOption('#frame',entries[0].id);await ready();await edit('data','customer.name','Value','Frame one');
        const frames=page.frames().filter(f=>f!==page.mainFrame());await frames[0].waitForFunction(()=>gramlot.data.getItem('customer.name')==='Frame one');
        assert.equal(await frames[1].evaluate(()=>gramlot.data.getItem('customer.name')),'Ada');
        await panel.selectOption('#frame',entries[1].id);await waitValue('customer.name','Ada');
        await edit('source','main.div_0','class value','second');await frames[1].waitForFunction(()=>document.getElementById('box').className==='second');
        assert.notEqual(await frames[0].evaluate(()=>document.getElementById('box').className),'second');
    });
    await check('visible frames follow tab switches and preserve a manual selection',async()=>{
        await page.goto(`${ORIGIN}/index.html`);await waitValue('customer.name','Ada');
        await page.evaluate(()=>{for(const name of ['first','second']){const wrapper=document.createElement('div');wrapper.id=`tab-${name}`;wrapper.hidden=name==='second';const frame=document.createElement('iframe');frame.src=`index.html?frame=${name}`;frame.style.cssText='width:480px;height:250px';wrapper.append(frame);document.body.prepend(wrapper);}});
        await panel.waitForFunction(()=>document.getElementById('frame').options.length===2
            &&gramlotDevtools.frames.get(gramlotDevtools.frameId)?.url.includes('frame=first')
            &&[...gramlotDevtools.frames.values()].some(frame=>frame.url.includes('frame=second')&&frame.instance&&frame.visible===false));
        await panel.selectOption('#frame','0');await ready();await page.evaluate(()=>gramlot.data.setItem('manualSelection',true));await waitValue('manualSelection',true);
        assert.equal(await panel.evaluate(()=>gramlotDevtools.frameId),0);
        await page.evaluate(()=>{document.getElementById('tab-first').hidden=true;document.getElementById('tab-second').hidden=false;});
        await panel.waitForFunction(()=>gramlotDevtools.frames.get(gramlotDevtools.frameId)?.url.includes('frame=second')&&gramlotDevtools.connection?.state==='started');
        await page.evaluate(()=>document.getElementById('tab-second').remove());await panel.waitForFunction(()=>gramlotDevtools.frameId===0&&gramlotDevtools.connection?.state==='started');
    });
    await check('strict page CSP permits inspection and rejects only conditional breakpoints',async()=>{
        await page.goto(`${ORIGIN}/csp.html`);await ready();await waitValue('customer.name','Ada');
        await assert.rejects(breakpoint('data','customer.name','console','value === "X"'),/unsafe-eval|Content Security Policy/);
        await breakpoint('data','customer.name','console');await hit(()=>gramlot.data.setItem('customer.name','No eval'),1);
        await breakpoint('data','customer.name','');assert.deepEqual(await panel.evaluate(()=>gramlotDevtools.violations),[]);
    });
    await check('closing panel releases the page agent and all subscriptions',async()=>{
        await panel.close();await page.waitForFunction(()=>!window[Symbol.for('gramlot-devtools.agent')]);
        assert.equal(await page.evaluate(()=>Object.keys(gramlot.data._updSubscribers).some(k=>k.startsWith('inspector-bridge-'))),false);
    });
    await check('no unexpected browser errors',async()=>{
        assert.deepEqual(errors.filter(e=>!e.includes('unsafe-eval')&&!e.includes('Refused to evaluate')&&!e.includes('404')),[]);
    });
} finally {await context.close();await new Promise(resolve=>server.close(resolve));}
console.log(`${results.filter(([status])=>status==='PASS').length}/${results.length} checks passed`);
if(results.some(([status])=>status==='FAIL'))process.exitCode=1;
