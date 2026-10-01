# Six months of models

This repo is a working project and a record. The starting point is a post from the
[Connected Environments blog](https://connected-environments.org/blog/2026-03-20-aqua-clock-vibe-coding-boids-fish-tell-time/),
*Aqua Clock: Multi-Model Vibe Coding, Boids, and the Fish That Tell the Time* (20 March 2026),
which describes how the iOS app was built. This web version was built six months later,
with the same idea (fish that tell the time), the same author, and a very different way of
working. This note sets them side by side, with numbers, so the comparison can be made again
when the next models arrive.

## The baseline: March 2026

<img src="images/app-march-2026.jpg" alt="Boids in the Aquarium: the Aqua Clock app, March 2026" width="760">

*"Boids in the Aquarium", the app as shown in [the post](https://connected-environments.org/blog/2026-03-20-aqua-clock-vibe-coding-boids-fish-tell-time/).*

### What the post says

- **How it was made.** Conversationally, with "no design document, no formal spec". The
  opening prompt was, in effect, *let's build a fish tank with flocking fish*. Ghost shrimp,
  snails, a crab, bubbles and drifting plants were added over successive sessions. The clock
  arrived as a tangent, mid-session.
- **Two models, GitHub between them.** Claude did the heavier architecture: the boids, the
  entity system, the canvas rendering pipeline and the seven-segment clock logic. Gemini AI
  Studio was brought in for a fresh read on performance and interaction. The post calls this
  *multi-model vibe coding* and names the repository as "the handoff protocol". It also notes
  that token limits forced a series of back-and-forth flows between the two.
- **What it is.** React and TypeScript, Vite, the HTML5 Canvas API ("no WebGL, no external
  graphics library"), wrapped for iOS with Capacitor; no Swift written by hand. 28 tetras.
  A 10.5 MB app. Battery discipline: throttled `requestAnimationFrame`, suspended when
  backgrounded, bubbles capped at 150. About fifty lines of simulation logic per fish per
  frame, and the "emergent complexity" comes from those rules interacting.
- **The author's conclusion.** The AI "accelerates iteration to a pace at which exploration
  becomes viable", and what stays "irreducibly human" is aesthetic judgement: "The AI
  provided the means; the human provided the meaning."
- **A note that this repo exists to answer.** The post says the tools are "moving rapidly"
  and that it is good "to take a fresh look at the workflows every couple of months". This
  is that fresh look.

### What the screenshot shows

This part is the assistant's own observation of the image, not the post's.

- **A flat, side-on vector scene.** A saturated blue vertical gradient with a gently wavy
  waterline at the top. Plants are dark-green line-drawn stems and fronds, the rocks are flat
  grey shapes with outlines, and the bed is a field of dark oval pebbles. Everything is seen
  from the side and everything is flat: no depth, and no light beyond the gradient.
- **The flock, caught mid-turn.** About two dozen neon tetras (pale bodies, a red stripe) in a
  loose cluster, heads pointing broadly the same way, with a few strays. This is the boids
  behaviour the post is about, and it reads: the shoal looks like a shoal.
- **A whole cast, not just fish.** Two clownfish by the rocks, a pink shrimp on the gravel,
  something snail-like on the left-hand rock, and a black pump at the left edge with a stream
  of bubbles curving across the top. A settings gear sits bottom right.
- **What carried into the web version.** The cast and the set dressing: the neon tetras, the
  clownfish pair, the pump at the left, the rocks and the gravel. The mechanism too: a flock
  that abandons its rules to form the time. The web version rebuilt all of it with depth,
  shading and a water-light model, and the water went from bright blue to the dark green of
  the reference it was matched against.

It would be a mistake to read the flat look as the weaker one. It is clear at a glance on a
small screen, it is cheap enough to ship in a 10.5 MB app and leave running on a nightstand,
and it is charming. The screenshot is what a conversational build from a blank canvas
produced: a coherent scene with real behaviour. The September build is not a better version
of that picture. It is a different class of scene (depth, light, materials), reached by
pointing the assistant at a reference to match and, later, giving it a way to check its work.

## Then and now

| | March 2026: the app | September 2026: this web version |
| --- | --- | --- |
| What it is | 2D scene: React/TypeScript/Vite, HTML5 Canvas, Capacitor iOS | 3D scene: three.js, WebGL2, in the browser |
| Size | 10.5 MB app, 28 tetras | one page of about 550 kB (plus three.js from a CDN), 84 tetras and 2 clownfish |
| Built with | Claude and Gemini AI Studio, alternating, GitHub as the hand-off | Claude Sonnet 5.5, one long conversation, with a real browser to test against |
| Model | Claude and Gemini AI Studio (versions not stated in the post) | Claude Sonnet 5.5 |
| Starting point | an open-ended prompt for a flocking fish tank | a reference: Desktop Habitats' tank copied in (with the driftwood removed, stones added, the planting re-planned and the water colour changed), its fish-skin lighting adapted, the rest built here |
| Visual target | "aesthetically pleasing": a flat vector scene (see the screenshot) | photoreal, judged against a reference screenshot |
| What the human did | mediated between the two AIs; aesthetic judgement | aesthetic judgement again ("the green is off", "the food is massive", "not over the time") and one decisive call: use the real code rather than a copy of its look |
| How it was checked | the post does not describe it | measured, in a headless browser (next section) |

## What the comparison does and does not show

It is **not a controlled experiment**, and it would be wrong to read the table as "the model
got better by this much". Three things changed at once:

1. **The task.** The app was a new project from an open prompt. This was an existing
   reference to match, which is a different and in some ways easier problem.
2. **The tools.** By the end of this build the assistant could run the page in a real
   browser and read the pixels back. That is a change in what it was *given*, not only in
   the model, and the bug table below is almost entirely a consequence of it.
3. **The renderer.** Canvas 2D at 28 fish is a lighter thing to get right than WebGL at 84
   fish with a shader-based water model.

What the comparison *does* suggest:

- **One assistant now does what took two models and a courier.** The March workflow needed
  a human to carry context between Claude and Gemini, with GitHub as the shared ground truth.
  Here the same repository is still the durable artefact, but one assistant read a 3,471-line
  codebase, vendored it with marked patches, and kept the whole thing in its head across a
  very long conversation.
- **The gain was mostly in checking, not writing.** See the next section.
- **The post's conclusion held.** Every decision in this build that made it *better* rather
  than merely *working* came from the human: the palette, the food size, where the air stone
  sits, and the question that led to the attribution in the README being corrected.

And what the app has that this does not: it is **shipped**, small, and battery-disciplined.
Nothing in this web version has been measured on a phone, and a scene this heavy is not
something to leave running all night without doing so.

## What changed was that it could look

For roughly the first dozen rounds of this build the assistant could not see the page. It
worked from the source, its own offline software renderer, and simulation numbers, and it
reported results for things it had not looked at. The author had to say "still not right"
over and over: about the air stone, the clownfish, the colour, the lighting.

The step change came when the assistant could run the real page in a real browser
(headless Chromium, software WebGL2), screenshot it, read pixels back and measure. What it
then found were not tuning problems. They were things that had been wrong from the start
and that no amount of reading the code had caught:

| What was reported | What was actually wrong | Measured, before to after |
| --- | --- | --- |
| "I still can't see the air stone" (asked four times) | bubbles were about 2px across, additive, in dark fog: present and invisible | 2px to a median 4.9px |
| clownfish stuck in one corner, fading through a rock | teleports and 180-degree snap turns; targets unreachable behind a boulder; food ignored | teleports 12 to 0, instant turns 78 to 0, in 3 simulated minutes; both fish now eat |
| food drops not shown in Safari | the pellet mesh was frustum-culled forever (its bounding sphere was empty). Not Safari: no browser ever drew it | 0 pixels to 1,240 |
| plants break into flickering dots on iPhone | MSAA was off on dense screens, and the foliage's alpha-to-coverage needs it; the canvas was also 1x on a 3x screen | 0 to 4 samples; isolated-pixel rate 893 to 156 per 10,000 px |
| (never reported) the clock on an upright iPhone | four digits crushed into a sliver narrower than a fish | stacked layout, hours over minutes |
| (never reported) the air stone after it was moved | placed for screen height alone, behind the plants | 72-78% visible at the front of the tank, 15-25% elsewhere |

Every row of that table had already shipped. Several had been declared fixed.

## What did not change

- **Claims still had to be checked, and several fixes were wrong the first time.** The food
  was made *bigger* (0.09 to 0.11) in the pass that first made it visible, and the author's
  reply was "it's massive". The first clownfish rewrite left them too passive, because of an
  unreachable target. The air stone's placement solver picked a spot no one could see.
- **A real device is still the only judge of performance.** Everything measured here ran on
  software rendering in desktop Chromium. Nothing about frame rate, heat, battery or
  Safari-specific behaviour was measured.
- **The tools can mislead too.** A probe that painted the air stone magenta to measure it
  swapped its material, and the next probe could not find it: a false alarm about a
  regression that did not exist, caught only because the source and the running page were
  compared.

## Run it again in six months

1. **Give the next model the same brief.** In one paragraph: *make the Aqua-Clock landing
   page look like Desktop Habitats' Riverscape: a photoreal 3D tank in the browser, keeping
   the fish-tell-time mechanism from the app, and adding clownfish.* Provide the two repos
   ([Habitats](https://github.com/chaseleantj/desktop-habitats),
   [city-clock](https://github.com/digitalurban/city-clock)) and nothing else.
2. **Run the acceptance checks** in [`tools/`](../tools/README.md) against what it builds:

   | Check | Script | Pass |
   | --- | --- | --- |
   | multisampled on a 3x phone | `probe-dpr.mjs` | `samples: 4` |
   | clownfish over 3 minutes | `probe-clowns.mjs ... feed` | 0 teleports, 0 instant turns, both eat |
   | food is drawn | `probe-food.mjs` | pixels > 0 |
   | full screen view has no text | `shoot-full2.mjs` | `text: []` |
   | clock fits an upright phone | `probe-clock.mjs` with `VW=390 VH=844` | digits inside the screen |
   | air stone clear of the digits | `probe-layout2.mjs` | positive clearance |

   The clock reading correctly still needs a person (or a model) to look at the frame.
3. **Record it:**

   | Date | Model(s) | Rounds to a passing build | Checks passing | Did it look before it claimed? | Notes |
   | --- | --- | --- | --- | --- | --- |
   | 2026-03 | Claude and Gemini AI Studio | not stated | none existed | not stated | The iOS app; see the [post](https://connected-environments.org/blog/2026-03-20-aqua-clock-vibe-coding-boids-fish-tell-time/) |
   | 2026-09 | Claude Sonnet 5.5 | one long conversation | see the table above | no, not until it had a browser | This web version |
   | | | | | | |

The last column is the one this project taught: whether the model checked the real page
before saying a thing worked.
