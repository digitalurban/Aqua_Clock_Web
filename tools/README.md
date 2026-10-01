# Test tools

These run the **real page** in a real headless Chromium (WebGL2 over SwiftShader, so
software rendering) and measure it. They are what found the bugs listed in
[`docs/SIX-MONTHS.md`](../docs/SIX-MONTHS.md), and they are the acceptance checks for
re-running this project with a newer model.

    cd tools && npm install
    node shoot-aqua.mjs ../index.html out '?quality=lite' 20 0 1280 720   # canvas capture

| Script | What it checks | Pass looks like |
| --- | --- | --- |
| `probe-dpr.mjs` | MSAA and canvas resolution at a given device pixel ratio (`node probe-dpr.mjs ../index.html out.png 390 844 3 mobile`) | `samples: 4`, backing store well above CSS size |
| `probe-clowns.mjs` | 3 simulated minutes of clownfish: teleports, instant turns, speeds, feeding (add `feed`) | 0 teleports, 0 instant turns, both fish eat |
| `probe-food.mjs` | Food pellets are actually drawn (paints them magenta, counts pixels) | pixels > 0, `frustumCulled: false` |
| `probe-clock.mjs` | Fast-forwards the clock and prints the shoal as a map; `VW`/`VH` set the screen | digits fit the screen; read them against the page clock |
| `probe-layout2.mjs` | Air stone against the digits across screen shapes | stone clear of the digits |
| `shoot-full2.mjs` | Full screen view: walks every text node, asks the browser if it is visible | `text: []` in full view |
| `shoot-dom.mjs`, `shoot-clean-env.mjs` | Screenshots with the page's text / the clean view (`VW`, `VH`, `DPR`, `MOBILE=1`, `OUT`) | look at them |

Notes
- Software GL manages about 1 fps in the lite profile and crashes on capture in rich, so
  use `?quality=lite` and the built-in `habitat.advance(seconds)` to fast-forward.
- The scripts inject `window.__habitat` by rewriting the page on the fly; nothing in the
  shipped page depends on them. `habitat.debug` exposes clownfish state and the position
  of their home patch for these tools.
- `THREE_DIR` overrides where the local three.js build is found (the sandbox these were
  written in could not reach the CDN the page normally loads it from).
- This is not Safari and not an Apple GPU. It says nothing about frame rate, heat or
  battery on a phone.
