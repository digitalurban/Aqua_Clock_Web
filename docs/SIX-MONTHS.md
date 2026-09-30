# Six months of models

This repo is a working project and a record. The iOS app was built about six months ago
with a dual-AI workflow. This web version was built recently, in one long conversation
with one assistant. Same author, same idea (fish that tell the time), a very different
way of working. This note records what was different, with numbers from the build, so the
comparison can be made again when the next models arrive.

> **To fill in:** the model names and dates behind each build. This file records what
> happened, not which model did which part: the conversation changed models along the
> way, and individual changes can't be attributed reliably.

## Then and now

| | The iOS app (about six months ago) | This web version |
| --- | --- | --- |
| What it is | a native 2D scene, in a Capacitor iOS app | a photoreal 3D scene in the browser, three.js |
| Built with | a dual-AI workflow *(add models and dates)* | one assistant, one long conversation *(add models and dates)* |
| Starting point | *(add)* | an MIT codebase, Desktop Habitats: read and vendored, not imitated |
| How the work was checked | *(add)* | by the assistant, in a real headless browser, by measuring |

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
   | | | | | | |

The last column is the one this project taught: whether the model checked the real page
before saying a thing worked.
