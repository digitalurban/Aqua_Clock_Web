# Vendored from Desktop Habitats

`math.js`, `water.js`, `environment.js`, `foliage.js`, `broadleaf.js`, `plants.js` and
`stemplants.js` are taken from
[chaseleantj/desktop-habitats](https://github.com/chaseleantj/desktop-habitats) (its
*Riverscape* scene), MIT, (c) 2026 Chase Lean. The licence is alongside them in
`LICENSE-desktop-habitats`. They are the scene's substrate, stones, driftwood, moss,
planting, foliage and water lighting.

`math.js` and `foliage.js` are unchanged. Every other change is marked
`PATCH (Aqua Clock)` in the source and is one of eight kinds:

1. **Textures** (`environment.js`): the Poly Haven maps are loaded from inlined data URIs
   rather than a relative `assets/` path, because the page is a single self-contained file.
2. **Surface focusing** (`water.js`): the focusing term, which is light refracted through a
   rippled surface, is forced to 1. It is physically right and it is also light that travels
   across the scene, which this tank is not to have. The wavelength-dependent extinction is
   untouched, so the water keeps its colour and loses its motion.
3. **Level of detail** (`environment.js`, `plants.js`, `broadleaf.js`, `stemplants.js`, plus
   the new `lod.js`): counts and tessellation that Habitats hard-codes are read through a
   dial, so a phone can run a lighter scene. With the `rich` profile the dial is 1 and
   every value is exactly Habitats' own.

4. **No driftwood** (`environment.js`): the `BRANCHES` list is empty, so the tank has no wood.
   Two places in Habitats' code assumed at least one branch (the sheltered sand reads the first
   branch's base; the moss fronds are scattered over the wood) and are guarded. The four moss
   colonies that belonged to Habitats' trunk are replaced with two on our stones.
5. **Bark on thick wood** (`environment.js`, `branchGeometry`; unused while there is no wood): Habitats' branches are all thin,
   so its bark texture is mapped once round the circumference. On our thick driftwood that
   stretches it into horizontal slabs, so it is repeated in step with the circumference (a whole
   number, so it still meets itself at the seam) and the splits are made shallower on thick pieces.
   Its surface is also smoothed into long grain: the ridges barely twist, the weathering is broad
   rather than warty, the knot and the splits are smaller, and the bark relief is softer.
6. **Water colour** (`water.js`): the extinction constants `(0.020, 0.008, 0.012)`, which let
   green through furthest, are replaced with `(0.022, 0.0085, 0.0055)`, which lets blue through
   furthest. The model is untouched; only the colour it produces changes.
7. **Layout data** (`environment.js`, `plants.js`, `stemplants.js`): six stones appended to
   `ROCKS` (so no existing index moves), among them a tall upright stone where the wood was; a
   stand of stem plants behind it and low rosettes round the stones; the grass beds re-weighted (the right bed heavier, the
   middle-back thinned and lowered); the middle-back feathery stand lowered; and the three
   fern tufts that sat on Habitats' trunk moved into the crevices of our stones.

8. **Sand width** (`environment.js`): the sand mesh is 44 wide, not 24, with the vertex density
   kept (367 segments across, not 200) and its texture repeated 18 times across it, not 10, so
   the grain stays the same size. Habitats' 24 is just wide enough for its own lens; this
   project's full screen view is wider, and showed the ends of the sand as the edges of an
   island. The ground's shape is an analytic function, so nothing else depends on the width.

The Poly Haven textures (`../textures.js`) are CC0: Rock Boulder Dry, Rough Wood and
Sand 01, downscaled to 512px. See `THIRD-PARTY.md` at the repo root.

Everything above this folder (the shoal and the clock, the clownfish, the bubbles, the
fog, the air stone and pump) is ours.
