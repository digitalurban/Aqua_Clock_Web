# Vendored from Desktop Habitats

`math.js`, `water.js`, `environment.js`, `foliage.js`, `broadleaf.js`, `plants.js` and
`stemplants.js` are taken from
[chaseleantj/desktop-habitats](https://github.com/chaseleantj/desktop-habitats) (its
*Riverscape* scene), MIT, (c) 2026 Chase Lean. The licence is alongside them in
`LICENSE-desktop-habitats`. They are the scene's substrate, stones, driftwood, moss,
planting, foliage and water lighting.

`math.js` and `foliage.js` are unchanged. Every other change is marked
`PATCH (Aqua Clock)` in the source and is one of three kinds:

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

The Poly Haven textures (`../textures.js`) are CC0: Rock Boulder Dry, Rough Wood and
Sand 01, downscaled to 512px. See `THIRD-PARTY.md` at the repo root.

Everything above this folder (the shoal and the clock, the clownfish, the bubbles, the
fog, the air stone and pump) is ours.
