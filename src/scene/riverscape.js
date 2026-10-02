/**
 * Aqua Clock V2 — live aquascape
 * ------------------------------------------------------------------
 * A compact Three.js freshwater scene for the Aqua Clock landing page.
 * Visual direction follows Desktop Habitats' "Riverscape" (MIT,
 * (c) 2026 Chase Lean) — dark green water, exponential fog, ACES tone
 * mapping, sand substrate, swaying rivergrass. No code is copied from
 * that project; this is an independent, much smaller implementation.
 *
 * createRiverscape(canvas) -> { feed, dispose }
 */

import * as THREE from 'three';
import { createEnvironment, createParticles } from './riverscape/environment.js';
import { createPlants } from './riverscape/plants.js';
import { groundHeight } from './riverscape/math.js';
import { SURFACE_Y, waterLitShader, waterTime } from './riverscape/water.js';
import { setLOD } from './riverscape/lod.js';
import { createBubbles } from './bubbles.js';
import { createSnails } from './snails.js';

/* ---------------------------------------------------------------- */
/* Tunables                                                          */
/* ---------------------------------------------------------------- */

const PALETTE = {
  background: '#04101a',
  fog: '#123a4e',
  sunlight: '#ffeccb',
  skyFill: '#2d6078',
  groundFill: '#0a1620',
  sand: '#8c7a58',
  rock: '#4b4e46',
  wood: '#5d4a33',
};

const FISH_PER_SEGMENT = 3;
const FISH_COUNT = 4 * 7 * FISH_PER_SEGMENT; // every segment of "88:88" manned
const CLOCK_ACTIVE_SECONDS = 15; // the shoal forms for the first 15 s of each minute
const BOUNDS = { x: 6.2, yMin: 1.5, yMax: 8.4, zMin: -3.6, zMax: 2.4 };

/* Seven-segment digits, as the app itself uses. Order is A B C D E F G:
 * top, upper-right, lower-right, bottom, lower-left, upper-left, middle. */
const SEVEN_SEGMENT = [
  [1, 1, 1, 1, 1, 1, 0], // 0
  [0, 1, 1, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1], // 2
  [1, 1, 1, 1, 0, 0, 1], // 3
  [0, 1, 1, 0, 0, 1, 1], // 4
  [1, 0, 1, 1, 0, 1, 1], // 5
  [1, 0, 1, 1, 1, 1, 1], // 6
  [1, 1, 1, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1], // 8
  [1, 1, 1, 1, 0, 1, 1], // 9
];

/* ---------------------------------------------------------------- */
/* Small helpers                                                     */
/* ---------------------------------------------------------------- */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Soft round sprite, used for suspended motes. */
function moteTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ---------------------------------------------------------------- */
/* Geometry builders                                                 */
/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
/* Fish anatomy                                                      */
/* ---------------------------------------------------------------- */
/*
 * Built the way Desktop Habitats builds its bloodfin tetra (Aphyocharax
 * anisitsi): lofted cross-sections, in fractions of standard length. The
 * station table below is our own and is for a neon tetra (Paracheirodon
 * innesi); the proportions quoted in the rest of this comment were written for
 * the bloodfin and have not been reconciled with it. Dimensions are
 * fractions of standard length (snout to hypural plate): greatest depth 29%
 * at the dorsal origin, width 12.6% (so the body is roughly 0.43 as wide as
 * it is deep), head 27%, caudal peduncle 11%, caudal lobes deeply forked at
 * 27%. Forward axis is +X, the fish is symmetric in Z.
 */

const SNOUT_X = 0.35;
const STANDARD_LENGTH = 0.645;
const HYPURAL_X = SNOUT_X - STANDARD_LENGTH;

/* x, dorsal y, ventral y, half width, upper fullness, lower fullness.
 * Fullness 2 is a true ellipse; under 2 the section narrows to a ridge, which
 * is how the back and the peduncle are actually shaped; over 2 it rounds out,
 * as the skull and the belly do. */
const STATIONS = [
  [0.350, -0.002, -0.010, 0.004, 2.40, 2.50],
  [0.330, 0.020, -0.030, 0.015, 2.40, 2.50],
  [0.305, 0.044, -0.048, 0.027, 2.30, 2.50],
  [0.275, 0.060, -0.062, 0.035, 2.30, 2.45],
  [0.240, 0.070, -0.072, 0.039, 2.20, 2.40],
  [0.200, 0.077, -0.086, 0.041, 2.10, 2.35],
  [0.155, 0.081, -0.094, 0.040, 2.05, 2.30],
  [0.100, 0.084, -0.100, 0.037, 2.00, 2.20],
  [0.040, 0.085, -0.102, 0.034, 1.98, 2.12],
  [-0.020, 0.083, -0.101, 0.030, 1.90, 1.95],
  [-0.075, 0.075, -0.092, 0.026, 1.80, 1.80],
  [-0.130, 0.064, -0.077, 0.021, 1.68, 1.68],
  [-0.185, 0.050, -0.058, 0.016, 1.54, 1.55],
  [-0.235, 0.040, -0.043, 0.012, 1.46, 1.48],
  [-0.270, 0.036, -0.036, 0.009, 1.42, 1.42],
  [HYPURAL_X, 0.034, -0.033, 0.005, 1.40, 1.40],
];

const SECTION_WAIST = 2.15;
let BODY_ROWS = 34;
let BODY_COLUMNS = 18;

/** Lowered on the lite profile: 86 fish are the second largest thing here. */
export function setFishDetail(rows, columns) {
  BODY_ROWS = rows;
  BODY_COLUMNS = columns;
}

const EYE = { x: 0.272, y: 0.012, radius: 0.038, bulge: 0.013 };

/* Amphiprion ocellaris: stocky and oval, laterally compressed, with a round
 * blunt profile — greatest depth a little over half the standard length
 * against a characin's 29%, a large head, and a deep caudal peduncle. */
const CLOWN_STATIONS = [
  [0.350, 0.010, -0.030, 0.006, 2.40, 2.50],
  [0.335, 0.040, -0.055, 0.022, 2.40, 2.50],
  [0.310, 0.078, -0.090, 0.040, 2.30, 2.50],
  [0.280, 0.110, -0.118, 0.052, 2.20, 2.45],
  [0.240, 0.140, -0.140, 0.060, 2.15, 2.40],
  [0.190, 0.162, -0.156, 0.066, 2.10, 2.35],
  [0.130, 0.172, -0.165, 0.068, 2.05, 2.30],
  [0.060, 0.170, -0.163, 0.066, 2.00, 2.25],
  [-0.010, 0.160, -0.152, 0.061, 1.95, 2.10],
  [-0.080, 0.142, -0.132, 0.053, 1.85, 1.95],
  [-0.140, 0.120, -0.110, 0.044, 1.75, 1.80],
  [-0.195, 0.096, -0.086, 0.034, 1.65, 1.68],
  [-0.240, 0.074, -0.066, 0.025, 1.55, 1.57],
  [-0.270, 0.062, -0.056, 0.018, 1.48, 1.50],
  [HYPURAL_X, 0.056, -0.050, 0.010, 1.44, 1.45],
];
const CLOWN_EYE = { x: 0.277, y: 0.014, radius: 0.044, bulge: 0.015 };

/* Light transport through the body wall, from Habitats' fish-anatomy.js. The
 * path is the width of the section at the fragment. One model unit here is
 * about 54 mm, close enough to their 62 mm to use the same coefficients:
 * blood and myoglobin take green and blue out several times faster than red,
 * which is why a small fish lit from behind glows warm where it is thin. */
const MUSCLE_ABSORPTION = [34, 84, 109];
const TISSUE_SCATTER = 160;
const MUSCLE_FLOOR = 0.012;
const MEMBRANE_PATH = 0.006;
const FIN_PIGMENT_DENSITY = [0.25, 2.0, 2.6];
/* Tissue a millimetre thick scatters broadly rather than forwards, so the
 * view-dependent lobe sits on a wrap-around floor (Barré-Brisebois). */
const THROUGH = { gain: 2.0, wrap: 0.35, sharpness: 2.0, distortion: 0.22 };
/* Scale rows: 34 along the lateral series, 22 around the circumference.
 * Visible only when a scale covers more than a pixel. */
const SCALE_ROWS = [34, 22];

/* Linear-space skin and fin values. A neon is silver-white with an iridescent
 * blue-green line from the eye to the adipose fin, red from mid-body into the
 * tail, a dark olive back, and hyaline fins that carry almost no pigment. */
const SKIN = {
  dorsum: [0.042, 0.048, 0.050],
  flank: [0.420, 0.470, 0.480],
  silver: [0.640, 0.670, 0.665],
  belly: [0.740, 0.755, 0.740],
  neon: [0.120, 0.980, 1.320],
  red: [0.880, 0.090, 0.060],
  head: [0.090, 0.095, 0.098],
  iris: [0.600, 0.605, 0.430],
  pupil: [0.006, 0.008, 0.009],
};
/* An ocellaris clownfish: saturated orange, three white bars edged in black,
 * and black fin margins. */
const CLOWN = {
  body: [0.900, 0.210, 0.022],
  belly: [0.890, 0.320, 0.070],
  bar: [0.910, 0.915, 0.890],
  edging: [0.014, 0.013, 0.015],
};
const FIN = {
  membrane: [0.110, 0.130, 0.132],
  pigment: [0.155, 0.185, 0.195],
  edge: [0.420, 0.455, 0.465],
  ray: [0.085, 0.098, 0.102],
};

const mixColor = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Accumulates an indexed mesh with colour and flutter attributes. */
function MeshBuilder() {
  this.position = [];
  this.color = [];
  this.flutter = [];
  this.uv = [];
  this.path = [];
  this.part = [];
  this.index = [];
}
MeshBuilder.prototype.vertex = function (x, y, z, color, flutter, u, v, path, part) {
  this.position.push(x, y, z);
  this.color.push(color[0], color[1], color[2]);
  this.flutter.push(flutter);
  this.uv.push(u || 0, v || 0);
  // how far light must travel through tissue to leave here, and whether this
  // is body or fin membrane
  this.path.push(path === undefined ? MUSCLE_FLOOR : path);
  this.part.push(part || 0);
  return this.position.length / 3 - 1;
};
MeshBuilder.prototype.quad = function (a, b, c, d) {
  this.index.push(a, b, c, a, c, d);
};
MeshBuilder.prototype.build = function () {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
  geometry.setAttribute('aFlutter', new THREE.Float32BufferAttribute(this.flutter, 1));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  // three only declares `uv` in the shader when a map is bound, so the fish
  // skin carries its own copy
  geometry.setAttribute('aFishUV', new THREE.Float32BufferAttribute(this.uv.slice(), 2));
  geometry.setAttribute('aPath', new THREE.Float32BufferAttribute(this.path, 1));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
  geometry.setIndex(this.index);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * The fins of an ocellaris: a continuous dorsal notched between eleven spines
 * and the soft rays behind them, a rounded caudal, a long anal, and large
 * rounded pectorals — which is what it actually swims with.
 */
function buildClownFins(mesh) {
  const livery = 'clown';
  const dorsal = (x) => stationAt(x, livery).dorsal;
  const ventral = (x) => stationAt(x, livery).ventral;

  // spinous dorsal: eleven spines, taller at the front
  buildFin(mesh, {
    livery, rays: 11, steps: 3,
    hinge: (t) => [0.2 - 0.22 * t, dorsal(0.2 - 0.22 * t) - 0.004, 0],
    tip: (t) => {
      const x = 0.2 - 0.22 * t;
      return [x - 0.012, dorsal(x) + 0.062 + 0.026 * Math.sin(Math.PI * t), 0];
    },
    flutter: 0.35,
  });

  // soft dorsal, rounded, behind the notch
  buildFin(mesh, {
    livery, rays: 13, steps: 3,
    hinge: (t) => [-0.045 - 0.165 * t, dorsal(-0.045 - 0.165 * t) - 0.004, 0],
    tip: (t) => {
      const x = -0.045 - 0.165 * t;
      return [x - 0.01, dorsal(x) + 0.03 + 0.055 * Math.sin(Math.PI * Math.pow(t, 0.8)), 0];
    },
    flutter: 0.45,
  });

  // rounded caudal
  buildFin(mesh, {
    livery, rays: 17, steps: 3,
    hinge: (t) => [HYPURAL_X + 0.004, 0.05 * (t * 2 - 1), 0],
    tip: (t) => {
      const u = t * 2 - 1;
      return [HYPURAL_X - 0.165 * (1 - 0.3 * u * u), 0.15 * u, 0];
    },
    flutter: 1.0,
  });

  // long anal fin
  buildFin(mesh, {
    livery, rays: 13, steps: 3,
    hinge: (t) => [-0.02 - 0.19 * t, ventral(-0.02 - 0.19 * t) + 0.004, 0],
    tip: (t) => {
      const x = -0.02 - 0.19 * t;
      return [x - 0.012, ventral(x) - 0.03 - 0.055 * Math.sin(Math.PI * Math.pow(t, 0.75)), 0];
    },
    flutter: 0.5,
  });

  for (const side of [1, -1]) {
    // pectorals: seventeen rays, broad and rounded, set high on the flank.
    // part 2 so the shader can row them rather than let them trail.
    buildFin(mesh, {
      livery, rays: 12, steps: 3, part: 2,
      hinge: (t) => [0.175 - 0.02 * t, -0.01 - 0.055 * t, side * 0.05],
      tip: (t) => {
        const spread = Math.sin(Math.PI * (0.18 + 0.72 * t));
        return [0.105 - 0.1 * t, 0.045 - 0.19 * t, side * (0.055 + 0.14 * spread)];
      },
      flutter: 1.0,
    });

    // pelvics, slung under the head
    buildFin(mesh, {
      livery, rays: 8, steps: 3,
      hinge: (t) => [0.135 - 0.022 * t, ventral(0.135) + 0.004, side * 0.018],
      tip: (t) => [0.085 - 0.05 * t, ventral(0.135) - 0.085 - 0.03 * t, side * (0.03 + 0.016 * t)],
      flutter: 0.6,
    });
  }

  const geometry = mesh.build();
  geometry.computeVertexNormals();
  return geometry;
}

/** Linear interpolation through the station table at an arbitrary x. */
function stationAt(x, livery) {
  const table = livery === 'clown' ? CLOWN_STATIONS : STATIONS;
  let i = 0;
  while (i < table.length - 2 && table[i + 1][0] > x) i++;
  const a = table[i];
  const b = table[i + 1];
  const t = clamp((a[0] - x) / (a[0] - b[0]), 0, 1);
  return {
    dorsal: a[1] + (b[1] - a[1]) * t,
    ventral: a[2] + (b[2] - a[2]) * t,
    halfWidth: a[3] + (b[3] - a[3]) * t,
    upper: a[4] + (b[4] - a[4]) * t,
    lower: a[5] + (b[5] - a[5]) * t,
  };
}

/*
 * Only the base tone here. The bars are painted in the fragment stage instead:
 * a white bar inside a narrow black margin is a couple of hundredths of a unit
 * wide, far finer than the mesh, and painting it per-vertex loses the margin.
 */
function clownColor(x, depthT) {
  let color = mixColor(CLOWN.belly, CLOWN.body, smoothstep(0.15, 0.55, depthT));
  color = mixColor(color, CLOWN.edging, smoothstep(0.9, 1, depthT) * 0.45);
  return color;
}

function skinColor(x, depthT, sideT, livery) {
  if (livery === 'clown') return clownColor(x, depthT);
  let color = mixColor(SKIN.belly, SKIN.silver, smoothstep(0.05, 0.28, depthT));
  color = mixColor(color, SKIN.flank, smoothstep(0.32, 0.62, depthT));
  color = mixColor(color, SKIN.dorsum, smoothstep(0.7, 0.96, depthT));

  // The stripes live on the flank, but they should hold their colour across
  // most of it rather than fading the moment the surface turns away.
  const flank = Math.pow(sideT, 0.35);

  // the neon, from the eye back to the adipose fin, just above the midline
  const neonBand = Math.exp(-Math.pow((depthT - 0.615) / 0.1, 2));
  const neonRun = smoothstep(-0.25, -0.16, x) * (1 - smoothstep(0.25, 0.33, x));
  color = mixColor(color, SKIN.neon, Math.min(1, neonBand * neonRun * flank));

  // and the red, from about mid-body back into the caudal peduncle
  const redBand = Math.exp(-Math.pow((depthT - 0.4) / 0.105, 2));
  const redRun = smoothstep(0.08, -0.04, x);
  color = mixColor(color, SKIN.red, Math.min(1, redBand * redRun * flank * 0.96));

  // the head is scaleless and darker over the skull
  color = mixColor(color, SKIN.head, smoothstep(0.26, 0.35, x) * 0.7);
  return color;
}

function buildFishBody(mesh, livery) {
  const rows = [];

  for (let r = 0; r < BODY_ROWS; r++) {
    let u = r / (BODY_ROWS - 1);
    // cluster rows at the snout and the peduncle, where the profile turns hardest
    u = u - 0.11 * Math.sin(u * Math.PI * 2);
    const x = SNOUT_X - clamp(u, 0, 1) * STANDARD_LENGTH;
    const s = stationAt(x, livery);
    const ring = [];

    for (let c = 0; c < BODY_COLUMNS; c++) {
      const a = (c / BODY_COLUMNS) * Math.PI * 2;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const fullness = sn >= 0 ? s.upper : s.lower;
      const extent = sn >= 0 ? s.dorsal : -s.ventral;

      let y = Math.sign(sn) * extent * Math.pow(Math.abs(sn), 2 / fullness);
      let z = Math.sign(cs) * s.halfWidth * Math.pow(Math.abs(cs), 2 / SECTION_WAIST);

      const depthT = clamp((y - s.ventral) / (s.dorsal - s.ventral), 0, 1);
      const sideT = s.halfWidth > 0.0001 ? Math.abs(z) / s.halfWidth : 0;
      let color = skinColor(x, depthT, sideT, livery);

      // the orbit: the body surface takes the eyeball's shape, so the eye can
      // never part from the head
      const eye = livery === 'clown' ? CLOWN_EYE : EYE;
      const eyeDistance = Math.hypot((x - eye.x) / eye.radius, (y - eye.y) / eye.radius);
      if (eyeDistance < 1 && sideT > 0.45) {
        const dome = Math.sqrt(1 - eyeDistance * eyeDistance);
        z += Math.sign(z) * eye.bulge * dome;
        // the clown's eye is painted in the fragment stage, where it can have
        // an iris and a catchlight instead of a block of dark vertices
        if (livery === 'clown') {
          // shape only
        } else if (eyeDistance < 0.56) color = SKIN.pupil;
        else if (eyeDistance < 0.92)
          color = mixColor(SKIN.iris, [0.33, 0.30, 0.15], smoothstep(0.56, 0.92, eyeDistance));
        else color = mixColor(color, [0.175, 0.168, 0.132], 0.7);
      }

      // the path is the width of the section here, so the ridges and the
      // peduncle leak most and the deep body leaks nothing
      const path = Math.max(Math.abs(z) * 2, MUSCLE_FLOOR);
      ring.push(mesh.vertex(x, y, z, color, 0, c / BODY_COLUMNS, u, path, 0));
    }
    rows.push(ring);
  }

  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < BODY_COLUMNS; c++) {
      const c2 = (c + 1) % BODY_COLUMNS;
      mesh.quad(rows[r][c], rows[r + 1][c], rows[r + 1][c2], rows[r][c2]);
    }
  }
}

/**
 * A fin is a fan of bony rays with membrane between them. Rays read as dark
 * striations, the membrane carries the red, and the free edge goes pale.
 */
function buildFin(mesh, options) {
  const {
    rays, steps = 5, hinge, tip, flutter = 1, part = 1,
    livery, edge = livery === 'clown' ? CLOWN.edging : FIN.edge,
  } = options;
  let { pigment = 1 } = options;
  const membrane = livery === 'clown' ? CLOWN.body : FIN.membrane;
  // a clownfish fin is orange to its black margin — no pale wash at the base
  if (livery === 'clown') pigment = 0;
  const pigmentColor = livery === 'clown' ? CLOWN.bar : FIN.pigment;
  const rayColor = livery === 'clown' ? CLOWN.edging : FIN.ray;
  const grid = [];

  for (let i = 0; i < rays; i++) {
    const t = rays > 1 ? i / (rays - 1) : 0.5;
    const a = hinge(t);
    const b = tip(t);
    const striation = i % 2 === 0 ? 1 : 0.72;
    const column = [];

    for (let j = 0; j <= steps; j++) {
      const p = j / steps;
      // rays trail: the free edge lags behind the hinge
      const curl = Math.sin(p * Math.PI) * 0.12;
      const x = a[0] + (b[0] - a[0]) * p;
      const y = a[1] + (b[1] - a[1]) * p;
      const z = (a[2] + (b[2] - a[2]) * p) * (1 + curl);

      let color = mixColor(membrane, pigmentColor, pigment * (1 - smoothstep(0.1, 0.85, p)));
      if (livery !== 'clown') color = mixColor(color, edge, smoothstep(0.45, 1, p) * 0.9);
      color = mixColor(color, rayColor, (1 - striation) * (livery === 'clown' ? 0.3 : 0.55));

      column.push(mesh.vertex(x, y, z, color, flutter * p, t, p, MEMBRANE_PATH, part));
    }
    grid.push(column);
  }

  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < steps; j++) {
      mesh.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
    }
  }
}

function buildFishGeometry(livery) {
  const mesh = new MeshBuilder();
  buildFishBody(mesh, livery);
  if (livery === 'clown') return buildClownFins(mesh);

  // caudal: 19 principal rays, deeply forked — inner rays short, lobes long
  buildFin(mesh, {
    livery,
    rays: 19,
    steps: 3,
    hinge: (t) => [HYPURAL_X + 0.004, 0.032 * (t * 2 - 1), 0],
    tip: (t) => {
      const s = t * 2 - 1;
      // a characin's caudal is deeply forked; a clownfish's is rounded
      if (livery === 'clown') {
        return [HYPURAL_X - 0.15 * (1 - 0.22 * Math.abs(s)), 0.155 * s, 0];
      }
      return [HYPURAL_X - (0.072 + 0.104 * Math.pow(Math.abs(s), 1.1)), 0.162 * s, 0];
    },
    flutter: 1.25,
    pigment: 0.45,
  });

  // dorsal: origin at 52% SL, tall at the front and swept back
  buildFin(mesh, {
    livery,
    rays: 11,
    steps: 3,
    hinge: (t) => [0.02 - 0.072 * t, 0.0805 - 0.004 * t, 0],
    tip: (t) => [-0.012 - 0.09 * t, 0.082 + (0.115 * Math.pow(1 - t, 0.8) + 0.016), 0],
    flutter: 0.5,
    pigment: 0.4,
  });

  // adipose fin — no rays, just a flag of tissue
  buildFin(mesh, {
    livery,
    rays: 3,
    steps: 2,
    hinge: (t) => [-0.176 - 0.026 * t, 0.052, 0],
    tip: (t) => [-0.196 - 0.02 * t, 0.052 + 0.028 * (1 - t * 0.5), 0],
    flutter: 0.35,
    pigment: 0.7,
  });

  // anal: long, low, origin at 60% SL
  buildFin(mesh, {
    livery,
    rays: 17,
    steps: 3,
    hinge: (t) => [-0.028 - 0.172 * t, stationAt(-0.028 - 0.172 * t).ventral + 0.003, 0],
    tip: (t) => {
      const x = -0.028 - 0.172 * t;
      const height = 0.072 * Math.pow(1 - t, 0.7) + 0.012;
      return [x - 0.022, stationAt(x).ventral - height, 0];
    },
    flutter: 0.6,
    pigment: 0.4,
  });

  // paired pelvics and pectorals, swept back and outward
  for (const side of [1, -1]) {
    buildFin(mesh, {
    livery,
      rays: 8,
      steps: 3,
      hinge: (t) => [0.062 - 0.016 * t, -0.098, side * 0.012],
      tip: (t) => [0.012 - 0.03 * t, -0.132 - 0.014 * t, side * (0.026 + 0.012 * t)],
      flutter: 0.7,
      pigment: 0.35,
    });

    buildFin(mesh, {
    livery,
      rays: 12,
      steps: 3,
      hinge: (t) => [0.188 - 0.008 * t, -0.040 - 0.014 * t, side * 0.030],
      tip: (t) => [0.098 - 0.028 * t, -0.062 - 0.026 * t, side * (0.062 + 0.018 * t)],
      flutter: 0.9,
      pigment: 0.35,
      edge: [0.42, 0.44, 0.44],
    });
  }

  return mesh.build();
}

function buildBladeGeometry() {
  const blade = new THREE.PlaneGeometry(0.16, 1, 1, 6);
  blade.translate(0, 0.5, 0);
  const position = blade.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setX(i, position.getX(i) * (1 - 0.55 * y));
    // ribbon grass arcs over under its own length instead of standing straight
    position.setZ(i, position.getZ(i) + Math.pow(y, 2.1) * 0.42);
    position.setY(i, y - Math.pow(y, 3) * 0.1);
  }
  blade.computeVertexNormals();
  return blade;
}

function buildLeafGeometry() {
  const leaf = new THREE.PlaneGeometry(0.42, 1.15, 2, 6);
  leaf.translate(0, 0.575, 0);
  const position = leaf.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const width = Math.sin(Math.PI * clamp(y / 1.15, 0, 1));
    position.setX(i, x * Math.pow(width, 0.7));
    position.setZ(i, Math.abs(x) * -0.55); // slight cupping
  }
  leaf.computeVertexNormals();
  return leaf;
}

function buildRockGeometry() {
  const rock = new THREE.IcosahedronGeometry(1, 1);
  const position = rock.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const scale = rand(0.78, 1.18);
    position.setXYZ(
      i,
      position.getX(i) * scale,
      position.getY(i) * scale * 0.72,
      position.getZ(i) * scale,
    );
  }
  rock.computeVertexNormals();
  return rock;
}

/* ---------------------------------------------------------------- */
/* Time formation                                                    */
/* ---------------------------------------------------------------- */

/** Stable per-index hash, so a dismissed fish keeps the same exit each minute. */
function stableRandom(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Where every fish should be for the current minute.
 *
 * This follows the mechanism in City Clock rather than a pixel font: four
 * seven-segment digits, each lit segment manned by FISH_PER_SEGMENT fish
 * spread along its length, and every fish belonging to an unlit segment sent
 * out to the edge of the tank. The roster is fixed, so the same fish takes the
 * same post each minute and the strokes read as strokes.
 *
 * Returns one entry per fish: { x, y, z, station, horizontal }.
 */
function clockAssignments(date, view) {
  const time =
    String(date.getHours()).padStart(2, '0') + String(date.getMinutes()).padStart(2, '0');

  // Digit box, sized to the viewport. On a landscape screen the four digits sit
  // in a row: [digit][gap][digit][group gap][digit][gap][digit]. On a narrow
  // screen — a phone held upright — a row of four would be crushed into a sliver
  // narrower than the fish are long, so hours stack over minutes and fill the width.
  const fullHeight = view.fullHeight || view.height;
  const portrait = view.width / fullHeight < 0.9;
  let w, h, gap;
  const place = [];   // per digit: [left edge, top edge]
  if (portrait) {
    w = (view.width * 0.64) / (2 + 0.44);
    h = Math.min(w * 1.6, (fullHeight * 0.62) / 2.32, (view.maxDigitHeight ?? Infinity) / 2.32);
    w = Math.min(w, h / 1.35);   // never much squatter than a digit should be
    gap = w * 0.44;
    const rowGap = h * 0.32;
    // shifted left, so the air stone's plume has the right-hand side to itself
    const startX = -(2 * w + gap) / 2 - view.width * 0.08;
    const top = view.centerY + (2 * h + rowGap) / 2;
    for (let d = 0; d < 4; d++) place.push([startX + (d & 1) * (w + gap), top - (d >> 1) * (h + rowGap)]);
  } else {
    const usable = view.width * 0.62;
    w = usable / (4 + 2 * 0.44 + 0.75);
    h = Math.min(view.height * 0.5, w * 1.6, view.maxDigitHeight ?? Infinity);
    w = Math.min(w, h / 1.35);   // never much squatter than a digit should be
    gap = w * 0.44;
    const groupGap = w * 0.75;
    const total = 4 * w + 2 * gap + groupGap;
    // a little left of centre, so the air stone's plume has the right-hand side to itself
    const startX = -total / 2 - view.width * 0.03;
    const topY0 = view.centerY + h / 2;
    for (let d = 0; d < 4; d++) place.push([startX + d * (w + gap) + (d >= 2 ? groupGap - gap : 0), topY0]);
  }

  const assignments = [];

  for (let digit = 0; digit < 4; digit++) {
    const segments = SEVEN_SEGMENT[Number(time[digit])];
    const [dx, topY] = place[digit];

    const definitions = [
      { x: dx + w / 2, y: topY, horizontal: true },
      { x: dx + w, y: topY - h / 4, horizontal: false },
      { x: dx + w, y: topY - (3 * h) / 4, horizontal: false },
      { x: dx + w / 2, y: topY - h, horizontal: true },
      { x: dx, y: topY - (3 * h) / 4, horizontal: false },
      { x: dx, y: topY - h / 4, horizontal: false },
      { x: dx + w / 2, y: topY - h / 2, horizontal: true },
    ];

    for (let seg = 0; seg < 7; seg++) {
      const definition = definitions[seg];
      const spread = definition.horizontal ? w * 0.3 : h * 0.16;

      for (let k = 0; k < FISH_PER_SEGMENT; k++) {
        const index = assignments.length;
        if (!segments[seg]) {
          assignments.push(dismissTarget(index));
          continue;
        }
        const t = FISH_PER_SEGMENT <= 1 ? 0 : (k / (FISH_PER_SEGMENT - 1) - 0.5) * 2;
        assignments.push({
          x: definition.x + (definition.horizontal ? t * spread : 0),
          y: definition.y + (definition.horizontal ? 0 : t * spread),
          z: 1.2,
          station: true,
          horizontal: definition.horizontal,
        });
      }
    }
  }

  while (assignments.length < FISH_COUNT) assignments.push(dismissTarget(assignments.length));
  return assignments;
}

/** An unlit segment's fish waits out the minute at the edge of the tank. */
function dismissTarget(index) {
  const edge = index % 4;
  const r = stableRandom(index * 17 + 3);
  const depth = -1.6 - stableRandom(index * 29 + 11) * 2;
  if (edge === 0) return { x: -BOUNDS.x + r * 2 * BOUNDS.x, y: BOUNDS.yMax - 0.3, z: depth, station: false };
  if (edge === 1) return { x: -BOUNDS.x + r * 2 * BOUNDS.x, y: BOUNDS.yMin + 0.3, z: depth, station: false };
  if (edge === 2) return { x: -BOUNDS.x + 0.4, y: BOUNDS.yMin + r * (BOUNDS.yMax - BOUNDS.yMin), z: depth, station: false };
  return { x: BOUNDS.x - 0.4, y: BOUNDS.yMin + r * (BOUNDS.yMax - BOUNDS.yMin), z: depth, station: false };
}

/* ---------------------------------------------------------------- */
/* Shoal steering                                                    */
/* ---------------------------------------------------------------- */

const STEER = {
  desired: new THREE.Vector3(),
  offset: new THREE.Vector3(),
  separation: new THREE.Vector3(),
};

/**
 * One steering pass over the whole shoal. Pulled out of the render loop so it
 * can be run headless: the formation is the one part of this scene that is
 * either right or wrong, rather than a matter of taste.
 *
 * ctx: { dt, clockMode, pellets, pointer, pointerActive }
 */
export function steerShoal(fish, assignments, ctx) {
  const {
    dt, clockMode = false, pellets = [], pointer = null, pointerActive = false,
    obstacles = [],
  } = ctx;
  const {desired, offset, separation} = STEER;
  const damping = Math.pow(0.88, dt * 60);

  for (let i = 0; i < fish.length; i++) {
    const f = fish[i];
    const post = clockMode ? assignments[i] : null;

    // ---- on station -------------------------------------------------
    // Posts are already spaced, so a stationed fish ignores separation, the
    // pointer and the walls entirely. Without that the shoal shoves itself
    // off the strokes and the digits stop reading.
    if (post && post.station) {
      offset.set(post.x, post.y, post.z).sub(f.position);
      const distance = offset.length();
      if (distance < 0.3) {
        // close enough to settle rather than steer
        f.position.addScaledVector(offset, Math.min(1, dt * 11));
        f.velocity.multiplyScalar(0.7);
      } else {
        offset.divideScalar(distance).multiplyScalar(18 * Math.min(1, distance / 1.5));
        f.velocity.addScaledVector(offset, dt);
      }
      f.velocity.multiplyScalar(damping);
      const stationSpeed = f.velocity.length();
      if (stationSpeed > 2.9) f.velocity.multiplyScalar(2.9 / stationSpeed);
      f.position.addScaledVector(f.velocity, dt);
      f.roll -= f.roll * Math.min(1, dt * 3);
      continue;
    }

    if (post) {
      // ---- dismissed for this minute --------------------------------
      // Head for the edge, then go back to swimming. Holding station at the
      // exit point is what made them stall and twitch; a fish that is not
      // telling the time is just a fish.
      offset.set(post.x, post.y, post.z).sub(f.position);
      const distance = Math.max(offset.length(), 0.001);
      if (!f.dismissed && distance < 1.1) {
        f.dismissed = true;
        f.wander.set(
          rand(-BOUNDS.x, BOUNDS.x),
          rand(BOUNDS.yMin, BOUNDS.yMax),
          rand(BOUNDS.zMin, -1.2),
        );
      }
      if (f.dismissed) {
        // free again, but kept behind the digit plane so they do not swim
        // across the reading
        if (f.position.distanceTo(f.wander) < 0.9) {
          f.wander.set(
            rand(-BOUNDS.x, BOUNDS.x),
            rand(BOUNDS.yMin, BOUNDS.yMax),
            rand(BOUNDS.zMin, -1.2),
          );
        }
        desired.copy(f.wander).sub(f.position).normalize().multiplyScalar(f.speed);
      } else {
        desired.copy(offset).divideScalar(distance).multiplyScalar(1.15);
      }
    } else {
      f.dismissed = false;
      if (f.position.distanceTo(f.wander) < 0.9) {
        f.wander.set(
          rand(-BOUNDS.x, BOUNDS.x),
          rand(BOUNDS.yMin, BOUNDS.yMax),
          rand(BOUNDS.zMin, BOUNDS.zMax),
        );
      }
      desired.copy(f.wander).sub(f.position).normalize().multiplyScalar(f.speed);

      // nearest pellet wins over wandering
      let best = null;
      let bestDistance = 5;
      for (const pellet of pellets) {
        const d = f.position.distanceTo(pellet.position);
        if (d < bestDistance) {
          bestDistance = d;
          best = pellet;
        }
      }
      if (best) {
        offset.copy(best.position).sub(f.position).normalize().multiplyScalar(2.4);
        desired.lerp(offset, 0.75);
        if (bestDistance < 0.22) {
          const index = pellets.indexOf(best);
          if (index >= 0) pellets.splice(index, 1);
        }
      }
    }

    // separation
    // Separation is the only O(n²) work in the frame, so it is skipped for
    // anything under orders and compares squared distances to avoid the root.
    if (!post) {
      separation.set(0, 0, 0);
      for (let j = 0; j < fish.length; j++) {
        if (i === j) continue;
        const d2 = f.position.distanceToSquared(fish[j].position);
        if (d2 < 0.1444 && d2 > 1e-8) {
          offset.copy(f.position).sub(fish[j].position).divideScalar(d2);
          separation.add(offset);
        }
      }
      desired.add(separation.multiplyScalar(0.16));
    }

    // pointer shyness
    if (pointerActive && pointer) {
      const d = f.position.distanceTo(pointer);
      if (d < 2.4) {
        offset.copy(f.position).sub(pointer).normalize().multiplyScalar((2.4 - d) * 1.5);
        desired.add(offset);
      }
    }

    // Rocks and wood push back before contact. Their environment hands back a
    // sphere list for exactly this; without it fish swim through the hardscape.
    for (const obstacle of obstacles) {
      offset.subVectors(f.position, obstacle.center);
      const distance = offset.length();
      const surface = distance - obstacle.radius - f.scale * 0.23;
      if (surface < 0.7 && distance > 0.001) {
        desired.addScaledVector(offset, ((0.7 - surface) * 1.25) / distance);
      }
    }

    // soft walls
    if (f.position.x > BOUNDS.x) desired.x -= (f.position.x - BOUNDS.x) * 2;
    if (f.position.x < -BOUNDS.x) desired.x -= (f.position.x + BOUNDS.x) * 2;
    if (f.position.y > BOUNDS.yMax) desired.y -= (f.position.y - BOUNDS.yMax) * 2;
    if (f.position.y < BOUNDS.yMin) desired.y -= (f.position.y - BOUNDS.yMin) * 2;
    if (f.position.z > BOUNDS.zMax) desired.z -= (f.position.z - BOUNDS.zMax) * 2;
    if (f.position.z < BOUNDS.zMin) desired.z -= (f.position.z - BOUNDS.zMin) * 2;

    const turn = Math.min(1, dt * 1.35);
    const previousX = f.velocity.x;
    f.velocity.lerp(desired, turn);
    const speed = f.velocity.length();
    if (speed > 1.0) f.velocity.multiplyScalar(1.0 / speed);
    f.position.addScaledVector(f.velocity, dt);

    // bank into the turn
    const turnRate = (f.velocity.x - previousX) / Math.max(dt, 0.0001);
    f.roll += (clamp(-turnRate * 0.06, -0.5, 0.5) - f.roll) * Math.min(1, dt * 3);
  }
}

/* ---------------------------------------------------------------- */
/* Scene                                                             */
/* ---------------------------------------------------------------- */
/*
 * The tank is Desktop Habitats' Riverscape, vendored rather than imitated:
 * `riverscape/` holds its own environment, planting, foliage, broadleaf,
 * water and maths modules, unmodified except for two documented patches (see
 * riverscape/NOTICE.md). Its substrate, stones, driftwood, moss, thickets and
 * suspended matter are its own, as is the light rig below, lifted from its
 * main.js.
 *
 * What is ours sits on top of it: a shoal of neons that tells the time, a pair
 * of clownfish, a pump and an air stone.
 *
 * That means this scene lives in Riverscape's coordinates — substrate near
 * y = 0, water surface at y = 10, camera well back on a long lens.
 */

export async function createRiverscape(canvas, options = {}) {
  const reducedMotion =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /*
   * Two profiles. `rich` is Riverscape as published — a desktop scene. `lite`
   * is for a phone or an old tablet left running for hours: no shadow pass, no
   * pre-filtered environment, coarser planting, coarser fish, fewer particles.
   * Auto picks lite on a touch device or one reporting few cores; pass
   * { quality: 'rich' | 'lite' } to override.
   */
  const coarsePointer =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  const quality = options.quality || (coarsePointer || fewCores ? 'lite' : 'rich');
  const lite = quality === 'lite';
  setLOD(quality);

  // Three's exponential fog is grey-scale: every channel fades at the same rate.
  // Water is not. Red is absorbed first and green last, so with distance a tank
  // turns green-teal rather than grey. ?fog=grey restores the stock fog, for A/B.
  const stockFog = typeof location !== 'undefined' && new URLSearchParams(location.search).get('fog') === 'grey';
  if (!stockFog) {
    THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    vec3 fogFactor3 = 1.0 - exp( - pow( fogDensity * vFogDepth * vec3( 1.18, 0.98, 0.84 ), vec3( 2.0 ) ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor3 );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;
  }
  setFishDetail(lite ? 22 : 34, lite ? 12 : 18);

  const devicePixels = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // Riverscape's foliage uses alphaToCoverage, which only means anything on a
    // multisampled framebuffer. Without MSAA it degrades to a dither, and thin
    // swaying blades break up into flickering dots. So this is never turned off,
    // however dense the screen: that is exactly when it used to be.
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  let basePixelRatio = 1;
  let resolutionScale = 1;
  /*
   * Pick the pixel ratio from a pixel budget rather than a fixed cap. The old
   * cap of 1 on the lite profile put a phone's 3x screen on a 1x canvas that the
   * browser then stretched threefold. A phone's CSS size is small, so its budget
   * buys nearly 2x; a big tablet gets close to 1x and the governor handles the rest.
   */
  function fitPixelRatio() {
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    const budget = lite ? 1.15e6 : 2.3e6;   // device pixels
    basePixelRatio = clamp(Math.sqrt(budget / Math.max(1, cssW * cssH)), 1, Math.min(devicePixels, 2));
    renderer.setPixelRatio(basePixelRatio * resolutionScale);
  }
  fitPixelRatio();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.17;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 873k of Riverscape's triangles cast, so the shadow pass is close to a
  // second render of the scene. It is the first thing to go.
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a2a42');
  scene.fog = new THREE.FogExp2('#1f5878', 0.024);

  const camera = new THREE.PerspectiveCamera(25.8, 16 / 9, 0.2, 70);
  camera.position.set(0, 4.65, 20.5);
  camera.lookAt(0, 4.15, 0);

  /* -- light: Riverscape's rig, from its main.js --------------------- */

  scene.add(new THREE.HemisphereLight(0xc2d6e2, 0x30343a, 0.3));

  const key = new THREE.DirectionalLight(0xfff8ee, 4.5);
  key.position.set(-3, 11.5, 4.4);
  key.target.position.set(0, 1, 0);
  key.castShadow = !lite;
  key.shadow.mapSize.set(lite ? 512 : 1024, lite ? 512 : 1024);
  Object.assign(key.shadow.camera, {
    left: -12, right: 12, top: 14, bottom: -10, near: 1, far: 27,
  });
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 3 * 1024 / 4096;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xc2d8e4, 0.44);
  fill.position.set(1, 5, 10);
  scene.add(fill);

  const back = new THREE.DirectionalLight(0xd2ecf2, 0.8);
  back.position.set(2, 10, -4);
  scene.add(back);

  if (!lite) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#2c4456');
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(3.7, 3.8, 3.4),
        side: THREE.DoubleSide,
      }),
    );
    strip.position.set(0, 6, 1);
    strip.rotation.x = Math.PI / 2;
    envScene.add(strip);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
    strip.geometry.dispose();
    strip.material.dispose();
  }

  const backboard = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a6688, roughness: 1 }),
  );
  backboard.position.set(0, 7, -7.2);
  // No shadows on the back panel: the planting's shadows fell on it as long dark smudges,
  // which read as dirt on the glass rather than depth. They still fall on the sand and stones.
  backboard.receiveShadow = false;
  scene.add(backboard);

  /* -- the tank ------------------------------------------------------ */
  // Substrate, stones, driftwood, moss, thickets and suspended matter, all
  // theirs. This is the part that was never going to come right by hand.

  const { obstacles } = await createEnvironment(scene);
  const plants = createPlants(scene, { animatedShadows: !reducedMotion });
  createParticles(scene, { thickets: plants.thickets });

  /* -- our fittings --------------------------------------------------- */

  const BED = (x, z) => groundHeight(x, z);

  // The pump sits at the left edge, cropped by the screen. The full screen view uses a wider
  // lens, which would show the whole housing as a plain black box in the corner, so in that
  // mode it moves further out (see setFullView).
  let fullView = false;
  // x is where its body is centred; `outlet` is how far to the right of that the water leaves
  // the nozzle, which is where the bubbles it entrains begin.
  const PUMP = { x: -7.9, y: 8.5, z: 1.4, outlet: 1.2 };

  /*
   * A small aquarium pump of the kind that hangs in a tank on a suction cup: a rounded
   * cylindrical body with two raised bands, a darker rear cap, a tapered outlet nozzle with a
   * lighter rim, a short intake stub on top, and a power cable that loops up and out of the
   * water. It is about half the size of the black box it replaces.
   */
  function buildPump() {
    const group = new THREE.Group();
    const dark = (color, roughness = 0.5, metalness = 0.2) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const bodyMat = dark('#37444f'), capMat = dark('#1f272d'), bandMat = dark('#566673', 0.4, 0.3), nozzleMat = dark('#415059'), cableMat = dark('#0b0d0f', 0.7, 0);
    const part = (geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const along = Math.PI / 2; // cylinders stand on y; this lays them along x
    part(new THREE.CylinderGeometry(0.4, 0.43, 1.0, 28), bodyMat, 0, 0, 0, 0, 0, along);              // the body
    part(new THREE.CylinderGeometry(0.33, 0.37, 0.32, 24), capMat, -0.64, 0, 0, 0, 0, along);        // the motor cap
    part(new THREE.TorusGeometry(0.43, 0.024, 8, 32), bandMat, -0.18, 0, 0, 0, along, 0);            // two raised bands
    part(new THREE.TorusGeometry(0.43, 0.024, 8, 32), bandMat, 0.2, 0, 0, 0, along, 0);
    part(new THREE.CylinderGeometry(0.16, 0.3, 0.5, 24), nozzleMat, 0.75, 0, 0, 0, 0, -along);       // the outlet, narrowing to the right
    part(new THREE.TorusGeometry(0.16, 0.03, 8, 24), bandMat, 1.0, 0, 0, 0, along, 0);               // its rim
    part(new THREE.CylinderGeometry(0.13, 0.16, 0.28, 18), capMat, -0.12, 0.5, 0);                   // the intake stub on top
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 18), bandMat, -0.12, 0.66, 0);                 // and its cap
    // the power cable: out of the rear cap, curling up and away above the water
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.8, 0.05, 0), new THREE.Vector3(-1.0, 0.6, 0), new THREE.Vector3(-0.85, 1.5, 0),
      new THREE.Vector3(-0.95, 2.8, 0), new THREE.Vector3(-0.9, 6.0, 0),
    ]);
    const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cable, 40, 0.035, 6, false), cableMat);
    group.add(cableMesh);
    return group;
  }
  const pumpGroup = buildPump();
  pumpGroup.position.set(PUMP.x, PUMP.y, PUMP.z);
  scene.add(pumpGroup);

  // An air stone is a small pale porous cylinder, not a black one. It sits on
  // open sand clear of the hero text, and every bubble in the tank comes from
  // bubbles.js: the plume off this stone, fine micro-bubbles the pump entrains,
  // and the odd bubble pearling off a leaf.
  // The stone sits to the right of the clock, so its plume never crosses the time.
  // Where that is depends on the screen: the digits take a share of the width and
  // the frame is only so wide at the stone's depth, so it is placed from the
  // viewport and moved whenever the screen changes shape.
  const STONE = { x: 6.5, z: 2.0, yaw: 0.28, length: 1.1, radius: 0.23, y: 0 };
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#b4bbb3', roughness: 0.96, metalness: 0 });
  stoneMaterial.onBeforeCompile = (shader) => waterLitShader(shader);
  stoneMaterial.customProgramCacheKey = () => 'airstone';
  const stoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, STONE.length, 14), stoneMaterial);
  stoneMesh.rotation.z = Math.PI / 2;
  stoneMesh.rotation.y = STONE.yaw;
  scene.add(stoneMesh);

  function placeStone() {
    const aspect = camera.aspect || 16 / 9;
    const portrait = aspect < 0.9;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const frameWidth = Math.min(2 * tanHalf * aspect * (camera.position.z - 1.2), 15.5);
    // how far right the digits reach, as a share of the frame
    const digitsRight = frameWidth * (portrait ? 0.21 : 0.28);
    camera.updateMatrixWorld(true);
    const probe = new THREE.Vector3();
    let placed = false;
    // Walk from the front of the tank backwards until the stone is just inside the
    // bottom edge (about 97% down). It has to be near the front: behind z~1.5 the
    // foreground plants hide it (measured: 72-78% of it visible at z 2.0, 15-25% at
    // z 0.4-1.2), and an earlier target of 94% down put it at z 0.1, where it was invisible.
    for (let z = 2.4; z >= -0.4 && !placed; z -= 0.1) {
      const halfWidth = tanHalf * aspect * (camera.position.z - z);
      const x = clamp(Math.min(digitsRight + 1.7, halfWidth - 0.9), 2.4, 6.8);
      const y = BED(x, z) - 0.09;
      probe.set(x, y, z).project(camera);
      // the stone is half-buried, so its centre is below the ground line: judge the
      // centre against 98.5% down, which leaves the visible top of it inside the frame
      if (probe.y >= -0.985 || z <= -0.35) {
        STONE.x = x; STONE.z = z; STONE.y = y; placed = true;
      }
    }
    // half-buried: sit a little below the lowest ground under either end
    const ax = Math.cos(STONE.yaw) * STONE.length * 0.5, az = -Math.sin(STONE.yaw) * STONE.length * 0.5;
    STONE.y = Math.min(BED(STONE.x, STONE.z), BED(STONE.x + ax, STONE.z + az), BED(STONE.x - ax, STONE.z - az)) - 0.09;
    stoneMesh.position.set(STONE.x, STONE.y, STONE.z);
  }
  placeStone();
  const bubbles = createBubbles(scene, {
    lite, surfaceY: SURFACE_Y, stone: STONE, pump: PUMP, bedAt: BED,
  });

  // Snails on the front glass, down the right-hand side: they crawl, pause, and sometimes
  // draw back into their shells.
  const GLASS_Z = 3.55; // the inside of the front glass, in front of the planting
  const snails = createSnails(scene, { count: 2, glassZ: GLASS_Z });

  // The strip of front glass the snails may use: down the right-hand side, clear of the clock
  // (whose right edge is at about 81% of the width) and of the words (left and bottom), and
  // worked out from the camera, so it holds at any screen shape.
  const glassRay = new THREE.Vector3();
  function glassPoint(nx, ny) {
    camera.updateMatrixWorld(true);
    glassRay.set(nx, ny, 0.5).unproject(camera).sub(camera.position);
    const t = (GLASS_Z - camera.position.z) / glassRay.z;
    return [camera.position.x + t * glassRay.x, camera.position.y + t * glassRay.y];
  }
  function snailArea() {
    const [x0, y0] = glassPoint(0.7, -0.5);
    const [x1, y1] = glassPoint(0.94, 0.55);
    return { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1) };
  }
  snails.setArea(snailArea());

  /* -- the clownfish's patch ------------------------------------------ */
  // They used to keep house in an anemone. Its tentacles rendered as spiky shards, so it
  // went. The pair keep the same patch of tank, in the nook in front of the left-hand
  // stones, and still hover, browse and bolt for it when something comes close.

  const HOST = new THREE.Vector3(-5.1, BED(-5.1, 1.6) + 0.25, 1.6);
  const swayUniforms = { uTime: { value: 0 } };

  /* -- the shoal ------------------------------------------------------- */

  function swimMaterial(livery) {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.34,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
    material.customProgramCacheKey = () => `fish-${livery || 'neon'}`;

    material.onBeforeCompile = (shader) => {
      waterLitShader(shader, {
        perLight: `
          float enter = max(0.0, -dot(geometryNormal, directLight.direction));
          vec3 through = normalize(directLight.direction + geometryNormal * ${THROUGH.distortion.toFixed(4)});
          float lobe = ${THROUGH.wrap.toFixed(4)}
            + pow(max(dot(geometryViewDir, -through), 0.0), ${THROUGH.sharpness.toFixed(1)});
          reflectedLight.directDiffuse += lit.color * gFishThrough
            * enter * lobe * ${THROUGH.gain.toFixed(1)} * RECIPROCAL_PI;`,
      });

      shader.uniforms.uTime = swayUniforms.uTime;
      const clown = livery === 'clown';
      const define = clown ? '#define FISH_CLOWN\n' : '';

      shader.vertexShader = define + shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aPhase;
           attribute float aSpeed;
           attribute float aFlutter;
           attribute float aPath;
           attribute float aPart;
           attribute vec2 aFishUV;
           uniform float uTime;
           varying float vFishPath;
           varying float vFishPart;
           varying vec2 vFishUV;
           varying vec3 vSkinPoint;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vFishPath = aPath;
           vFishPart = aPart;
           vFishUV = aFishUV;
           vSkinPoint = position;
           float beat = uTime * aSpeed + aPhase;
           #ifdef FISH_CLOWN
             float tailWeight = smoothstep(0.10, -0.30, position.x);
             float wave = sin(position.x * 9.0 + beat);
             transformed.z += wave * 0.012 * tailWeight;
             if (aPart > 1.5) {
               float row = sin(beat * 2.4);
               transformed.z += row * 0.055 * aFlutter;
               transformed.x += cos(beat * 2.4) * 0.022 * aFlutter;
             } else {
               transformed.z += wave * 0.010 * aFlutter;
             }
           #else
             float tailWeight = smoothstep(0.16, -0.30, position.x);
             float wave = sin(position.x * 12.0 + beat);
             transformed.z += wave * 0.050 * tailWeight;
             transformed.z += wave * 0.038 * aFlutter;
             transformed.z -= sin(beat) * 0.008 * smoothstep(0.10, 0.35, position.x);
           #endif`,
        );

      shader.fragmentShader = define + shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying float vFishPath;
           varying float vFishPart;
           varying vec2 vFishUV;
           varying vec3 vSkinPoint;
           vec3 gFishThrough = vec3(0.0);
           const vec3 FISH_ABSORPTION = vec3(${MUSCLE_ABSORPTION.map((v) => v.toFixed(1)).join(', ')});
           const vec3 FISH_FIN_PIGMENT = vec3(${FIN_PIGMENT_DENSITY.map((v) => v.toFixed(2)).join(', ')});
           vec3 fishThrough(float path, vec3 pigment) {
             return exp(-FISH_ABSORPTION * path - pigment)
               * (1.0 - exp(-${TISSUE_SCATTER.toFixed(1)} * path));
           }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           #ifdef FISH_CLOWN
             if (vFishPart < 0.5) {
               float depthT = clamp((vSkinPoint.y + 0.165) / 0.337, 0.0, 1.0);
               float middle = max(1.0 - pow((depthT - 0.52) / 0.52, 2.0), 0.0);
               float bar = exp(-pow((vSkinPoint.x - 0.186) / 0.024, 2.0));
               bar = max(bar, exp(-pow((vSkinPoint.x + 0.004 - 0.028 * middle) / 0.032, 2.0)));
               bar = max(bar, exp(-pow((vSkinPoint.x + 0.238) / 0.022, 2.0)));
               float white = smoothstep(0.5, 0.78, bar);
               float shell = smoothstep(0.14, 0.46, bar);
               diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.014, 0.013, 0.015),
                 max(shell - white, 0.0));
               diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.150, 1.160, 1.120), white);

               float orbit = length((vSkinPoint.xy - vec2(0.277, 0.014)) / 0.044);
               if (orbit < 1.0 && abs(vSkinPoint.z) > 0.015) {
                 vec3 iris = mix(vec3(0.38, 0.135, 0.03), vec3(0.11, 0.04, 0.02),
                   smoothstep(0.45, 1.0, orbit));
                 diffuseColor.rgb = mix(iris, diffuseColor.rgb, smoothstep(0.82, 1.0, orbit));
                 diffuseColor.rgb = mix(vec3(0.02, 0.016, 0.016), diffuseColor.rgb,
                   smoothstep(0.24, 0.52, orbit));
                 float glint = 1.0 - smoothstep(0.0, 0.26,
                   length((vSkinPoint.xy - vec2(0.289, 0.027)) / 0.044));
                 diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 1.0, 0.96), glint * 0.75);
               }
             } else {
               float p = clamp(vFishUV.y, 0.0, 1.0);
               diffuseColor.rgb = mix(vec3(0.900, 0.210, 0.022), vec3(0.014, 0.013, 0.015),
                 smoothstep(0.74, 0.93, p));
               diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.52, 0.51),
                 smoothstep(0.96, 1.0, p) * 0.5);
             }
           #endif
           if (vFishPart < 0.5) {
             vec2 grid = vec2(vFishUV.y * ${SCALE_ROWS[0].toFixed(1)}, vFishUV.x * ${SCALE_ROWS[1].toFixed(1)});
             grid.y += 0.11 * sin(grid.x * 0.62 + 1.3);
             grid.x += grid.y * 0.24 + mod(floor(grid.y), 2.0) * 0.5;
             float fade = 1.0 - smoothstep(0.42, 1.1, max(fwidth(grid.x), fwidth(grid.y)));
             vec2 cell = fract(grid) - 0.5;
             float dome = 1.0 - smoothstep(0.15, 0.55, length(cell * vec2(0.9, 1.0)));
             diffuseColor.rgb *= 1.0 + dome * (0.42 - cell.x * 0.85) * fade * 0.4;
           }`,
        )
        .replace(
          '#include <lights_fragment_begin>',
          `{
             float path = max(vFishPath, ${MUSCLE_FLOOR.toFixed(4)});
             vec3 pigment = vFishPart > 0.5
               ? FISH_FIN_PIGMENT * (1.0 - smoothstep(0.1, 0.95, vFishUV.y)) * 0.35
               : vec3(0.0);
             gFishThrough = fishThrough(path, pigment);
           }
           #include <lights_fragment_begin>`,
        );
    };
    return material;
  }

  function riggedInstances(geometry, count, beat, livery) {
    const phase = new Float32Array(count);
    const speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phase[i] = rand(0, 6.28);
      speed[i] = rand(beat[0], beat[1]);
    }
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1));
    const mesh = new THREE.InstancedMesh(geometry, swimMaterial(livery), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    scene.add(mesh);
    return mesh;
  }

  const shoal = riggedInstances(buildFishGeometry(), FISH_COUNT, [2.4, 3.6]);

  const fish = [];
  {
    const colour = new THREE.Color();
    for (let i = 0; i < FISH_COUNT; i++) {
      fish.push({
        position: new THREE.Vector3(rand(-5, 5), rand(2.6, 7.4), rand(-3, 1.8)),
        velocity: new THREE.Vector3(rand(-1, 1), rand(-0.2, 0.2), rand(-0.5, 0.5)).normalize(),
        wander: new THREE.Vector3(rand(-5, 5), rand(2.6, 7.4), rand(-3, 1.8)),
        scale: rand(0.48, 0.62),
        speed: rand(0.55, 1.0),
        roll: 0,
        orbit: rand(0, 6.28),
        formYaw: rand(-0.22, 0.22),
        settle: 0,
        dismissed: false,
        quaternion: new THREE.Quaternion(),
      });
      shoal.setColorAt(i, colour.setRGB(rand(0.94, 1.04), rand(0.96, 1.04), rand(0.98, 1.06)));
    }
  }

  const CLOWN_COUNT = 2;
  const clownMesh = riggedInstances(buildFishGeometry('clown'), CLOWN_COUNT, [3.8, 4.8], 'clown');
  const clowns = [];
  for (let i = 0; i < CLOWN_COUNT; i++) {
    const female = i === 0;
    clowns.push({
      female,
      position: HOST.clone().add(new THREE.Vector3(female ? -0.5 : 1.0, female ? 1.5 : 0.9, 0.4)),
      velocity: new THREE.Vector3(),
      target: new THREE.Vector3(),
      scale: female ? 1.35 : 1.05,
      yaw: female ? 0 : Math.PI,   // 0 faces +x; the model's nose points along +x
      pitch: 0,
      mode: 'pause',               // pause | move | browse | dart | shelter
      timer: rand(0.3, 1.5),
      browseNext: false,
      foray: false,
      stuck: 0,
      shimmy: 0,
      phase: rand(0, 6.28),        // pectoral rowing phase, driven per fish
      bob: rand(0, 6.28),
      reaction: 0,
      hadFood: false,
      ate: 0,
      alarm: 0,
      quaternion: new THREE.Quaternion(),
    });
    clownMesh.setColorAt(i, new THREE.Color(1, 1, 1));
  }

  /* -- food -------------------------------------------------------------- */

  const PELLET_MAX = 26;
  const pelletMesh = new THREE.InstancedMesh(
    // small: about 6px across on a laptop screen. At 0.11 they were 13px, which is
    // the size of a neon's head, and read as balls rather than food.
    new THREE.SphereGeometry(0.05, 8, 6),
    // a little self-lit warmth, so a pellet reads against dark green water
    new THREE.MeshStandardMaterial({ color: '#e0a94a', emissive: 0x7a4a10, emissiveIntensity: 0.55, roughness: 0.7 }),
    PELLET_MAX,
  );
  pelletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pelletMesh.count = 0;
  // An InstancedMesh computes its bounding sphere once, on first draw. This one
  // starts with no instances, so the sphere is empty (radius -1) and stays that
  // way: the mesh is frustum-culled forever and no food is ever drawn, however
  // many pellets are in the tank. Its instances move every frame anyway.
  pelletMesh.frustumCulled = false;
  scene.add(pelletMesh);
  const pellets = [];

  function feed() {
    for (let i = 0; i < 14 && pellets.length < PELLET_MAX; i++) {
      pellets.push({
        position: new THREE.Vector3(rand(-4.5, 4.5), rand(8.6, 9.4), rand(-1.5, 1.5)),
        sway: rand(0, 6.28),
        life: 0,
      });
    }
  }

  /* -- pointer ----------------------------------------------------------- */

  const pointer = new THREE.Vector3(0, 0, 0);
  let pointerActive = false;
  let pointerIdle = 0;

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - 0.8);
    pointer.set(
      (nx * height * camera.aspect) / 2,
      ny * (height / 2) + camera.position.y,
      0.8,
    );
    pointerActive = true;
    pointerIdle = 0;
  }
  function onPointerLeave() {
    pointerActive = false;
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave);

  /* -- clock ------------------------------------------------------------- */

  /*
   * The page can tell the scene how much room its words leave: a band of the screen, in CSS
   * pixels from the top. The clock is laid out inside it, so it never sits behind the text
   * whatever the screen shape. With no band (full screen view, or no text) it is centred as
   * before.
   */
  let clockArea = null;
  const rayDir = new THREE.Vector3();
  function worldYAtPx(py) {
    const ndcY = 1 - (py / (canvas.clientHeight || window.innerHeight)) * 2;
    camera.updateMatrixWorld(true);
    rayDir.set(0, ndcY, 0.5).unproject(camera).sub(camera.position);
    return camera.position.y + ((1.2 - camera.position.z) / rayDir.z) * rayDir.y;   // on the digit plane, z = 1.2
  }
  function viewFrame() {
    const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - 1.2);
    const frame = {
      width: Math.min(height * camera.aspect, 15.5),
      height: Math.min(height, 8.6),
      fullHeight: height,
      // upright screens put the words at the bottom, so the digits sit higher
      centerY: camera.aspect < 0.9 ? 6.2 : 5.1,
    };
    if (clockArea) {
      const yTop = worldYAtPx(clockArea.top);
      const yBottom = worldYAtPx(clockArea.bottom);
      if (yTop > yBottom) {
        frame.centerY = (yTop + yBottom) / 2;
        frame.maxDigitHeight = (yTop - yBottom) * 0.94;
      }
    }
    return frame;
  }
  /*
   * The full screen view zooms out a little. The page calls this whenever that mode is
   * entered or left. Everything that depends on the lens (the clock's layout, the air
   * stone, the snails' strip) is worked out again from the camera in resize(), and the pump
   * moves so the wider lens does not show its whole housing.
   */
  function setFullView(on) {
    on = !!on;
    if (on === fullView) return;
    fullView = on;
    resize(); // which also places the pump
  }
  // The pump sits at the left edge, partly cropped, as it always has. In the full screen view
  // on a landscape screen the lens is wide enough to show all of it, so it is set a little in
  // from the edge, whatever the screen's width. Upright screens keep it out of view.
  function placePump() {
    if (fullView && camera.aspect >= 1.25) {
      const halfWidth = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect * (camera.position.z - PUMP.z);
      PUMP.x = -(halfWidth - 1.4);
    } else {
      PUMP.x = -7.9;
    }
    pumpGroup.position.x = PUMP.x; // the bubbles read PUMP.x each time one is made
  }
  function setClockArea(top, bottom) {
    // a band too thin to hold digits is ignored, and the default layout is used
    clockArea = top != null && bottom != null && bottom - top > 80 ? { top, bottom } : null;
    assignments = clockAssignments(new Date(), viewFrame());
  }

  let assignments = clockAssignments(new Date(), viewFrame());
  let assignmentMinute = new Date().getMinutes();
  let forceShowUntil = 0;
  let formStrength = 0;

  function showTime() {
    forceShowUntil = performance.now() + CLOCK_ACTIVE_SECONDS * 1000;
    assignments = clockAssignments(new Date(), viewFrame());
  }

  /* -- loop --------------------------------------------------------------- */

  const clock = new THREE.Clock();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const lookMatrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const forwardFix = new THREE.Quaternion().setFromAxisAngle(up, -Math.PI / 2);
  const bankQuaternion = new THREE.Quaternion();
  const bankAxis = new THREE.Vector3(1, 0, 0);
  const formQuaternion = new THREE.Quaternion();
  const rollAxis = new THREE.Vector3(0, 0, 1);
  const clownPitch = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();

  let running = true;
  let visible = true;
  const motionScale = reducedMotion ? 0.45 : 1;
  let frameAccumulator = 0;
  let frameCount = 0;

  function governResolution(dt) {
    frameAccumulator += dt;
    if (++frameCount < 45) return;
    const average = (frameAccumulator / frameCount) * 1000;
    frameAccumulator = 0;
    frameCount = 0;
    let scale = resolutionScale;
    if (average > 21 && scale > 0.75) scale -= 0.125;
    else if (average < 12.5 && scale < 1) scale += 0.1;
    scale = clamp(Number(scale.toFixed(3)), 0.75, 1);
    if (scale !== resolutionScale) {
      resolutionScale = scale;
      resize();
    }
  }

  /*
   * Ocellaris behaviour, from how they actually live: they stay on and around
   * their patch of tank, move in short deliberate darts between long pauses of
   * hovering on fanning pectorals, turn by pivoting rather than snapping round,
   * nose down at the stones and shimmy, rush for food, and bolt home when
   * something big comes near. The larger female holds the best water; the male
   * defers to her. Motion is acceleration-limited so nothing changes velocity in
   * a single frame, and orientation follows velocity through a turn-rate limit.
   * Nothing here ever moves a fish by assigning its position.
   */
  const wrapPI = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  const steer = new THREE.Vector3();
  const clownPhase = clownMesh.geometry.attributes.aPhase;
  clownPhase.setUsage(THREE.DynamicDrawUsage);
  // the rowing rate is driven per fish below, so the shader must not add its own
  clownMesh.geometry.attributes.aSpeed.array.fill(0);
  clownMesh.geometry.attributes.aSpeed.needsUpdate = true;

  // A target inside a rock's push zone can never be reached: the fish would just
  // hover at the edge of it. Their patch sits well inside such a zone, so every
  // target is resampled until it is clear of rock.
  const clearOfRock = (p, scale) =>
    obstacles.every((o) => p.distanceTo(o.center) > o.radius + 0.45 + scale * 0.23);

  function pickIdleTarget(c) {
    const roll = Math.random();
    c.browseNext = false;
    c.foray = false;
    let sample;
    if (roll < 0.15) {
      // an occasional circuit of the tank
      c.foray = true;
      sample = () => c.target.set(rand(-BOUNDS.x + 0.8, BOUNDS.x - 0.8), clamp(rand(2.2, 6.4), 1.4, 7.6), rand(-2.6, 2.2));
    } else if (roll < 0.46) {
      // nose down at the stones, from the open front of their patch
      c.browseNext = true;
      sample = () => c.target.set(HOST.x + rand(-0.6, 0.6), HOST.y + rand(0.4, 0.75), HOST.z + rand(0.1, 0.8));
    } else {
      const reach = c.female ? 2.2 : 3.2;
      sample = () => c.target.set(
        clamp(HOST.x + rand(-reach, reach), -BOUNDS.x, BOUNDS.x),
        clamp(HOST.y + rand(0.7, 2.6), 1.4, 7.6),
        clamp(HOST.z + rand(-1.2, 1.8), -2.6, 2.4),
      );
    }
    sample();
    for (let k = 0; k < 12 && !clearOfRock(c.target, c.scale); k++) sample();
    c.mode = 'move';
  }

  function updateClowns(dt, elapsed) {
    for (let i = 0; i < clowns.length; i++) {
      const c = clowns[i];

      // ---- what does it want right now?
      if (pointerActive && c.position.distanceTo(pointer) < 3.4) {
        if (c.alarm <= 0) c.target.copy(HOST).add(steer.set(rand(-0.3, 0.3), rand(0.25, 0.6), rand(-0.1, 0.35)));
        c.alarm = 1.6;
        c.mode = 'shelter';
      }
      c.alarm = Math.max(0, c.alarm - dt);
      if (c.mode === 'shelter' && c.alarm <= 0) { c.mode = 'pause'; c.timer = rand(1.5, 3); }

      let pellet = null;
      if (pellets.length) {
        if (!c.hadFood) { c.hadFood = true; c.reaction = c.female ? rand(0.08, 0.25) : rand(0.3, 0.7); }
        c.reaction -= dt;
        if (c.alarm <= 0 && c.reaction <= 0) {
          let best = 8;
          for (const p of pellets) {
            // the male does not contest a pellet the female is already going for,
            // but he does go for the next one
            if (!c.female && clowns[0].mode === 'dart' && clowns[0].target.distanceTo(p.position) < 1.2) continue;
            const d = c.position.distanceTo(p.position);
            if (d < best) { best = d; pellet = p; }
          }
        }
      } else {
        c.hadFood = false;
      }

      let cruise = 0.52, accel = 1.6, turnMax = 3.0;
      if (c.mode === 'shelter') {
        cruise = 2.8; accel = 6; turnMax = 8;
      } else if (pellet) {
        c.mode = 'dart'; c.target.copy(pellet.position);
        cruise = 3.2; accel = 7; turnMax = 7;
        if (c.position.distanceTo(pellet.position) < 0.5) {
          const at = pellets.indexOf(pellet);
          if (at >= 0) pellets.splice(at, 1);
          c.ate++;
          c.mode = 'pause'; c.timer = rand(0.4, 1.0);
        }
      } else {
        if (c.mode === 'dart') { c.mode = 'pause'; c.timer = rand(0.3, 0.9); }
        if (c.mode === 'pause') {
          c.timer -= dt;
          if (c.timer <= 0) pickIdleTarget(c);
        } else if (c.mode === 'move') {
          if (c.foray) cruise = 1.05;
          if (c.position.distanceTo(c.target) < 0.28) {
            if (c.browseNext) {
              c.mode = 'browse'; c.timer = rand(2.6, 5.5); c.browseNext = false;
              c.shimmy = Math.random() < 0.6 ? 1.3 : 0;
            } else {
              c.mode = 'pause'; c.timer = c.female ? rand(1.4, 4.2) : rand(1.0, 3.4);
            }
          }
        } else if (c.mode === 'browse') {
          c.timer -= dt;
          if (c.timer <= 0) { c.mode = 'pause'; c.timer = rand(0.5, 1.4); }
        }
      }

      // ---- steer, with limited acceleration
      const still = c.mode === 'pause' || c.mode === 'browse';
      steer.subVectors(c.target, c.position);
      const distance = steer.length();
      const wanted = still || distance < 0.12 ? 0 : Math.min(cruise, distance * 1.8);
      if (distance > 1e-4) steer.multiplyScalar(wanted / distance); else steer.set(0, 0, 0);

      for (const obstacle of obstacles) {
        offset.subVectors(c.position, obstacle.center);
        const d = offset.length();
        const surface = d - obstacle.radius - c.scale * 0.23;
        if (surface < 0.5 && d > 1e-3) steer.addScaledVector(offset, ((0.5 - surface) * 3.0) / d);
      }
      if (!c.female) {
        offset.subVectors(c.position, clowns[0].position);
        const gap = offset.length();
        if (gap < 1.3 && gap > 1e-3) steer.addScaledVector(offset, ((1.3 - gap) * 1.4) / gap);
      }
      if (c.position.x > BOUNDS.x) steer.x -= (c.position.x - BOUNDS.x) * 1.5;
      if (c.position.x < -BOUNDS.x) steer.x -= (c.position.x + BOUNDS.x) * 1.5;
      if (c.position.y > 7.8) steer.y -= (c.position.y - 7.8) * 1.5;
      if (c.position.z > BOUNDS.zMax) steer.z -= (c.position.z - BOUNDS.zMax) * 1.5;
      if (c.position.z < BOUNDS.zMin) steer.z -= (c.position.z - BOUNDS.zMin) * 1.5;

      steer.sub(c.velocity);
      const dvMax = accel * dt;
      const dv = steer.length();
      if (dv > dvMax) steer.multiplyScalar(dvMax / dv);
      c.velocity.add(steer);
      c.position.addScaledVector(c.velocity, dt);

      // ---- orientation follows motion through a turn-rate limit
      const speed = c.velocity.length();
      c.stuck = c.mode === 'move' && speed < 0.07 ? c.stuck + dt : 0;
      if (c.stuck > 1.1) { c.mode = 'pause'; c.timer = rand(0.3, 0.9); c.stuck = 0; c.browseNext = false; }
      let wantYaw = c.yaw;
      if (c.mode === 'browse') {
        wantYaw = Math.atan2(-(HOST.z - c.position.z) * 0.4, HOST.x - c.position.x);
      } else if (speed > 0.18) {
        // depth motion counts for less than lateral, so they stay mostly side-on
        wantYaw = Math.atan2(-c.velocity.z * 0.45, c.velocity.x);
      }
      const err = wrapPI(wantYaw - c.yaw);
      c.yaw += clamp(err, -turnMax * dt, turnMax * dt);

      c.bob += dt * 1.1;
      let tilt = 0;
      if (speed > 0.25) tilt = clamp(c.velocity.y / speed, -1, 1) * 0.5 * Math.min(1, speed / 0.7);
      if (c.mode === 'browse') tilt = -0.5 + Math.sin(elapsed * 1.3 + i) * 0.08;
      else if (c.mode === 'pause') tilt = Math.sin(c.bob * 0.5) * 0.07 - 0.04;
      c.pitch += (tilt - c.pitch) * Math.min(1, dt * 4.5);

      // a quick shimmy on settling in: the whole fish wags side to side
      let wag = 0;
      if (c.shimmy > 0) { c.shimmy -= dt; wag = Math.sin(elapsed * 32) * 0.26 * Math.min(1, c.shimmy * 2); }

      // fins fan faster the harder it works, and even hovering is never still
      const effort = clamp(speed / 1.0, 0, 1);
      c.phase += dt * (3.4 + 4.6 * effort + (c.mode === 'browse' ? 1.6 : 0));
      clownPhase.array[i] = c.phase;

      c.quaternion.setFromAxisAngle(up, c.yaw + wag);
      clownPitch.setFromAxisAngle(rollAxis, c.pitch);
      c.quaternion.multiply(clownPitch);

      scaleVector.setScalar(c.scale);
      matrix.compose(
        offset.set(c.position.x, c.position.y + Math.sin(c.bob) * 0.05, c.position.z),
        c.quaternion,
        scaleVector,
      );
      clownMesh.setMatrixAt(i, matrix);
    }
    clownMesh.instanceMatrix.needsUpdate = true;
    clownPhase.needsUpdate = true;
  }

  function simulate(raw, elapsed) {
    const dt = raw * motionScale;
    swayUniforms.uTime.value = elapsed;
    waterTime.value = elapsed;

    pointerIdle += dt;
    if (pointerIdle > 2.5) pointerActive = false;

    const now = new Date();
    if (now.getMinutes() !== assignmentMinute) {
      assignmentMinute = now.getMinutes();
      assignments = clockAssignments(now, viewFrame());
    }
    const clockMode =
      now.getSeconds() < CLOCK_ACTIVE_SECONDS || performance.now() < forceShowUntil;
    formStrength += ((clockMode ? 1 : 0) - formStrength) * Math.min(1, dt * 3);

    bubbles.update(dt, elapsed);
    snails.update(dt, elapsed);

    for (let i = pellets.length - 1; i >= 0; i--) {
      const pellet = pellets[i];
      pellet.life += dt;
      pellet.position.y -= 0.7 * dt;
      pellet.position.x += Math.sin(elapsed * 1.3 + pellet.sway) * 0.22 * dt;
      if (pellet.position.y < BED(pellet.position.x, pellet.position.z) || pellet.life > 26) {
        pellets.splice(i, 1);
      }
    }

    steerShoal(fish, assignments, { dt, clockMode, pellets, pointer, pointerActive, obstacles });

    for (let i = 0; i < FISH_COUNT; i++) {
      const f = fish[i];

      if (f.velocity.lengthSq() > 0.0004) {
        offset.copy(f.position).add(f.velocity);
        lookMatrix.lookAt(offset, f.position, up);
        f.quaternion.setFromRotationMatrix(lookMatrix);
        f.quaternion.multiply(forwardFix);
        f.quaternion.multiply(bankQuaternion.setFromAxisAngle(bankAxis, f.roll));
      }
      quaternion.copy(f.quaternion);

      const post = assignments[i];
      if (formStrength > 0.02 && post && post.station) {
        const reach = Math.sqrt(
          (f.position.x - post.x) ** 2 +
          (f.position.y - post.y) ** 2 +
          (f.position.z - post.z) ** 2,
        );
        const want = formStrength * (1 - smoothstep(0.2, 1.1, reach));
        f.settle += (want - f.settle) * Math.min(1, dt * 3.5);
        if (f.settle > 0.01) {
          if (post.horizontal) formQuaternion.setFromAxisAngle(up, f.formYaw);
          else formQuaternion.setFromAxisAngle(rollAxis, Math.PI / 2 + f.formYaw * 0.4);
          quaternion.slerp(formQuaternion, f.settle * 0.95);
        }
      } else {
        f.settle -= f.settle * Math.min(1, dt * 2.5);
      }

      scaleVector.setScalar(f.scale);
      matrix.compose(f.position, quaternion, scaleVector);
      shoal.setMatrixAt(i, matrix);
    }
    shoal.instanceMatrix.needsUpdate = true;

    updateClowns(dt, elapsed);

    pelletMesh.count = pellets.length;
    for (let i = 0; i < pellets.length; i++) {
      matrix.compose(pellets[i].position, bankQuaternion.identity(), scaleVector.setScalar(1));
      pelletMesh.setMatrixAt(i, matrix);
    }
    if (pellets.length) pelletMesh.instanceMatrix.needsUpdate = true;

  }

  let simElapsed = 0;
  function step() {
    const raw = Math.min(clock.getDelta(), 0.05);
    governResolution(raw);
    simElapsed = clock.elapsedTime;
    simulate(raw, simElapsed);
    renderer.render(scene, camera);
  }

  /** Fast-forward the simulation without drawing. For tests and previews. */
  function advance(seconds, stepSeconds = 1 / 30) {
    for (let t = 0; t < seconds; t += stepSeconds) {
      simElapsed += stepSeconds;
      simulate(stepSeconds, simElapsed);
    }
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!visible || document.hidden) {
      clock.getDelta();
      return;
    }
    step();
  }

  /* -- sizing -------------------------------------------------------------- */

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    fitPixelRatio();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    // Riverscape's lens is tuned for a landscape screen. On a narrow one it would
    // show a slice of tank barely four units wide, so the lens widens as the
    // screen narrows (to at most 42 degrees) rather than losing the scene.
    // Habitats' own lens is 25.8 degrees. The full screen view is wider (38), so much more of
    // the tank shows. Narrower screens widen it further (up to 42), as they always did, so
    // the upright phone view is unchanged; taking the larger of the two keeps it continuous as
    // a window changes shape.
    camera.fov = Math.max(fullView ? 38 : 25.8, clamp(25.8 * Math.sqrt(1.25 / camera.aspect), 25.8, 42));
    // a wider lens also sees further down, past the end of the substrate, so it
    // looks up a little as it widens
    camera.lookAt(0, 4.15 + (camera.fov - 25.8) * 0.07, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    placeStone();
    snails.setArea(snailArea());
    placePump();
    bubbles.setViewport(renderer.domElement.height, camera.fov);
    assignments = clockAssignments(new Date(), viewFrame());
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(canvas);

  loop();
  if (options.onReady) requestAnimationFrame(() => options.onReady());

  function dispose() {
    running = false;
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material.map) material.map.dispose();
          material.dispose();
        }
      }
    });
    renderer.dispose();
  }

  return { feed, showTime, advance, setClockArea, setFullView, dispose, quality, scene, camera, debug: { clowns, obstacles, HOST, snails: snails.list, snailArea } };
}
