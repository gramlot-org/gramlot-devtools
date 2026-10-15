// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Adapted copy of js/pages/src/builder.js (gramlot-poc).
// Changes: only the collections used by the inspector recipe are registered
// (layout, storeTree, palette), and no InspectorController is attached, since
// the panel is itself the inspector.
import {HtmlBuilder} from 'gramlot-dom';
import '/_assets/dom/collections/layout.js';
import './panel-tree.js';
import '/_assets/dom/collections/palette.js';

export class PanelBuilder extends HtmlBuilder {
    get root() { return this.source; }
    static data_recipe_alias = true;
    static wc_requires = ['layout', 'storeTree', 'palette'];
}
