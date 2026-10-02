# Testing the tank on an iPad or iPhone

What I could and could not check matters here, so first:

**Everything I verified ran in desktop Chromium on software GL** (no Apple GPU, not
Safari). That covers logic and layout: behaviour, the clock, the bubbles, screen
shapes. It says nothing about frame rate, heat or battery on a real device, and
nothing about WebKit-specific rendering. Those are yours to measure.

## 1. Open the live page

Open [https://digitalurban.org/Aqua_Clock_Web/](https://digitalurban.org/Aqua_Clock_Web/) in Safari on the device. It needs a network connection: three.js
loads from jsDelivr and the font from Google Fonts.

Query strings work on the live page, so you can force either profile and compare:

    https://digitalurban.org/Aqua_Clock_Web/?quality=lite
    https://digitalurban.org/Aqua_Clock_Web/?quality=rich
    ...&fog=grey        # stock fog, for comparing the water colour
    ...#full            # start in the full screen view

The profile is chosen automatically. Touch screens, and devices with four cores or fewer,
get `lite`, so an iPad will almost certainly run lite unless you force rich. The footer of
the page shows which profile is active.

## 2. Or from your own machine, before pushing

Same Wi-Fi, from your Mac, in the folder containing `index.html`:

    python3 -m http.server 8000
    ipconfig getifaddr en0          # your Mac's address, e.g. 192.168.1.20

then open `http://192.168.1.20:8000/index.html?quality=rich` on the device.

## 2b. What to look at first on a phone

The plants used to break up into flickering dots on iPhone (no multisampling on a 3x
screen). That is fixed in this revision. Look at the grass while the blades sway: it
should be continuous, not stippled. If the dots are still there, tell me the iPhone
model and iOS version. The footer says `render lite` or `render rich`.

## 2c. Full screen

Tap **Full screen**. All text goes, the view zooms out (a wider lens, so more of the
tank shows), and tapping or moving brings back four icons (time, feed, light, exit) for
three seconds. The sun icon (or the L key) runs the light on to the next look: evening (the default,
a fixed dim blue look), day, dusk, night, dawn, and the device's clock. Check each on the phone: the top of the picture should be the
rippled underside of the surface, the sand should have soft moving light on it by day, and
the clock should still read at night. `?light=dusk` or `?light=19:30` opens at one. `F` toggles and `Esc` leaves it on a keyboard.
iPad Safari may go truly fullscreen; iPhone Safari cannot, so the text hides but the
address bar stays. For no browser chrome at all: open the page with `#full` on the
end, then Share > Add to Home Screen, and launch it from the icon. Not tested on a
device. The claude.ai artifact preview is an embedded frame, which may block the
browser's fullscreen: there the button will hide the text but may not go fullscreen.

## 3. Watching it properly (Web Inspector)

- iPhone/iPad: Settings > Apps > Safari > Advanced > Web Inspector on
  (older iOS: Settings > Safari > Advanced).
- Mac Safari: Settings > Advanced > Show features for web developers.
- Connect by cable, then Safari > Develop > [your device] > the page.
- Console shows errors; the Timelines tab shows frame rate and where time goes.

## 4. What to actually check

| Check | How | What "bad" looks like |
| --- | --- | --- |
| Frame rate, lite and rich | Watch a fish turn; Timelines | Judder, or the image going soft (the resolution governor stepping down) |
| Heat and battery | Leave it running an hour, screen brightness fixed, note battery % and how warm the device is | More than a few % an hour, or noticeably hot |
| Memory | Leave rich running on the oldest iPad you support | Safari reloads the page ("a problem repeatedly occurred"): too heavy, use lite |
| Rotation | Turn the device | Digits not restacking; scene cropped badly |
| Low Power Mode | Turn it on | Should slow to ~30 fps but stay smooth: motion is time-based |
| Clock | Tap "Show the time" | Digits should read the device's local time |
| iOS version | Settings > General > About | Blank page: WebGL2 needs iOS 15+, import maps need Safari 16.4+ |

## 5. Screen shapes (checked here, in a desktop browser)

- **Landscape (iPad, iPhone landscape):** four digits in a row.
- **Portrait (iPhone, iPad upright):** found and fixed in this revision. On a narrow
  screen the four digits used to be crushed into a sliver narrower than the fish are
  long. Below an aspect of 0.9 they now stack (hours over minutes), and the lens
  widens as the screen narrows, up to 42 degrees, tilting up so the end of the
  substrate stays out of frame.

## 6. This is the website scene, not the app

`Aqua-Clock_Info` is the landing page. Your iOS app is the 2D Capacitor build, and
none of this scene is in it. Putting the 3D tank into the app is a separate step,
and the thermal question above is the reason to do it behind an opt-in.
