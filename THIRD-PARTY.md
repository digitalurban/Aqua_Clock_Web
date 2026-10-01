# Third-party notices

## Desktop Habitats (Riverscape scene): MIT

<https://github.com/chaseleantj/desktop-habitats>

Seven modules are vendored in `src/scene/riverscape/` (`math.js`, `water.js`,
`environment.js`, `foliage.js`, `broadleaf.js`, `plants.js`, `stemplants.js`). The
changes are listed in `src/scene/riverscape/NOTICE.md` and marked
`PATCH (Aqua Clock)` in the source.

Also **adapted, not vendored as a file**: the fish body-wall light transport in
`src/scene/riverscape.js` (the constants `MUSCLE_ABSORPTION`, `TISSUE_SCATTER` and
`MUSCLE_FLOOR`, and the `fishThrough` shading formula) is taken from Habitats'
`fish-anatomy.js`. The fish *geometry* is not: Habitats models a bloodfin tetra with its
own station table, and this project has its own for a neon tetra and a clownfish.

The licence text below must accompany all of it.

```
MIT License

Copyright (c) 2026 Chase Lean

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Poly Haven textures: CC0

Downscaled to 512px and inlined in `src/scene/textures.js`. CC0 needs no attribution;
it is given anyway.

- Rock Boulder Dry: <https://polyhaven.com/a/rock_boulder_dry>
- Rough Wood: <https://polyhaven.com/a/rough_wood>
- Sand 01: <https://polyhaven.com/a/sand_01>

## three.js: MIT

<https://github.com/mrdoob/three.js>, loaded at version 0.169.0 from jsDelivr by an
import map. Copyright the three.js authors.

## Inter: SIL Open Font License 1.1

Loaded from Google Fonts. Copyright the Inter Project Authors
(<https://github.com/rsms/inter>).

## city-clock

The seven-segment clock mechanism is ported from
<https://github.com/digitalurban/city-clock>, by the author of this repository.

## Test tooling (development only, not shipped)

`@sparticuz/chromium` and `puppeteer-core`, used by the scripts in `tools/`.
