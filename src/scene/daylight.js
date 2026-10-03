import * as THREE from 'three';
import { waterCaustic } from './riverscape/water.js';

/*
 * The light of the tank through the day.
 *
 * A set of "looks" is defined at certain hours: night, first light, dawn, morning, noon,
 * afternoon, golden hour, dusk, early night. Between them everything is blended: the colour
 * and strength of the four lights, the hemisphere light above and below, the fog colour and
 * density, the back panel, the exposure, the environment light, and three numbers the water
 * effects read (how strong the moving light on the sand is, how strong the beams from the
 * surface are, and how bright the surface itself looks). The key light also moves across the
 * sky from one side of the tank to the other, and at night becomes a dim moon.
 *
 * By default the hour is the device's own clock: bright by day, dim and blue in the evening and at
 * night. The sun button (or L) runs the light on to the next look, dawn, day, dusk, night, a fixed
 * evening look (about half past eight: dim and blue, the plants and the sand still clear) and then
 * back to the clock; it visibly runs on to that hour in a second or two, and the next press goes
 * on. `?light=day`, `?light=evening`, `?light=19:30` or `?light=clock` opens at a chosen look or
 * time, or following the clock. Day is exactly the look the tank had before this existed.
 *
 * Noon is exactly the look the tank had before this existed.
 */

const L = (h, keyC, keyI, hemiSky, hemiGround, hemiI, fillC, fillI, backC, backI, fog, density, board, exposure, env, caustic, shafts, surface) =>
  ({ h, keyC, keyI, hemiSky, hemiGround, hemiI, fillC, fillI, backC, backI, fog, density, board, exposure, env, caustic, shafts, surface });

const LOOKS = [
  //  hour  key colour, strength | hemisphere sky, ground, strength | fill | back | fog, density | back panel | exposure, env | caustic, shafts, surface
  L(0.0,  '#92b0e2', 1.9, '#4a6fa6', '#14202e', 0.72, '#88a2d0', 0.62, '#88aada', 0.74, '#143a58', 0.0255, '#1a4a72', 1.3, 0.55, 0.26, 0.20, 0.42),
  L(5.5,  '#96b3e4', 2.1, '#4f74aa', '#16222f', 0.72, '#8da6d4', 0.62, '#8eaede', 0.74, '#163d5c', 0.0255, '#1b4d76', 1.3, 0.57, 0.28, 0.24, 0.45),
  L(6.6,  '#ffc09a', 2.3, '#e2bba6', '#3a2f36', 0.32, '#eecdbd', 0.42, '#ffd8bf', 0.62, '#2b5068', 0.025, '#3a6684', 1.17, 0.60, 0.50, 0.75, 0.70),
  L(8.5,  '#fff0dc', 3.9, '#c2d6e2', '#30343a', 0.30, '#c2d8e4', 0.44, '#d2ecf2', 0.80, '#1f5878', 0.024, '#2a6688', 1.17, 0.90, 0.90, 0.90, 0.95),
  L(12.5, '#fff8ee', 4.5, '#c2d6e2', '#30343a', 0.30, '#c2d8e4', 0.44, '#d2ecf2', 0.80, '#1f5878', 0.024, '#2a6688', 1.17, 1.00, 1.00, 1.00, 1.00),
  L(16.5, '#fff2de', 4.1, '#c2d6e2', '#30343a', 0.30, '#c2d8e4', 0.44, '#d2ecf2', 0.80, '#1f5878', 0.024, '#2a6688', 1.17, 0.95, 0.90, 0.95, 0.97),
  L(18.5, '#ffc48a', 3.2, '#e4c6a8', '#34322f', 0.30, '#e8c8a8', 0.40, '#ffd2a8', 0.65, '#27506a', 0.0245, '#34628a', 1.17, 0.70, 0.65, 0.85, 0.80),
  L(19.7, '#ffb094', 2.3, '#d0a8bc', '#2a2c3c', 0.42, '#d8b4c4', 0.48, '#f4c4bc', 0.64, '#25506f', 0.0252, '#33608a', 1.24, 0.58, 0.34, 0.55, 0.62),
  L(21.0, '#a4bfec', 2.1, '#5074a8', '#16202e', 0.72, '#8fa8d4', 0.62, '#90b0de', 0.74, '#163c5a', 0.0255, '#1b4d76', 1.3, 0.57, 0.28, 0.26, 0.45),
  L(24.0, '#92b0e2', 1.9, '#4a6fa6', '#14202e', 0.72, '#88a2d0', 0.62, '#88aada', 0.74, '#143a58', 0.0255, '#1a4a72', 1.3, 0.55, 0.26, 0.20, 0.42),
];
const COLOURS = ['keyC', 'hemiSky', 'hemiGround', 'fillC', 'backC', 'fog', 'board'];
const NUMBERS = ['keyI', 'hemiI', 'fillI', 'backI', 'density', 'exposure', 'env', 'caustic', 'shafts', 'surface'];
for (const look of LOOKS) for (const k of COLOURS) look[k] = new THREE.Color(look[k]);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ORDER = ['auto', 'dawn', 'day', 'dusk', 'night', 'evening'];
const PRESET_HOUR = { evening: 20.5, dawn: 6.6, day: 12.5, dusk: 19.4, night: 0.8 };
const SWEEP = 8; // hours per second, when it runs on to a chosen hour

const localHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
const clockText = (h) => { const m = Math.round(h * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

export function createDaylight({ scene, renderer, hemi, key, fill, back, backboard, lite = false }) {
  const state = { hour: 12.5, keyPos: new THREE.Vector3() };
  for (const k of COLOURS) state[k] = new THREE.Color();
  for (const k of NUMBERS) state[k] = 0;

  let mode = 'auto', fixedHour = 12;   // the default follows the device's clock
  let hour = localHour(), applied = -99;

  function blend(h) {
    let i = 0;
    while (i < LOOKS.length - 2 && h >= LOOKS[i + 1].h) i++;
    const a = LOOKS[i], b = LOOKS[i + 1], t = smooth(0, 1, (h - a.h) / (b.h - a.h));
    for (const k of COLOURS) state[k].lerpColors(a[k], b[k], t);
    for (const k of NUMBERS) state[k] = a[k] + (b[k] - a[k]) * t;
    // the key light crosses the sky from one side to the other by day, and is a dim moon by night
    const sunW = smooth(5.6, 7.0, h) * (1 - smooth(18.2, 19.8, h));
    const angle = Math.min(1, Math.max(0, (h - 6) / 12)) * Math.PI;
    state.keyPos.set(
      3 + (-3 - 8 * Math.cos(angle) - 3) * sunW,
      10 + (5 + 6.5 * Math.sin(angle) - 10) * sunW,
      4.4,
    );
    state.hour = h;
  }
  function apply() {
    const s = state;
    key.color.copy(s.keyC); key.intensity = s.keyI; key.position.copy(s.keyPos);
    hemi.color.copy(s.hemiSky); hemi.groundColor.copy(s.hemiGround); hemi.intensity = s.hemiI;
    fill.color.copy(s.fillC); fill.intensity = s.fillI;
    back.color.copy(s.backC); back.intensity = s.backI;
    scene.fog.color.copy(s.fog); scene.fog.density = s.density;
    if (scene.background && scene.background.isColor) scene.background.copy(s.fog).multiplyScalar(0.45);
    backboard.material.color.copy(s.board);
    renderer.toneMappingExposure = s.exposure;
    if ('environmentIntensity' in scene) scene.environmentIntensity = s.env;
    waterCaustic.value = s.caustic * (lite ? 0.8 : 1);
  }
  const targetHour = () => (mode === 'auto' ? localHour() : mode === 'time' ? fixedHour : PRESET_HOUR[mode]);

  function setMode(m) {
    if (typeof m !== 'string') return false;
    let v = m.trim().toLowerCase();
    if (v === 'clock') v = 'auto';
    if (ORDER.includes(v)) { mode = v; return true; }
    const t = /^(\d{1,2})[:.](\d{2})$/.exec(v);
    if (t && +t[1] < 24 && +t[2] < 60) { mode = 'time'; fixedHour = +t[1] + +t[2] / 60; return true; }
    return false;
  }
  function label() {
    if (mode === 'auto') return 'Clock · ' + clockText(localHour());
    if (mode === 'time') return clockText(fixedHour);
    return mode[0].toUpperCase() + mode.slice(1);
  }
  function cycle() {
    const i = ORDER.indexOf(mode);
    mode = ORDER[(i + 1) % ORDER.length];   // from a fixed time, 'time' is -1, so it goes on to 'auto'
    return label();
  }
  function update(dt) {
    const target = targetHour();
    const ahead = (target - hour + 24) % 24;
    if (ahead > 1e-5) {
      // following the clock is instant; running on to a chosen hour is a quick sweep forward
      const step = mode === 'auto' && ahead < 0.25 ? ahead : Math.min(ahead, SWEEP * dt);
      hour = (hour + step) % 24;
    }
    if (Math.abs(hour - applied) > 0.002 || applied < -90) { blend(hour); apply(); applied = hour; }
  }
  update(0);

  return {
    update, setMode, cycle,
    get label() { return label(); },
    get mode() { return mode; },
    get hour() { return hour; },
    get state() { return state; },
  };
}
