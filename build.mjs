// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Build the unpacked Chrome extension into ./dist and, when the Gramlot
 * runtime is available, copy it into ./test-page/vendor for the test page.
 * Run after `npm install`: `node build.mjs`.
 *
 * GRAMLOT_RUNTIME  path of Gramlot's built `dist/gramlot.js`, used only by the
 *                  test page. Default: a sibling checkout of gramlot-org/gramlot
 *                  (`../gramlot/js/dist/gramlot.js`). Only read.
 */
import {cpSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const GRAMLOT_RUNTIME = process.env.GRAMLOT_RUNTIME || resolve(HERE, '../gramlot/js/dist/gramlot.js');
const DIST = join(HERE, 'dist');
rmSync(DIST, {recursive: true, force: true});
mkdirSync(DIST, {recursive: true});

const common = {bundle: true, minify: false, sourcemap: false, logLevel: 'warning', target: 'chrome120', legalComments: 'none'};
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
// Preserve the package's bundled notices alongside the extension's own license.
for (const name of ['LICENSE', 'NOTICE']) cpSync(join(HERE, name), join(DIST, name));
cpSync(join(dirname(fileURLToPath(import.meta.resolve('@gramlot/gramlot/runtime'))), 'runtime-notices.json'),
    join(DIST, 'runtime-notices.json'));
// Test page: the Gramlot runtime is copied, never built or modified in place.
if (existsSync(GRAMLOT_RUNTIME)) {
    mkdirSync(join(HERE, 'test-page/vendor'), {recursive: true});
    cpSync(GRAMLOT_RUNTIME, join(HERE, 'test-page/vendor/gramlot.js'));
} else {
    console.log(`test page runtime not copied: ${GRAMLOT_RUNTIME} not found (set GRAMLOT_RUNTIME)`);
}
console.log('built', entries.map(entry => entry.in).join(', '), '->', DIST);
