// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Bag classes of the panel copies.
 *
 * Gramlot's Source is a @jsr/genro__builders SourceBag, TYTX suffix 'SOURCE'.
 * The PoC runtime has its own SourceBag, suffix 'XS'. The panel registers a
 * plain Bag subclass for 'SOURCE' so a Source snapshot decodes with its
 * branch type, without bundling the Gramlot builder.
 */
import {Bag} from 'genro-bag-js';
import {registerClass} from 'genro-tytx';
import {SourceBag} from 'gramlot-dom';

export class GramlotSourceCopy extends Bag {
    static tytxSuffix = 'SOURCE';
}
registerClass(GramlotSourceCopy);

export const BAG_CLASSES = {X: Bag, XS: SourceBag, SOURCE: GramlotSourceCopy};
