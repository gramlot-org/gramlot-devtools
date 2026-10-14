// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Passive panel copies preserve Gramlot Source's X subtype without a renderer or builder. */
import {Bag} from '@genrojs/bag';
import {getSubtypeDict, setSubtypeDict} from '@genrojs/tytx';

export class GramlotSourceCopy extends Bag {}

// The wire name identifies the inspected class; the local copy has only Bag behavior.
setSubtypeDict('X', {...getSubtypeDict('X'), GramlotBuilderBag: GramlotSourceCopy});
export const BAG_CLASSES = {X: Bag};
