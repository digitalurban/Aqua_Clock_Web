import * as THREE from 'three';
import { waterLitShader } from './riverscape/water.js';

/*
 * Ghost shrimp, living on the sand in the front of the tank.
 *
 * What is modelled is what the animal is, from how ghost shrimp are described: a mostly
 * transparent body with the dark line of the gut showing through; a toothed "horn" (the
 * rostrum) and two stalked eyes; two pairs of antennae, one long and sweeping, one short;
 * five pairs of legs, the front two ending in tiny claws that pick at the sand for food;
 * small paddle-like swimmerets under the abdomen; a body that curves down to a fan-shaped tail.
 *
 * They are mostly bottom-dwellers, so they scuttle over the sand, stopping to pick at it with
 * the front claws and to groom their antennae. They walk over the low stones and also climb them to sit
 * on top, and they swim to the tops of the tall rocks, rising above the rock, coming down on the flat of
 * its top, and sitting there before swimming off. They have the whole width of the sand. On a stone
 * they sit picking at the surface; now and then they swim up into the water, legs folded back and
 * swimmerets beating, to a new spot on the sand; and rarely they flick the tail under the body
 * to shoot backward.
 *
 * Each is a small state machine:
 *   walk    -> forage | groom | walk | swim | climb | flick
 *   forage  -> walk | groom | swim | climb | forage
 *   groom   -> walk
 *   swim    -> forage        (lifts off, glides to a target, descends and lands)
 *   climb   -> perch         (walks up the stone to its top)
 *   perch   -> descend       (sits and picks at the stone)
 *   descend -> walk          (walks off the stone)
 *   flick   -> forage
 * Position is integrated from a heading and a speed, never assigned, and the heading turns at a
 * limited rate, so nothing jumps; the flick is the one quick movement, a decaying backward
 * impulse.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapPI = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

// the sand in the front of the tank, where they can be seen
let area = { minX: -2.5, maxX: 6.2, minZ: 0.7, maxZ: 3.0 };

function material(params, key) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (shader) => waterLitShader(shader);
  m.customProgramCacheKey = () => 'shrimp-' + key;
  return m;
}

// a thin tapered tube lying along +x, starting at the origin
function tube(length, r0, r1, sides = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, length, sides);
  g.rotateZ(-Math.PI / 2);
  g.translate(length / 2, 0, 0);
  return g;
}

/*
 * The height of a stone's top surface, as a grid over its footprint. The stones are noisy
 * ellipsoids, turned and leaning, so their surface has no formula; but it is a mesh, and the
 * highest vertex in each small cell is the top of the stone there. Built once, from the
 * stone's own vertices, when a shrimp first climbs it.
 */
function buildGrid(mesh) {
  mesh.updateMatrix();
  const pos = mesh.geometry.attributes.position, m = mesh.matrix, v = new THREE.Vector3();
  const n = pos.count, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    X[i] = v.x; Y[i] = v.y; Z[i] = v.z;
    if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x;
    if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z;
  }
  const CELL = 0.04, nx = Math.ceil((x1 - x0) / CELL) + 2, nz = Math.ceil((z1 - z0) / CELL) + 2;
  const top = new Float32Array(nx * nz).fill(-1e9);
  for (let i = 0; i < n; i++) {
    const k = Math.floor((Z[i] - z0) / CELL) * nx + Math.floor((X[i] - x0) / CELL);
    if (Y[i] > top[k]) top[k] = Y[i];
  }
  // a cell with no vertex in it takes the mean of its neighbours, if it has enough of them
  const f = top.slice();
  for (let iz = 1; iz < nz - 1; iz++) {
    for (let ix = 1; ix < nx - 1; ix++) {
      const k = iz * nx + ix;
      if (top[k] > -1e8) continue;
      let sum = 0, c = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const q = top[(iz + dz) * nx + ix + dx];
        if (q > -1e8) { sum += q; c++; }
      }
      if (c >= 3) f[k] = sum / c;
    }
  }
  // the top of the stone: the highest cell, and the middle of the cells within a tenth of that height of it,
  // so that there is a place to land and not a spike
  let max = -1e9, maxK = 0;
  for (let k = 0; k < f.length; k++) if (f[k] > max) { max = f[k]; maxK = k; }
  let sx = 0, sz = 0, cnt = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (f[iz * nx + ix] > max - 0.1 * Math.max(0.5, max)) { sx += x0 + (ix + 0.5) * CELL; sz += z0 + (iz + 0.5) * CELL; cnt++; }
    }
  }
  // and the front of the top: of the cells near the highest that are an exposed crest (no higher than anything
  // within about 0.3 around them: not down in a groove between two ridges, where a shrimp would be buried),
  // the one nearest the camera (the largest z), so that a shrimp landing there is on the side of the rock
  // that can be seen and not hidden behind its bulk
  let fx = 0, fz = -1e9, sfx = 0, sfz = -1e9;     // (sf: the same, but with the rock under a whole body's width of it)
  const R = Math.round(0.3 / CELL), R2 = Math.round(0.25 / CELL);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const v = f[iz * nx + ix];
      if (v <= max - 0.12 * Math.max(0.5, max)) continue;
      const z = z0 + (iz + 0.5) * CELL;
      if (z <= fz) continue;
      let crest = true;
      for (let dz = -R; dz <= R && crest; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const jz = iz + dz, jx = ix + dx;
          if (jz < 0 || jx < 0 || jz >= nz || jx >= nx) continue;
          if (f[jz * nx + jx] > v + 0.03) { crest = false; break; }
        }
      }
      if (crest) { fz = z; fx = x0 + (ix + 0.5) * CELL; }
    }
  }
  // the same again, but only where there is rock under a whole body's width of it (nothing hangs over an
  // edge, and it is not on a spire), if there is anywhere like that
  for (let iz = R2; iz < nz - R2; iz++) {
    for (let ix = R2; ix < nx - R2; ix++) {
      const v = f[iz * nx + ix];
      if (v <= max - 0.2 * Math.max(0.5, max)) continue;
      const z = z0 + (iz + 0.5) * CELL;
      if (z <= sfz) continue;
      let ok = true;
      for (let dz = -R2; dz <= R2 && ok; dz++) {
        for (let dx = -R2; dx <= R2; dx++) {
          const q = f[(iz + dz) * nx + ix + dx];
          if (q < -1e8 || q < v - 0.3 || q > v + 0.12) { ok = false; break; }
        }
      }
      if (ok) { sfz = z; sfx = x0 + (ix + 0.5) * CELL; }
    }
  }
  if (sfz > -1e8) { fx = sfx; fz = sfz; }
  if (fz < -1e8) { fx = x0 + ((maxK % nx) + 0.5) * CELL; fz = z0 + (Math.floor(maxK / nx) + 0.5) * CELL; }   // no crest found: the highest point
  const peak = { max, fx, fz, x: sx / Math.max(1, cnt), z: sz / Math.max(1, cnt), mx: x0 + ((maxK % nx) + 0.5) * CELL, mz: z0 + (Math.floor(maxK / nx) + 0.5) * CELL };
  return {
    peak,
    at(x, z) {
      const fx = (x - x0) / CELL, fz = (z - z0) / CELL, ix = Math.floor(fx), iz = Math.floor(fz);
      if (ix < 0 || iz < 0 || ix >= nx - 1 || iz >= nz - 1) return null;
      const a = f[iz * nx + ix], b = f[iz * nx + ix + 1], c = f[(iz + 1) * nx + ix], d = f[(iz + 1) * nx + ix + 1];
      if (a < -1e8 || b < -1e8 || c < -1e8 || d < -1e8) return null;
      const tx = fx - ix, tz = fz - iz;
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    },
  };
}

function makeShrimp(geo, mats) {
  const root = new THREE.Group(); // where it stands, which way it faces, and how the surface slopes
  root.rotation.order = 'YZX';
  const body = new THREE.Group(); // dips its head, and takes the tail flick
  root.add(body);
  const add = (parent, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  };

  // head and thorax: the carapace, the horn between the eyes, the eyes, the gut showing through
  add(body, geo.sphere, mats.body, 0.2, 0.22, 0, 0.21, 0.12, 0.12);
  const horn = add(body, geo.horn, mats.body, 0.4, 0.27, 0);
  horn.rotation.z = 0.2;
  for (const s of [1, -1]) add(body, geo.sphere, mats.eye, 0.4, 0.285, 0.09 * s, 0.03, 0.03, 0.03);
  add(body, geo.gut, mats.gut, 0.12, 0.22, 0, 0.3, 0.9, 0.9);

  // the abdomen: six segments in a chain, each bending a little, so the body can curve and curl;
  // the first five carry a pair of swimmerets underneath
  const abdomen = [];
  const pleopods = [];
  const segLen = 0.1;
  let parent = body;
  for (let i = 0; i < 6; i++) {
    const joint = new THREE.Group();
    joint.position.set(i === 0 ? 0.04 : -segLen, i === 0 ? 0.2 : 0, 0);
    parent.add(joint);
    add(joint, geo.sphere, mats.body, -segLen / 2, 0, 0, segLen * 0.62, 0.095 - i * 0.008, 0.09 - i * 0.008);
    add(joint, geo.gut, mats.gut, -segLen / 2, 0.012, 0, segLen * 1.05, 0.7, 0.7);
    if (i < 5) {
      for (const s of [1, -1]) {
        const stalk = new THREE.Group();
        stalk.position.set(-segLen / 2, -0.07, 0.045 * s);
        joint.add(stalk);
        add(stalk, geo.sphere, mats.leg, 0, -0.025, 0, 0.012, 0.03, 0.014);
        pleopods.push({ stalk, i, s });
      }
    }
    abdomen.push(joint);
    parent = joint;
  }
  // the tail fan: a middle plate and two side plates, with the small specks it carries
  const tail = new THREE.Group();
  tail.position.set(-segLen, 0, 0);
  parent.add(tail);
  add(tail, geo.sphere, mats.body, -0.06, 0, 0, 0.09, 0.012, 0.03);
  for (const s of [1, -1]) {
    const plate = add(tail, geo.sphere, mats.body, -0.055, 0, 0.045 * s, 0.075, 0.01, 0.035);
    plate.rotation.y = 0.35 * s;
    add(tail, geo.sphere, mats.speck, -0.09, 0.012, 0.028 * s, 0.012, 0.012, 0.012);
  }

  // five pairs of legs; the front two end in claws and do the picking
  const legs = [];
  const attach = [0.34, 0.28, 0.21, 0.14, 0.07];
  for (let i = 0; i < 5; i++) {
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(attach[i], 0.15, 0.06 * s);
      body.add(g);
      const baseYaw = -s * (Math.PI / 2 - (0.55 - i * 0.28)); // out to the side: the front ones forward of it, the back ones behind
      g.rotation.y = baseYaw;
      const upper = new THREE.Group();
      upper.rotation.z = -0.55;
      g.add(upper);
      add(upper, geo.leg1, mats.leg, 0, 0, 0);
      const lower = new THREE.Group();
      lower.position.set(0.13, 0, 0);
      lower.rotation.z = -0.8;
      upper.add(lower);
      add(lower, geo.leg2, mats.leg, 0, 0, 0);
      if (i < 2) add(lower, geo.sphere, mats.leg, 0.09, 0, 0, 0.022, 0.013, 0.013);
      legs.push({ g, upper, lower, i, s, baseYaw });
    }
  }

  // two long antennae, each a chain that can sweep, and two short antennules
  const antennae = [];
  for (const s of [1, -1]) {
    const base = new THREE.Group();
    base.position.set(0.4, 0.24, 0.05 * s);
    body.add(base);
    const joints = [];
    let p = base;
    for (let i = 0; i < 5; i++) {
      const j = new THREE.Group();
      if (i > 0) j.position.x = 0.2;
      p.add(j);
      add(j, geo.antenna, mats.antenna, 0, 0, 0);
      joints.push(j);
      p = j;
    }
    antennae.push({ s, base, joints });
    const short = add(body, geo.antennule, mats.antenna, 0.43, 0.25, 0.03 * s);
    short.rotation.y = -0.35 * s;
  }

  return { root, body, abdomen, legs, antennae, pleopods };
}

export function createShrimp(scene, { count = 2, ground, obstacles = [] } = {}) {
  const geo = {
    sphere: new THREE.SphereGeometry(1, 14, 10),
    horn: (() => { const g = new THREE.ConeGeometry(0.03, 0.2, 6); g.rotateZ(-Math.PI / 2); g.translate(0.1, 0, 0); return g; })(),
    gut: (() => { const g = new THREE.CylinderGeometry(0.02, 0.02, 1, 6); g.rotateZ(Math.PI / 2); return g; })(),
    leg1: tube(0.13, 0.011, 0.008),
    leg2: tube(0.09, 0.008, 0.005),
    antenna: tube(0.2, 0.011, 0.007, 5),   // thick enough to show: the real ones are finer, but sub-pixel tubes break into dots
    antennule: tube(0.22, 0.009, 0.005, 5),
  };
  const mats = {
    // mostly see-through, as a ghost shrimp is, with a warm pink-tan so they show against the sand;
    // the gut and the eyes are opaque, so they show
    body: material({ color: '#f29f84', roughness: 0.35, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false }, 'body'),
    leg: material({ color: '#e89a80', roughness: 0.5, metalness: 0, transparent: true, opacity: 0.9, depthWrite: false }, 'leg'),
    antenna: material({ color: '#e09b85', roughness: 0.5, metalness: 0, transparent: true, opacity: 0.9, depthWrite: false }, 'antenna'),
    gut: material({ color: '#7a4a32', roughness: 0.7, metalness: 0 }, 'gut'),
    eye: material({ color: '#14110c', roughness: 0.25, metalness: 0 }, 'eye'),
    speck: material({ color: '#d98a4a', roughness: 0.6, metalness: 0 }, 'speck'),
  };

  // The low stones are not walls to a shrimp: it walks over them, as well as climbing them on purpose to
  // sit on top, and that is what lets it get from one end of the sand to the other. The tall rocks and
  // the air stone block it on foot; but it can swim, and it swims up to the tops of the tall rocks.
  // Each stone's surface grid is built the first time a shrimp is near it.
  const stones = obstacles.filter((o) => o.mesh && o.mesh.scale.y <= 0.6);
  const solid = obstacles.filter((o) => !stones.includes(o));
  const tall = solid.filter((o) => o.mesh);
  const clearOfRock = (x, z, margin) => solid.every((o) => Math.hypot(x - o.center.x, z - o.center.z) > o.radius + margin);
  const gridOf = (o) => (o.grid ??= buildGrid(o.mesh));
  // the tall rocks with a top well above the sand (some of the larger objects are barely above it): worth a swim
  let perchableList = null;
  const perchable = () => (perchableList ??= tall.filter((o) => gridOf(o).peak.max > 0.7));
  // a stone whose top is inside a tall rock's keep-clear circle is not a place to go or to start
  const reachable = (o) => clearOfRock(o.center.x, o.center.z, 0);
  // the height they stand at: the sand, or the top of a stone, if it is higher there; or the tall rock they are on
  function heightAt(s, x, z) {
    let y = ground(x, z);
    for (const o of stones) {
      if (Math.hypot(x - o.center.x, z - o.center.z) > o.radius + 0.4) continue;
      const t = gridOf(o).at(x, z);
      if (t !== null && t > y) y = t;
    }
    if (s.rock && !stones.includes(s.rock)) {
      const t = gridOf(s.rock).at(x, z);
      if (t !== null && t > y) y = t;
    }
    return y;
  }
  // the highest surface at a place, of the sand and of every stone and rock (for checking a flight clears them)
  function surfaceAt(x, z, except) {
    let y = ground(x, z);
    for (const o of obstacles) {
      if (o === except || !o.mesh || Math.hypot(x - o.center.x, z - o.center.z) > o.radius + 0.4) continue;
      const t = gridOf(o).at(x, z);
      if (t !== null && t > y) y = t;
    }
    return y;
  }

  const list = [];
  for (let i = 0; i < count; i++) {
    let x, z, tries = 0;
    do {
      x = rand(area.minX + 0.4, area.maxX - 0.4);
      z = rand(area.minZ + 0.2, area.maxZ - 0.2);
      tries++;
    } while (tries < 80 && !clearOfRock(x, z, 0.7));
    const model = makeShrimp(geo, mats);
    const size = rand(0.45, 0.55);
    model.root.scale.setScalar(size);
    scene.add(model.root);
    Object.assign(model, {
      size, x, z,
      heading: rand(-Math.PI, Math.PI),
      cruise: rand(0.09, 0.15),
      turn: rand(-0.3, 0.3),
      turnTimer: rand(2, 5),
      phase: rand(0, 6.28),
      stride: rand(0, 6.28),
      state: i % 2 === 0 ? 'walk' : 'forage',
      timer: rand(3, 9),
      moving: 0,       // 0 = standing, 1 = going: eases, so the legs do not snap
      flickT: 0,
      lift: 0,         // the flick's little rise
      alt: 0,          // height above the surface while swimming
      altVel: 0,
      rock: null,      // the stone it is on, climbing, or leaving
      tx: 0, tz: 0, swimAlt: 0, swimSpeed: 0.5,
      slow: 1,
      swimming: 0,     // 0 = on the surface, 1 = swimming: eases, so the legs fold and unfold smoothly
      flicks: 0, swims: 0, climbs: 0, rockTrips: 0,
      land: null,      // set when it is swimming to the top of a tall rock: { rock, y (where it lands), max (the highest point) }
    });
    list.push(model);
  }

  // ---- choosing what to do next ----
  function startSwim(s) {
    let tx, tz, tries = 0;
    do {
      const a = rand(0, Math.PI * 2), d = rand(1.5, 5);
      tx = clamp(s.x + Math.cos(a) * d, area.minX + 0.3, area.maxX - 0.3);
      tz = clamp(s.z + Math.sin(a) * d * 0.6, area.minZ + 0.2, area.maxZ - 0.2);
      tries++;
    } while (tries < 30 && !clearOfRock(tx, tz, 1.0));
    Object.assign(s, { state: 'swim', tx, tz, swimAlt: rand(0.45, 1.8), swimSpeed: rand(0.7, 1.0), timer: 16 + Math.hypot(tx - s.x, tz - s.z) / 0.4, rock: null, land: null });
    s.swims++;
  }
  // Swim to the top of a tall rock: up to above its top, over to the middle of the flat of it, and down
  // onto it. (`only` names the rock; otherwise it is one of the three nearest.)
  function startRockTrip(s, only) {
    const near = perchable().filter((o) => o.center.x > area.minX - 2 && o.center.x < area.maxX + 2);
    if (!near.length) return false;
    near.sort((a, b) => Math.hypot(a.center.x - s.x, a.center.z - s.z) - Math.hypot(b.center.x - s.x, b.center.z - s.z));
    const o = only || near[Math.min(near.length - 1, Math.floor(Math.random() * Math.min(3, near.length)))];
    const g = gridOf(o), top = g.peak;
    let lx = top.fx, lz = top.fz, y = g.at(lx, lz);                  // the front of the top, where it can be seen
    if (y === null) { lx = top.x; lz = top.z; y = g.at(lx, lz); }   // or the middle of it
    if (y === null) { lx = top.mx; lz = top.mz; y = top.max; }       // or its highest point
    const dist = Math.hypot(lx - s.x, lz - s.z);
    Object.assign(s, { state: 'swim', tx: lx, tz: lz, swimAlt: 0, swimSpeed: rand(0.7, 0.95), timer: 25 + dist / 0.2, rock: null, land: { rock: o, y, max: top.max } });
    s.swims++; s.rockTrips++;
    return true;
  }
  // no other stone lies across the straight line from the shrimp to this one: with one in the way,
  // the pull toward the target and the push away from the obstacle cancel, and it gets stuck
  function pathClear(s, o) {
    const dx = o.center.x - s.x, dz = o.center.z - s.z, len2 = dx * dx + dz * dz || 1;
    return solid.every((q) => {
      if (q === o) return true;
      const t = clamp(((q.center.x - s.x) * dx + (q.center.z - s.z) * dz) / len2, 0, 1);
      return Math.hypot(q.center.x - (s.x + t * dx), q.center.z - (s.z + t * dz)) > q.radius * 0.85 + 0.1;
    });
  }
  function startClimb(s) {
    const near = stones.filter((o) => reachable(o) && o.center.x > area.minX - 0.2 && o.center.x < area.maxX + 0.2 && o.center.z > area.minZ - 0.2 && o.center.z < area.maxZ + 0.6 && pathClear(s, o));
    if (!near.length) return false;
    near.sort((a, b) => Math.hypot(a.center.x - s.x, a.center.z - s.z) - Math.hypot(b.center.x - s.x, b.center.z - s.z));
    s.rock = near[Math.min(near.length - 1, Math.floor(Math.random() * Math.min(3, near.length)))];
    s.state = 'climb';
    // time enough to get there at the pace it walks, and a margin; a stone far off is a long way
    s.timer = 12 + Math.hypot(s.rock.center.x - s.x, s.rock.center.z - s.z) / 0.07;
    s.climbs++;
    return true;
  }
  function nextAfterWalk(s) {
    const r = Math.random();
    if (r < 0.05) { s.state = 'flick'; s.flickT = 0; s.flicks++; }
    else if (r < 0.17) { if (!(Math.random() < 0.7 && startRockTrip(s))) startSwim(s); }   // mostly to a tall rock
    else if (r < 0.30 && startClimb(s)) { /* on its way up */ }
    else if (r < 0.62) { s.state = 'forage'; s.timer = rand(3, 7); }
    else if (r < 0.76) { s.state = 'groom'; s.timer = rand(2, 4); }
    else { s.state = 'walk'; s.timer = rand(4, 11); s.turn = rand(-0.3, 0.3); }
  }
  function nextAfterForage(s) {
    const r = Math.random();
    if (r < 0.52) { s.state = 'walk'; s.timer = rand(4, 11); s.turn = rand(-0.3, 0.3); }
    else if (r < 0.60) { if (!(Math.random() < 0.7 && startRockTrip(s))) startSwim(s); }
    else if (r < 0.70 && startClimb(s)) { /* on its way up */ }
    else if (r < 0.9) { s.state = 'groom'; s.timer = rand(2, 4); }
    else s.timer = rand(2, 5);
  }

  // steer away from the stones (all but the one it means to be on), slowing as it gets close
  function steerAway(s, except, height = 0) {
    let steer = 0;
    s.nearest = 9;
    for (const o of solid) {
      if (o === except) continue;
      // flying well above a rock's top, it does not need to go round it
      if (height > 0 && height > (o.mesh ? gridOf(o).peak.max : 1e9) + 0.3) continue;
      const dx = s.x - o.center.x, dz = s.z - o.center.z;
      const surface = Math.hypot(dx, dz) - o.radius - 0.3 * s.size;
      if (surface < s.nearest) s.nearest = surface;
      if (surface < 0.7) {
        const away = Math.atan2(-dz, dx);
        steer += clamp(wrapPI(away - s.heading), -1, 1) * (0.7 - surface) * 3.2;
        if (surface < 0.2) s.slow = Math.min(s.slow, Math.max(0.2, surface / 0.2));
      }
    }
    return steer;
  }
  function steerInside(s) {
    const margin = 0.35;
    if (s.x < area.minX + margin || s.x > area.maxX - margin || s.z < area.minZ + margin || s.z > area.maxZ - margin) {
      const toCentre = Math.atan2(-((area.minZ + area.maxZ) / 2 - s.z), (area.minX + area.maxX) / 2 - s.x);
      return clamp(wrapPI(toCentre - s.heading), -1, 1) * 1.4;
    }
    return 0;
  }

  function update(dt, time) {
    for (const s of list) {
      s.timer -= dt;
      s.slow = 1;
      let speed = 0;

      if (s.state === 'walk') {
        speed = s.cruise;
        s.turnTimer -= dt;
        if (s.turnTimer <= 0) { s.turn = rand(-0.35, 0.35); s.turnTimer = rand(2, 5); }
        s.heading += clamp(s.turn + steerAway(s, null) + steerInside(s), -1.3, 1.3) * dt;
        if (s.timer <= 0) nextAfterWalk(s);
      } else if (s.state === 'forage') {
        if (s.timer <= 0) nextAfterForage(s);
      } else if (s.state === 'groom') {
        if (s.timer <= 0) { s.state = 'walk'; s.timer = rand(4, 11); }
      } else if (s.state === 'flick') {
        s.flickT += dt;
        // a quick backward shot that dies away, with a little rise: the tail curls under
        const back = 1.5 * Math.exp(-s.flickT / 0.18);
        const nx = s.x - Math.cos(s.heading) * back * dt, nz = s.z + Math.sin(s.heading) * back * dt;
        const blocked = !clearOfRock(nx, nz, 0.3 * s.size) || nx < area.minX || nx > area.maxX || nz < area.minZ || nz > area.maxZ;
        if (!blocked) { s.x = nx; s.z = nz; }
        s.lift = 0.22 * Math.sin(Math.PI * clamp(s.flickT / 0.5, 0, 1));
        if (s.flickT > 0.6) { s.state = 'forage'; s.timer = rand(1.5, 3); s.lift = 0; }
      } else if (s.state === 'swim') {
        // lift off, glide toward the target steering round the stones, and come down on it. A trip to a tall
        // rock rises to above its top, comes down over the landing place, and lands on the rock.
        const dx = s.tx - s.x, dz = s.tz - s.z, dist = Math.hypot(dx, dz);
        const want = Math.atan2(-dz, dx);
        s.heading += clamp(clamp(wrapPI(want - s.heading), -1, 1) * 2 + steerAway(s, s.land ? s.land.rock : null, s.gy + s.alt), -1.8, 1.8) * dt;
        speed = s.swimSpeed * (dist > 0.4 ? 1 : 0.2 + dist / 0.5);
        if (s.timer <= 0) {
          // out of time: come down where it is, unless that is over a rock, and then on to a clear place on the sand
          if (surfaceAt(s.x, s.z) > ground(s.x, s.z) + 0.25) startSwim(s);
          else { s.tx = s.x; s.tz = s.z; s.land = null; }
        }
        // The highest surface here and a body's length ahead (leaving out the rock it is landing on): it
        // flies above that, so it never flies into a rock that is in the way.
        const ahead = Math.cos(s.heading), aheadZ = -Math.sin(s.heading), except = s.land ? s.land.rock : null;
        let floor = 0;
        if (dist > 0.5) for (let k = 0; k <= 4; k++) floor = Math.max(floor, surfaceAt(s.x + ahead * 0.3 * k, s.z + aheadZ * 0.3 * k, except));
        // Near any rock it flies above the whole of it (its highest point and a margin), and not only above the
        // surface it is over: the look-ahead sees what is along the way, and this covers the shape it cannot see,
        // like the far side of a rock and the edges of cliffs. The rock it is landing on counts only until it is
        // close to the landing place.
        let peakFloor = 0;
        for (const o of tall) {
          if (o === except && dist < 1.0) continue;
          if (Math.hypot(s.x - o.center.x, s.z - o.center.z) < o.radius + 0.8) peakFloor = Math.max(peakFloor, gridOf(o).peak.max + 0.3);
        }
        let absTarget;
        if (s.land) {
          // far off: above the top of the rock. Within a unit of the landing place: down over the flat of the top.
          const near = clamp((dist - 0.3) / 0.7, 0, 1);                       // 1 far away, 0 over the landing place
          const rockHere = gridOf(s.land.rock).at(s.x, s.z);
          const here = rockHere !== null ? rockHere : s.land.y;
          absTarget = here + near * Math.max(0, s.land.max + 0.3 - here);
          if (floor > 0) absTarget = Math.max(absTarget, floor + 0.28);
          absTarget = Math.max(absTarget, peakFloor);
          // above the surface of its own rock between here and the landing place too (not beyond it): the side of
          // a rock can rise faster than it can, and it would dip into it
          {
            const grid = gridOf(s.land.rock);
            let own = 0;
            for (let k = 0; k <= 4; k++) { const d = Math.min(0.3 * k, dist); own = Math.max(own, grid.at(s.x + ahead * d, s.z + aheadZ * d) ?? 0); }
            absTarget = Math.max(absTarget, own + 0.05);
          }
        } else {
          absTarget = s.gy + (dist > 1.1 ? s.swimAlt : 0);
          if (dist > 0.5) absTarget = Math.max(absTarget, floor + 0.28);
          absTarget = Math.max(absTarget, peakFloor);
        }
        const altTarget = Math.max(0, absTarget - s.gy);
        // up at a steady rate, or quicker when it has a long way to go (a rock rising ahead); down more slowly
        const rate = altTarget > s.alt ? (altTarget - s.alt > 0.25 ? 1.8 : 1.1) : 0.9;
        const before = s.alt;
        s.alt += clamp(altTarget - s.alt, -rate * dt, rate * dt);
        // and a hard floor under all of that: never below the surface it is over (the look-ahead should have
        // lifted it already; this is for whatever it missed)
        const hard = Math.max(surfaceAt(s.x, s.z, except), s.land ? (gridOf(s.land.rock).at(s.x, s.z) ?? 0) : 0);
        if (s.gy + s.alt < hard + 0.02) s.alt += Math.min(hard + 0.02 - (s.gy + s.alt), 3 * dt);
        s.altVel = (s.alt - before) / Math.max(dt, 1e-4);
        if (s.land) {
          // it touches down on the rock where it is, at the height of the rock under it, so nothing jumps
          const rockHere = gridOf(s.land.rock).at(s.x, s.z);
          if (dist < 0.3 && rockHere !== null && s.gy + s.alt - rockHere < 0.06) {
            const height = s.gy + s.alt;
            s.rock = s.land.rock; s.land = null;
            s.gy = heightAt(s, s.x, s.z);
            s.alt = Math.max(0, height - s.gy);          // a few hundredths at most; it settles in the perch
            s.altVel = 0;
            s.state = 'perch'; s.timer = rand(8, 16);
          }
        } else if (dist < 0.35 && s.alt < 0.03) { s.alt = 0; s.altVel = 0; s.state = 'forage'; s.timer = rand(2, 5); }
      } else if (s.state === 'climb') {
        // walk up to the top of the stone
        const o = s.rock;
        const dx = o.center.x - s.x, dz = o.center.z - s.z, dist = Math.hypot(dx, dz);
        const want = Math.atan2(-dz, dx);
        speed = s.cruise * 1.3;   // it is going somewhere, so a little brisker than a stroll
        const away = steerAway(s, o);
        // close to some other stone, it stops being drawn toward its target and slides clear first
        const pull = clamp((s.nearest - 0.05) / 0.4, 0, 1);
        s.heading += clamp(clamp(wrapPI(want - s.heading), -1, 1) * 2.2 * pull + away, -1.5, 1.5) * dt;
        if (dist < 0.3 * Math.min(o.mesh.scale.x, o.mesh.scale.z) + 0.1) { s.state = 'perch'; s.timer = rand(6, 14); }
        else if (s.timer <= 0) { s.rock = null; s.state = 'walk'; s.timer = rand(4, 8); }
      } else if (s.state === 'perch') {
        // sit on the stone and pick at it, then turn and walk off
        s.alt = Math.max(0, s.alt - 0.3 * dt);
        if (s.timer <= 0) {
          const o = s.rock;
          if (!stones.includes(o)) {
            // on a tall rock: it swims off, from where it sits, so the height carries on smoothly
            const height = s.gy + s.alt;
            s.rock = null;
            s.gy = heightAt(s, s.x, s.z);
            s.alt = Math.max(0, height - s.gy);
            startSwim(s);
          } else {
            s.heading = Math.atan2(-(s.z - o.center.z), s.x - o.center.x) + rand(-0.6, 0.6);
            s.state = 'descend';
            s.timer = 14;
          }
        }
      } else if (s.state === 'descend') {
        const o = s.rock;
        speed = s.cruise;
        s.heading += clamp(steerAway(s, o) * 0.6, -1, 1) * dt;
        const d = Math.hypot(s.x - o.center.x, s.z - o.center.z);
        if (d > Math.max(o.mesh.scale.x, o.mesh.scale.z) * 1.1 + 0.1 || s.timer <= 0) { s.rock = null; s.state = 'walk'; s.timer = rand(4, 9); }
      }
      speed *= s.slow;

      // move: forward along the heading, never by assignment
      const swimmingNow = s.state === 'swim';
      s.moving += ((speed > 0 ? 1 : 0) - s.moving) * Math.min(1, dt * 6);
      s.swimming += ((swimmingNow ? 1 : 0) - s.swimming) * Math.min(1, dt * 5);
      if (speed > 0) {
        const gait = swimmingNow ? 1 : 0.88 + 0.12 * Math.sin(time * 2 + s.phase);   // a gentle surge, not a stutter
        s.x += Math.cos(s.heading) * speed * gait * dt;
        s.z -= Math.sin(s.heading) * speed * gait * dt;
        // The strip of sand is where it prefers to be, and steering brings it back; only the tank itself is a
        // hard limit. (A hard clamp to the strip would throw a shrimp that had come down just behind it, or
        // swum off a rock, back into it in one step.)
        s.x = clamp(s.x, area.minX - 2, area.maxX + 2);
        s.z = clamp(s.z, -4, area.maxZ + 1);
        if (!swimmingNow) s.stride += dt * (9 + speed * 30);   // unhurried steps
      }

      // stand on the surface (sand or stone), and tilt to follow it; both are eased, and the
      // tilt halved on the sand, so it glides over the ripples and does not rock with each one
      const ahead = 0.15 * s.size * 2;
      const hA = heightAt(s, s.x + Math.cos(s.heading) * ahead, s.z - Math.sin(s.heading) * ahead);
      const hB = heightAt(s, s.x - Math.cos(s.heading) * ahead, s.z + Math.sin(s.heading) * ahead);
      const gy = heightAt(s, s.x, s.z);
      const slopeTilt = clamp((gy > ground(s.x, s.z) + 0.03 ? 0.9 : 0.5) * Math.atan2(hA - hB, 2 * ahead), -0.7, 0.7);
      // swimming, it pitches up as it climbs and down as it descends
      const pitchTarget = swimmingNow ? clamp(s.altVel * 0.4, -0.4, 0.4) + 0.04 : slopeTilt;
      if (s.gy === undefined) { s.gy = gy; s.pitch = pitchTarget; }
      const ease = Math.min(1, dt * (s.rock ? 8 : 4));
      // the height follows the surface, but can only rise or fall so fast: the edge of a stone is
      // nearly a cliff, and a shrimp scrambles up it and does not hop
      const maxMove = 1.1 * dt;
      s.gy += clamp((gy - s.gy) * ease, -maxMove, maxMove);
      s.pitch += (pitchTarget - s.pitch) * Math.min(1, dt * 4);
      s.root.position.set(s.x, s.gy + s.alt + s.lift * s.size, s.z);
      s.root.rotation.y = s.heading;
      s.root.rotation.z = s.pitch;

      // legs: alternate sides and alternate legs, the foot lifting as it swings forward; folded
      // back and tucked up when swimming
      const picking = s.state === 'forage' || (s.state === 'perch' && Math.sin(time * 0.5 + s.phase) < 0.5);
      const grooming = s.state === 'groom' || (s.state === 'perch' && !picking);
      const fold = s.swimming;
      for (const l of s.legs) {
        const phi = s.stride + (l.i % 2 ? Math.PI : 0) + (l.s > 0 ? 0 : Math.PI);
        let swing = 0.26 * Math.sin(phi) * s.moving * (1 - fold);
        let liftFoot = Math.max(0, Math.cos(phi)) * 0.4 * s.moving * (1 - fold);
        let upperTilt = -0.55;
        if (l.i < 2 && picking) {
          // the front claws pick at the surface, one then the other
          const pick = Math.sin(time * 26 + l.s * 1.9 + l.i * 0.8);
          swing = 0.2 * pick;
          liftFoot = 0.55 * Math.max(0, pick);
        } else if (l.i < 2 && grooming) {
          // they reach up to draw the antennae through
          upperTilt = -0.55 + 0.9 + 0.2 * Math.sin(time * 9 + l.s);
          liftFoot = 0.4;
        }
        // swimming: the legs sweep back along the body and fold up
        l.g.rotation.y = l.baseYaw + l.s * swing - l.s * fold * (l.i < 2 ? -0.3 : 0.9);
        l.upper.rotation.z = upperTilt * (1 - fold) + -0.2 * fold;
        l.lower.rotation.z = (-0.8 + liftFoot) * (1 - fold) + -0.1 * fold;
      }

      // swimmerets: still when it walks, beating in a wave from front to back when it swims
      for (const p of s.pleopods) {
        p.stalk.rotation.z = fold * 0.8 * Math.sin(time * 34 - p.i * 0.8 + p.s * 0.2) + (1 - fold) * 0.08 * Math.sin(time * 3 + p.i);
      }

      // antennae sweep; they trail back and sweep faster when it shoots off or swims; the head dips to pick
      const flicking = s.state === 'flick';
      const swept = Math.max(flicking ? 1 : 0, fold);
      for (const a of s.antennae) {
        a.base.rotation.y = -a.s * (0.5 + swept * 1.9 + 0.12 * Math.sin(time * 1.3 + s.phase + a.s));
        a.base.rotation.z = -0.18;
        const groom = grooming ? 2.4 : 1;
        a.joints.forEach((j, i) => { j.rotation.y = -a.s * 0.16 * Math.sin(time * 2.2 * groom - i * 0.8 + s.phase + a.s * 1.4); j.rotation.z = -0.05; });
      }
      s.body.rotation.z = picking ? -0.12 * (0.5 + 0.5 * Math.sin(time * 3 + s.phase)) : 0;

      // the abdomen: curved down to the tail at rest, straight when swimming, curling right under on a flick
      const curl = flicking ? 0.5 * Math.sin(Math.PI * clamp(s.flickT / 0.6, 0, 1)) : 0;
      s.abdomen.forEach((j, i) => {
        j.rotation.z = (0.07 - 0.06 * fold) + curl + 0.02 * Math.sin(time * 1.7 + s.phase + i * 0.5);
        j.rotation.y = 0.05 * Math.sin(s.stride * 0.5 + i * 0.6) * s.moving * (1 - fold);
      });
    }
  }

  return {
    update,
    list,
    area: () => area,
    surfaceAt,
    tallRocks: () => perchable(),
    // send shrimp i swimming to the top of a tall rock (`only` names the rock), or on a climb (for testing)
    swimToRock(i, only) { const s = list[i]; if (!s || s.rock) return false; return startRockTrip(s, only); },
    climb(i) { const s = list[i]; if (!s || s.rock) return false; return startClimb(s); },
    // Put them down across the whole strip of sand, not bunched in the middle: each in its own part of the
    // strip (divided between them, in a random order, with the middle left out), clear of the tall rocks,
    // and now and then one starts perched on a low stone. The scene does this once, when it first knows
    // what the screen shows.
    scatter() {
      const n = list.length, width = area.maxX - area.minX;
      const order = list.map((_, i) => i).sort(() => Math.random() - 0.5);
      const inStrip = stones.filter((o) => reachable(o) && o.center.x > area.minX && o.center.x < area.maxX && o.center.z > area.minZ - 0.2 && o.center.z < area.maxZ + 0.2);
      order.forEach((k, slot) => {
        let lo = area.minX + (width * slot) / n, hi = area.minX + (width * (slot + 1)) / n;
        if (hi <= 0) hi = Math.min(hi, -0.1 * width); else if (lo >= 0) lo = Math.max(lo, 0.1 * width);
        const s = list[k];
        s.rock = null; s.land = null; s.alt = 0; s.altVel = 0; s.gy = undefined;
        s.heading = rand(-Math.PI, Math.PI);
        const here = inStrip.filter((o) => o.center.x > lo && o.center.x < hi);
        if (here.length && Math.random() < 0.25) {
          const o = here[Math.floor(Math.random() * here.length)];
          s.rock = o; s.x = o.center.x; s.z = o.center.z; s.state = 'perch'; s.timer = rand(6, 14);
          return;
        }
        let x, z, tries = 0, ok = false;
        while (!ok && tries < 300) {
          x = tries < 200 ? rand(lo + 0.2, hi - 0.2) : rand(area.minX + 0.4, area.maxX - 0.4);
          z = rand(area.minZ + 0.1, area.maxZ - 0.1);
          ok = clearOfRock(x, z, 0.4);
          tries++;
        }
        s.x = x; s.z = z;
        s.state = Math.random() < 0.5 ? 'walk' : 'forage';
        s.timer = rand(2, 8);
      });
    },
    // the scene sets where on the sand they may go, from what the screen can see of it
    setArea(a) { area = a; for (const s of list) { if (s.state === 'swim' || s.rock) continue; s.x = clamp(s.x, a.minX, a.maxX); s.z = clamp(s.z, a.minZ, a.maxZ); } },
    dispose() { for (const s of list) scene.remove(s.root); },
  };
}
