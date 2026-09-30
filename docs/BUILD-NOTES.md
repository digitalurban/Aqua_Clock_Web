# Build notes

Revision 5 (latest first). Earlier revisions follow.

## Revision 5: food

Food pellets are smaller. They were 0.11 units in radius, about 17px across on a
720p-tall screen, when they were first made visible; now 0.05, about 7px. Measured by
painting them magenta and counting pixels: 14 pellets in view, drawn, not culled.

---

## Revision 4: full screen view, food drawn, air stone

## Full screen view

A **Full screen** button (top right) hides every piece of text and the darkening
overlay, leaving the tank. `F` toggles it, `Esc` leaves it, and `#full` or
`?view=full` on the URL starts in it (for a nightstand bookmark or a home-screen
icon). Where the browser has the Fullscreen API it goes truly fullscreen as well;
iPhone Safari does not have it, and an embedding frame may forbid it, so the view
hides the text either way.

Nothing on screen is text. Three icon-only buttons (show the time, feed the fish,
exit) appear on any movement or touch and fade after three seconds; they carry
`aria-label`s but no visible words and no tooltips.

Checked with a script that walks every text node and asks the browser whether it is
visible: normal view lists all the words; full view with the controls showing lists
none, with 3 icon buttons; full view idle lists none and 0 buttons. `Esc`, `F`,
`#full` and the feed icon all work. For a chrome-less view on iPhone, use
Share > Add to Home Screen (the page carries the `apple-mobile-web-app-capable`
meta tags) — untested on a device, and I have not confirmed the `#full` fragment
survives being added.

## Food drops were never drawn — fixed

The pellet `InstancedMesh` starts with no instances, so three.js computed an empty
bounding sphere (radius -1) on its first frame and never recomputed it: the mesh was
frustum-culled forever. 14 pellets in the tank, all inside the camera's view, zero
pixels drawn. Not Safari: no browser ever showed them. Fixed with
`frustumCulled = false`; the pellets are also a little bigger with a warm self-lit
floor. Verified by painting them magenta: 0 pixels before, 1,240 after.

## Air stone

To the right of the digits, so the plume does not cross the time, placed from the
screen shape and re-placed when it changes. Placing it for screen height alone put it
at z 0.1, where foreground plants hide it (measured: 72-78% visible at z 2.0, 15-25%
at z 0.4-1.2), so it now goes as far forward as the frame allows. The digits sit 3%
left of centre in landscape and are narrower and left-shifted when upright, to make
room. Verified in one 960x540 frame; the other screen shapes were checked for
clearance before the last retarget and not re-checked since.

---

# Aqua Clock Info — V3, revision 3

## It is a web page now

The preview page is the product, so it no longer advertises an app: the app icon,
the "Get app" pill, "Download on the App Store" and the dead nav links (Features,
The tank, Privacy — they pointed at `#`) are gone. What is left is a text wordmark,
the headline, **Show the time** and **Feed the fish**. The copy now says the tank
"lives in your browser", the footer hint says "cursor or finger", and the title is
"Aqua Clock — where the fish tell the time".

On a phone held upright the words move to the bottom, over the empty substrate, and
the paragraph and stats are dropped, so nothing sits across the stacked digits. The
digit stack also sits higher on upright screens. `100dvh` is used where supported,
because iOS Safari's `100%` can be taller than what is actually visible.

`src/App.tsx` (the React marketing page from V2) is untouched and still has its App
Store links. It is not the page described above.

## The flickering dots on iPhone — root cause and fix

**Cause.** Riverscape's foliage material uses `alphaToCoverage: true`, written for a
multisampled framebuffer (its own comment refers to "the four multisamples").
Alpha-to-coverage does nothing useful without MSAA: it degrades to a dither, and thin
swaying blades break into a stipple of dots. My renderer turned MSAA **off** whenever
the device pixel ratio was 1.3 or more, which is every iPhone (3x) and every retina
Mac. It also capped the lite profile's pixel ratio at 1, so a 3x screen was fed a 1x
canvas that the browser stretched threefold.

Reproduced by emulating a 3x touch phone (390x844):

| | before | after |
| --- | --- | --- |
| multisampling | none (`samples: 0`) | 4x |
| canvas backing store | 390 x 844 | 728 x 1577 |
| isolated-pixel rate in the plant band | 893 per 10,000 px | 156 per 10,000 px |

and a side-by-side of what a 3x screen shows: stippled blades before, continuous
blades after.

**Fix.** MSAA is always on. The pixel ratio comes from a budget (1.15 M device pixels
on lite, 2.3 M on rich, capped at the device's own ratio and at 2) instead of a fixed
cap: a phone's small CSS size buys about 1.9x, a large tablet close to 1x. The
resolution governor now stops at 0.75 instead of 0.5, so it can no longer drop the
canvas back into the range where the dots return.

**Not verified.** This was reproduced in desktop Chromium on software GL, not in
Safari on an iPhone. The mechanism (no MSAA, so alpha-to-coverage dithers) is general,
but I cannot see your phone. The cost is real: MSAA at nearly 2x is more GPU work than
the old 1x, unmeasured on any device. If an older iPhone or iPad runs warm or stutters,
lower the lite budget in `fitPixelRatio()` before touching anything else.

---

# Aqua Clock Info — V3, revision 2

Changes since the first V3, all checked in a real browser (lite profile, desktop
Chromium on software GL). See DEVICE-TESTING.md for what that does not cover.

## Clownfish behaviour — rewritten

Measured first, over 3 simulated minutes, with `tools/probe-clowns.mjs`:

| | before | after |
| --- | --- | --- |
| position teleports (>0.35 u in one frame) | female 4, male 8 | 0, 0 |
| instant turns (>0.6 rad in one frame) | 41 and 37 | 0, 0 |
| peak turn rate | ~94 rad/s | ~11 rad/s (the shimmy) |
| male at top speed | 100% of the time | median 0.5 u/s, still 31% of the time |
| reach food after feeding (highest y; pellets start ~9) | 4.1 and 2.1 | 7.2 and 7.2 |
| pellets eaten over three feedings | 0 | female 21, male 20 |

What was wrong: `facing = velocity.x >= 0 ? 1 : -1` fed straight into the rotation, so
a fish reversed in a single frame; a leash that shrank from 14 to 4.4 units after a
foray *copied the position* back onto the leash sphere, teleporting the fish; food
was ignored; and depth movement made them crab sideways.

Now: acceleration-limited stop-and-go, orientation following velocity through a turn
limit (depth counts for less than lateral, so they stay mostly side-on), nose-down
browsing and a shimmy in the anemone, occasional circuits of the tank, a dash for
food (the female is quicker; the male takes the next pellet rather than contesting
hers), and a bolt for the tentacles if the cursor comes near. Pectoral rowing rate is
driven per fish from its effort. Nothing moves a fish by assigning its position.

A second cause was found on the way: the anemone sits 0.56 units from a boulder's
surface, inside the obstacle push zone, so targets near it were unreachable and fish
hovered at the edge of the push. Targets must now be clear of rock, the push zone
is much tighter, and a fish that stops making progress for ~1 s picks somewhere else.

Not measured: how the clowns compete with the neons for food. The test runs 180
simulated seconds in under a real second, and the shoal's clock mode follows the
real wall clock, so the neons may have been stuck on their stations throughout.

## Air stone

Half-buried in the sand rather than sitting on it, and clear of the driftwood limb.
Three attempts, each checked in a rendered frame: centre 0.03 below the ground at
x 1.0 buried it to a sliver; centre 0.05 above the ground at x 0.35 left it ~90%
exposed with the wood tip touching its end; now x -0.25, centre 0.09 below the
lowest ground under it, which shows roughly the top 45%.

## Portrait screens — found and fixed

On an iPhone held upright the visible slice of tank was ~4 units wide, so four
digits were crushed into 2.5 units, narrower than the fish are long: an unreadable
clump. Below an aspect of 0.9 the digits now stack, hours over minutes, filling the
width; the lens widens as the screen narrows (to at most 42 degrees) and tilts up so
the edge of the substrate stays out of frame.

## Also

- Feeding drops 14 pellets, not 10.
- `habitat.debug` exposes the clownfish state, the obstacle list and the anemone
  position, for the test tools.

---

V3 is V2 (the Habitats-based tank with the clock) plus what a real browser showed
was missing. It is a new version alongside V2, which is untouched.

## What is new

**Bubbles that can be seen.** `src/scene/bubbles.js`. V2's air-stone bubbles were
0.13-unit additive points: about two pixels across in dark fog, which is to say
invisible — arithmetic, not tuning. They are now instanced glassy sprites: a bright
Fresnel rim, an almost clear body, a specular glint from the key light, a fainter
reflection of the far side, and a dark hairline edge. Below ~7px that structure
cannot be resolved, so it collapses to a soft dot, and nothing is drawn smaller
than ~2.7px. Three sources:
- the **air stone**: a dense plume that widens and grows as it rises (pressure
  falls) and wobbles harder the bigger the bubble is;
- the **pump**: fine micro-bubbles it entrains and throws across the tank;
- **pearling**: single bubbles letting go from leaves now and then.
Bubbles are depth-tested, so a plant in front hides one behind it, and tinted by
the water model's own per-channel absorption. 230/s from the stone on rich, 115/s
on lite.

**A visible air stone.** A pale porous cylinder rather than a black one, on open
sand (x 1.0, z 0.4). Measured with a magenta probe at the earlier position (1.0,
1.3) it was 86% unoccluded; it moved up because the page's bottom scrim dimmed it.

**Per-channel water fog.** Three's exponential fog fades every channel equally.
Water does not: red goes first, so with distance a tank turns green-teal rather
than grey. Patched into `ShaderChunk.fog_fragment`. `?fog=grey` restores stock fog
for an A/B; the difference is subtle and I have not compared them side by side.

**Fixed: the anemone.** Seen in a real render for the first time: thin blades under
the hard key light went white on one face and black on the other. Now matte with a
low self-lit floor, shorter and softer.

**Fixed: the page scrim.** It was still the blue-tinted one from the bright-blue
phase, tinting a green tank. Retinted and lightened.

**`habitat.advance(seconds)`** fast-forwards the simulation without drawing. Real
browsers under software GL manage about 1 fps, so this is the only way to test the
clock's formation there.

## How this was checked, and what was not

A real headless Chromium with WebGL2 (ANGLE over SwiftShader) runs the actual page;
`tools/` has the scripts. No shader errors, no page errors. In the **lite** profile:
- the bubble layer, isolated on black, measured at 196+ visible bubbles, median
  4.9px across, plume half-width growing 29 to 81px with height (before the
  density increase);
- after `advance(14)` the 84 neons sit on the seven-segment layout, and the rendered
  digits match the page clock (14:59, then 15:02);
- the anemone and stone were checked in rendered frames.

**Not verified:** the *rich* profile in a browser (it crashes on capture under
software GL — its bubble rate and the shadowed scene are unchecked here); frame
cost on any real device; iOS/Safari; the fog A/B; the pump's micro-bubble stream,
which is faint in the frames I captured.

## What deliberately is not here

No moving light: no caustics, light shafts or surface shimmer. You asked for those
to go, and the water surface sits above the top of the frame anyway.

---


**The tank is Desktop Habitats' Riverscape, vendored, not imitated.**
`src/scene/riverscape/` holds its own `environment.js`, `plants.js`,
`foliage.js`, `broadleaf.js`, `stemplants.js`, `water.js` and `math.js` —
MIT, © 2026 Chase Lean — with two documented patches. See
`src/scene/riverscape/NOTICE.md`.

Ten rounds of reimplementing that environment by hand never came close. The
substrate, stones, driftwood, moss, planting, thickets, suspended matter and
water model are all theirs now, as is the light rig. What is ours sits on top:
the shoal that tells the time, the clownfish pair and their anemone, the pump
and the air stone. The scene therefore lives in Riverscape's coordinates —
substrate near y 0, surface at y 10, camera well back on a 25.8° lens.


The landing page now runs a live WebGL aquascape instead of a CSS gradient with
floating bubbles. Visual direction follows [Desktop Habitats / Riverscape](https://github.com/chaseleantj/desktop-habitats):
deep green-black water, exponential fog, ACES filmic tone mapping, sand
substrate, swaying rivergrass, sunlight shafts and caustics.

## What changed

| | V1 | V2 |
| --- | --- | --- |
| Background | `bg-gradient` blue + 35 animated divs | Three.js scene, `#050f0c` water, `FogExp2 #16312a` |
| Palette | cyan/blue SaaS | freshwater green with warm sand accent `#e9d6a9` |
| Hero | static screenshot in a phone mockup | the real thing, running |
| Type | weight 300–500, gradient text fills | weight 200–400, tighter tracking, no gradient text |
| Interaction | none | cursor shyness, **Feed the fish** button |

## The scene

`src/scene/riverscape.js` — one file, no addons, ~600 lines.

- **Substrate** — displaced plane, rising toward the back, plus 620 instanced gravel pieces.
- **Hardscape** — 6 jittered icosahedron boulders, two pieces of driftwood.
- **Planting** — 2,390 instanced blades and leaves. Sway is done in the vertex shader via `onBeforeCompile`, with a per-instance `aPhase` attribute, so it costs nothing on the CPU. The centre is deliberately left clear so the shoal stays readable.
- **Framing** — Riverscape's lens: 25.8° from well back, fitted to a tank this size. A long lens gives real perspective and real depth with almost no convergence, so the image reads flat and photographic rather than like a diorama seen from one corner. A substrate that recedes and rises toward the back, and ~2,700 instanced plants composed rather than scattered. The water is back to Riverscape's own dark green: a near-black gradient with `FogExp2 #16312a` at 0.030, a hard key light at 5.2 and very little ambient. This reverses the earlier move towards a bright blue lit aquarium — the two are not compatible, and the brief is to look like Riverscape.
- **Clownfish** — a pair of *Amphiprion ocellaris* on their own host anemone, outside the clock entirely. Built from their own station table, not a scaled tetra: stocky and oval, greatest depth a little over half the standard length against a characin's 29%, large head, deep peduncle. Fins to match — a continuous dorsal notched between eleven spines and the soft rays behind, rounded caudal, long anal, and the broad rounded pectorals it actually swims with.
  - **Markings** are painted in the fragment stage, not per vertex. Three white bars inside narrow black margins: one behind the eye across the preoperculum, one from between the spinous and soft dorsal down to the anal fin with its centre bulging towards the head, one over the caudal peduncle; every fin rimmed in black just inside a small clear margin. A margin that fine is a couple of hundredths of a unit wide — far below the mesh — so painting it per vertex loses it entirely.
  - **A trap worth knowing about**: three caches compiled programs by a key that defaults to the *source of* `onBeforeCompile`. Both fish materials share that function, so the clownfish was silently handed the neon's compiled program — right geometry, wrong shader, no `FISH_CLOWN` define, no bars, and a characin's swimming action. Each fish material now sets its own `customProgramCacheKey`.
  - **Not enlarged.** A deeper body with a big forward-set eye was tried and rolled back: it read as a glare rather than as cute. The eye keeps its own scale, with a warm iris and a small catchlight — which is what stops it reading as a hole without making it stare.
  - **Hardscape**: `createEnvironment` returns a list of sphere obstacles for the stones and the driftwood, which we were discarding — so fish swam straight through the rock. Both the shoal and the clownfish now push off them the way their own fish do. Measured over two simulated minutes: closest approach went from −0.53 (inside the stone) to +0.10, and time spent inside the hardscape from 0.10% to none.
  - **Territory**: mostly they work the water over the anemone, but roughly one target in three is a wider circuit of the tank before they come back — about 7 to 8 units of travel across five minutes rather than the 3.6-unit leash they were on, which read as a fish stuck in one corner. Alarm still sends them straight home.
  - **Behaviour**: clownfish row with their pectorals rather than beating their body (labriform swimming), so the shader barely bends them and rows the pectorals instead; the rising-and-falling tilt that earned them the name is a pitch oscillation coupled to the bob. They are site-attached — they hold within about two units of the anemone, and back into its tentacles when the cursor comes near. The pair sit in the size-based hierarchy they live in: the larger female holds the water just above the host, the smaller male works its edge and yields to her rather than sharing her station.
- **Textured surfaces** — sand, stone and driftwood carry Poly Haven's CC0 maps (Sand 01, Rock Boulder Dry, Rough Wood), the same set Riverscape uses, downscaled to 512px and inlined as data URIs so a published page stays self-contained. Flat colours were most of why this did not look like the reference: stone and wood read as plastic without a diffuse map and a normal to break the light up.
- **Hardscape** — one large piece of driftwood laid diagonally across the frame with limbs off it, boulders at its feet, and the planting behind. Riverscape is composed around that feature; without one the tank is a hedge with fish in front of it.
- **Offline renderer** — `harness.mjs` builds the real scene graph in node by stubbing the renderer, the PMREM generator and the browser globals, then dumps every geometry and instance matrix; `render.py` rasterises that from the scene's own camera with a z-buffer and the scene's fog. It is not the real shader — no water model, no subsurface, no scale grid — but it shows the *composition*: what is where, how dense the planting is, and whether the back of the tank is empty. Run `node harness.mjs && python3 render.py` after changing placement.
- **Planting** — built the way Riverscape's is, in **beds of clumps** rather than uniform scatter. Uniform scatter is precisely what makes planting look thin: a real bed is dense clumps with bare substrate between them and stray runners around the edges. Each clump is a rosette of ribbon leaves where the older outer leaves are longer, paler, and lean further than the young centre. Over that: 36 stem stands carrying paired leaves up towards the light, which is what fills the upper half of the background that grass alone leaves empty; broadleaf clusters at the sides, some ruddy; and moss taking the upper faces of the eight boulders, which is where it actually grows.
- **Bubbles** — three sources now. The air stone's column on the right, oxygen pearling off the planting wherever there are leaves (110, up from 45), and a curtain of fine bubbles along the back wall behind the planting (190).
- **Furniture** — this app's, not Riverscape's, and without the boxy trim: pump on the **left** glass with its nozzle blowing a current left to right, air stone on the **right** (200-bubble column that frays as it rises, airline up the corner), 45 slower bubbles pearling off the planting. No visible tank trim or silicone seams — those were what made it read as a diorama.
- **Performance** — the fish are the scene: 86 of them at ~1,680 triangles each is 144k, and before this pass they went through the shadow map too, doubling it. They no longer cast: their shadows landed in open water where nothing receives them. Body mesh down from 46×22 to 34×18, fin steps from 5 to 3, plants from 2,570 to 1,620, gravel from 900 to 460, motes from 520 to 280, sand from 74×48 to 44×30, shadow map from 1024 to 768. Separation, the only O(n²) work in the frame, now compares squared distances and is skipped for any fish under orders. Multisampling is off on dense displays, where the pixels are already smaller than the aliasing. On top of all that a resolution governor watches the frame time and gives back pixel ratio in steps down to 0.6 until the machine keeps up, with hysteresis so it settles rather than oscillates.
- **One water model** — ported from Habitats' `water.js`. Rather than each material guessing what underwater looks like, every lit surface in the tank is wrapped by `waterLitShader`, which redefines `RE_Direct` so direct light arrives *through* the water: focused and defocused by the rippled surface above, then attenuated along its optical path, which takes red out several times faster than blue. The path here is depth below the surface **plus** distance back from the front glass, so something at the back of the tank is bluer than the same thing pressed against the glass — that, not fog, is what carries depth now. Habitats' surface *focusing* term is deliberately not included: it is the physically right thing and it is also light that roams, which this tank does not want. Nor does the waterline shimmer animate — its ripple pattern is fixed. Nothing in this tank casts light that travels. Only the extinction survives, so the water keeps its colour and loses its motion.
- **Subsurface transport through the fish** — Habitats' `perLight` model. Every vertex carries the optical path through the tissue at that point (the width of the body section, floored at the skin), so light entering the far face is absorbed along that path with muscle coefficients of 34, 84 and 109 per unit — blood and myoglobin take green and blue out far faster than red — then scattered back towards the eye through a wrap-around lobe. A neon lit from behind glows warm where it is thin: the peduncle, the dorsal and ventral ridges, and the fins, which carry their own membrane path and carotenoid density.
- **Scales** — imbricate rows, 34 along the lateral series and 22 around, each row offset half a scale and running slightly diagonally. `fwidth` fades the detail out rather than aliasing once a cell falls under a pixel, which at landing-page size is most of the time.
- **Light** — Riverscape's own rig, read off `main.js` rather than approximated: a hard warm key (`0xfff8ee`, 4.5) from above and in front, a weak cool fill (`0xc2d8e4`, 0.44) from the viewer's side, a yellow-green backlight (`0xdbf9ba`, 0.8) coming through the planting, a low hemisphere (`0xc3d7bd`/`0x353427`, 0.3), and **no ambient term at all**. Ambient is what had been greying the water. The environment strip is an HDR white at 3.7 rather than a plain colour.
- **Algae** — the thing that actually makes a tank green, and the piece I had missed. Every hard surface carries a film: young growth is olive and thin, established growth is dark green turf, and it settles on what faces up and collects in the hollows. Sand gets a browner, diatom film; stone and wood a greener one. Habitats bakes the growth weight per vertex from exposure; this drives it from the surface normal and world-position noise, which is the same idea more cheaply. Surface tints are theirs too (`0xf4e5c8` sand, `0x62665d` stone, `0xc3ad8e` wood) — light paint, with the darkness coming from the rig.
- **Light (previously)** — a warm key at 4.1 doing nearly all the work, with only a little ambient and hemisphere behind it. Indirect light now crosses the water as well (`irradiance` and `iblIrradiance` both go through `gWaterLight`) — with the water model applied only to direct light, a strong ambient term simply cancels it out and the tank goes hazy and colourless.
- **Light (previously)** — ambient plus a warm key at 3.4 casting the only shadows, a bright hemisphere fill, and a cool rim from behind. There is no additive "glow" plane faking the lamp — that was a rectangle of light hanging in the water column, and it looked like one.
- **Light (previously)** — a fixed overhead lamp, not a moving sun: the light holds still and only the water moves. The camera holds still too. Real shadows onto the sand from the fish and hardscape, hemisphere fill, cool rim from behind, and a small PMREM environment for the silvered flanks. The surface focusing in the water model replaces the old caustics plane: it varies the light everywhere at once by a few per cent rather than painting bright blobs that crawl across the sand.
- **Shoal** — 84 instanced neon tetras (*Paracheirodon innesi*), matching the app's own shoal. The body is lofted through 16 measured cross-sections — greatest depth 29% of standard length at the dorsal origin, width 12.6%, head 27%, peduncle 11% — each section a superellipse whose fullness exponent varies along the fish, so the back comes to a ridge while the belly rounds out. Sections cluster at the snout and the peduncle where the profile turns hardest. Fins are ray-and-membrane sheets: 19 principal caudal rays deeply forked, dorsal at 52% SL, anal at 60%, adipose at 84%, plus paired pelvics and pectorals. Skin is baked into vertex colours — dark olive dorsum, silver-white flank and belly, the iridescent blue-green line running from the eye back to the adipose fin, red from mid-body into the caudal peduncle, hyaline fins carrying almost no pigment, and an iris-and-pupil orbit the body surface domes around. Stripe strength uses the flank angle raised to 0.35 so the colour holds across the side rather than vanishing as the surface turns away. 2,592 triangles each. Steering is wander + separation + soft walls + pointer repulsion, with banking into turns; the swimming wave travels down the body from the pectorals back, and the head yaws against it.
- **Time** — ported from the mechanism in [City Clock](https://github.com/digitalurban/city-clock), not invented here. Four **seven-segment** digits, each lit segment manned by three fish spread along its length; 4 × 7 × 3 = 84 fish, so every segment of `88:88` has a crew. The roster is fixed and indexed, so the same fish takes the same post each minute. Fish belonging to an *unlit* segment are dismissed to a stable position at the edge of the tank rather than left milling about in the middle. Digit box is sized to the viewport with City Clock's own ratios — gap 0.44 w, group gap 0.75 w between hours and minutes, digit aspect 1:1.6. Timing is the wall clock: the shoal forms for the first 15 s of every minute, and `showTime()` calls it to order early. On station a fish lies *along* its segment — side-on for horizontals, nose-up for verticals — which is what turns three fish into a stroke. It only turns into that pose **once it arrives**: the blend is keyed to its distance from the post, not to the clock. Keyed to the clock, every fish squared up the instant the minute turned and then crabbed across the tank sideways to its place. A dismissed fish heads for its exit and then goes back to swimming, kept behind the digit plane so it does not cross the reading; it never holds station at the edge, which is what made them stall and twitch.
- **Food** — `feed()` drops ten pellets; the nearest fish break off and chase them.

Housekeeping: DPR capped at 1.75, `ResizeObserver` for sizing, `IntersectionObserver`
plus `document.hidden` to stop rendering when it is not on screen, and
`prefers-reduced-motion` slows everything to 45%.

## Files

```
index.html                       theme-color, Inter, description meta
package.json                     + three ^0.169.0, @types/three
src/index.css                    @theme tokens, smooth scroll
src/App.tsx                      rewritten page
src/components/LiveAquascape.tsx React wrapper, scrim, fade-in, feed handle
src/scene/riverscape.js          the scene
```

`vite.config.ts`, `tsconfig.json`, `src/main.tsx` and `public/` are unchanged.
`allowJs` is already true in the tsconfig, so the plain-JS scene file needs no
extra config.

## Branching

From a clean checkout of `main`:

```sh
git checkout -b v2
# copy the files from this drop over the repo, then
npm install
npm run dev          # check it at localhost:3000
npm run lint
git add -A
git commit -m "V2: live WebGL aquascape landing page"
git push -u origin v2
```

The GitHub Pages workflow in `.github/workflows` still points at `main`, so
pushing `v2` will not touch the live site. To preview the branch on Pages,
either add `v2` to the workflow's `branches:` list or open a PR and use a
deploy preview.

## Attribution

Desktop Habitats is MIT, © 2026 Chase Lean. No code from it is copied here —
this is an independent implementation — but the look is clearly derived from
Riverscape, and the header of `riverscape.js` says so. Worth a line in the
README and, if you post about it, a link back to
`github.com/chaseleantj/desktop-habitats`.

The water model (`waterLitShader`, `surfaceLightGLSL`) and the fish subsurface
transport are adapted from Habitats' `water.js` and `fish-anatomy.js` — the
same structure, the same absorption and scattering coefficients, fitted to this
tank's scale (one model unit is about 54 mm here against their 62 mm). That is
a port, not an independent implementation, and the file says so at both sites.

The clock mechanism is yours, lifted from `city-clock`'s `ClockManager` and
`Pedestrian`: seven-segment layout, fixed indexed roster, stable dismiss
targets, direct settle at close range with heavy damping and no separation
while on station. Same idea, translated from a plaza in 2D to a tank in 3D.

## Things you may want to change

- `CYCLE` at the top of `riverscape.js` — the formation is on a ~32 s loop. Shorten `free` if you want the time visible more often.
- `FISH_PER_SEGMENT` is 3 and `FISH_COUNT` is derived from it (4 × 7 × n). Two makes the strokes dashed; four is tidier but costs 112 fish, which is 290k triangles.
- `CLOCK_ACTIVE_SECONDS` is 15, matching City Clock.
- `PALETTE.sand` / the `#e9d6a9` accent is the only warm note on the page. Swapping it for a coral orange pulls it back toward the app icon if you would rather match that.
- The scene currently ignores the app's own colour-pinch feature. Exposing a `setWaterColour()` on the scene and wiring it to a control strip would be a small addition.
