// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Build the unpacked Chrome extension into ./dist and the test page runtime
 * into ./test-page/vendor. Run from this folder: `node build.mjs`.
 *
 * No global or local npm install: esbuild and the Bag/TYTX packages are
 * resolved from existing checkouts. Override the defaults with:
 *   GRAMLOT_JS        Gramlot js/ folder (esbuild, @jsr/genro__bag, @jsr/genro__tytx,
 *                     dist/gramlot.js for the test page). Only read.
 *   POC_NODE_MODULES  node_modules providing the third-party packages that the
 *                     PoC runtime imports. Only read.
 */
import {cpSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const POC = resolve(HERE, '../..');
const GRAMLOT_JS = process.env.GRAMLOT_JS || '/Users/gporcari/Sviluppo/gramlot/gramlot/js';
const POC_NODE_MODULES = process.env.POC_NODE_MODULES
    || (existsSync(join(POC, 'js/dom/node_modules')) ? join(POC, 'js/dom/node_modules')
        : '/Users/gporcari/Sviluppo/gramlot/gramlot-poc/js/dom/node_modules');
const JSR = join(GRAMLOT_JS, 'node_modules/@jsr');
const {build} = await import(join(GRAMLOT_JS, 'node_modules/esbuild/lib/main.js'));

const DIST = join(HERE, 'dist');
rmSync(DIST, {recursive: true, force: true});
mkdirSync(DIST, {recursive: true});

// The PoC runtime imports bare `gramlot-dom`, `genro-bag-js`, `genro-tytx` and
// `/_assets/dom/...`. Bag and TYTX are the @jsr packages used by Gramlot, so
// panel and page share library versions and TYTX suffixes.
const resolver = {name: 'gramlot-devtools', setup(b) {
    b.onResolve({filter: /^\/_assets\/dom\//}, a => ({path: join(POC, 'js/dom/src', a.path.slice(13))}));
    b.onResolve({filter: /^gramlot-dom$/}, () => ({path: join(POC, 'js/dom/src/index.js')}));
    b.onResolve({filter: /^genro-bag-js$/}, () => ({path: join(JSR, 'genro__bag/src/index.js')}));
    b.onResolve({filter: /^genro-tytx$/}, () => ({path: join(JSR, 'genro__tytx/js/src/index.js')}));
}};

const common = {
    bundle: true, minify: false, sourcemap: false, logLevel: 'warning', target: 'chrome120',
    nodePaths: [POC_NODE_MODULES, join(GRAMLOT_JS, 'node_modules')],
    plugins: [resolver], loader: {'.tytx': 'text'},
    legalComments: 'none',
};
const entries = [
    {in: 'src/panel.js', format: 'esm'},
    {in: 'src/feasibility.js', format: 'esm'},
    {in: 'src/devtools.js', format: 'iife'},
    {in: 'src/background.js', format: 'esm'},
    {in: 'src/content.js', format: 'iife'},
    {in: 'src/agent.js', format: 'iife'},
].filter(entry => existsSync(join(HERE, entry.in)));
for (const entry of entries) {
    await build({...common, entryPoints: [join(HERE, entry.in)], format: entry.format,
        outfile: join(DIST, entry.in.slice(4))});
}
for (const file of ['manifest.json', 'devtools.html', 'panel.html', 'panel.css', 'feasibility.html']) {
    if (existsSync(join(HERE, 'src', file))) cpSync(join(HERE, 'src', file), join(DIST, file));
}
// Unchanged PoC stylesheet, loaded by the inspector through import.meta.url.
cpSync(join(POC, 'js/pages/src/inspector.css'), join(DIST, 'inspector.css'));

// Test page: the Gramlot runtime is copied, never built or modified in place.
mkdirSync(join(HERE, 'test-page/vendor'), {recursive: true});
cpSync(join(GRAMLOT_JS, 'dist/gramlot.js'), join(HERE, 'test-page/vendor/gramlot.js'));
console.log('built', entries.map(entry => entry.in).join(', '), '->', DIST);
