// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import {Gramlot, GramlotBuilder} from '@gramlot/gramlot';
import {InspectorConnection, attachInspectorAgent} from '@gramlot/gramlot/tools/inspector';
const app = new Gramlot({element: document.querySelector('main'), transport: false});
const builder = new GramlotBuilder(); builder.root.p('^name');
app.data.setItem('name', 'Shared inspector'); app.src.startSource(builder.source);
const channel = new MessageChannel(); attachInspectorAgent(app, channel.port1);
const connection = new InspectorConnection(channel.port2);
const tool = document.querySelector('gramlot-tools-inspector');
tool.targets = [{id: 'fixture', title: 'Fixture', connection}];
globalThis.fixture = {app, connection};
