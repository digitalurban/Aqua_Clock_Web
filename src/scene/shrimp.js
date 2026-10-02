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
 * the front claws and to groom their antennae. They also climb the low stones and sit on them,
 * picking at the surface; now and then they swim up into the water, legs folded back and
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
  return {
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

  const clearOfRock = (x, z, margin) => obstacles.every((o) => Math.hypot(x - o.center.x, z - o.center.z) > o.radius + margin);
  // the low stones, which they can climb; each one's surface grid is built the first time it is needed
  const stones = obstacles.filter((o) => o.mesh && o.mesh.scale.y <= 0.6);
  const gridOf = (o) => (o.grid ??= buildGrid(o.mesh));
  // the height they stand at: the sand, or the stone they are on, if it is higher there
  function heightAt(s, x, z) {
    const sand = ground(x, z);
    if (!s.rock) return sand;
    const y = gridOf(s.rock).at(x, z);
    return y !== null && y > sand ? y : sand;
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
      flicks: 0, swims: 0, climbs: 0,
    });
    list.push(model);
  }

  // ---- choosing what to do next ----
  function startSwim(s) {
    let tx, tz, tries = 0;
    do {
      const a = rand(0, Math.PI * 2), d = rand(1.5, 3.5);
      tx = clamp(s.x + Math.cos(a) * d, area.minX + 0.3, area.maxX - 0.3);
      tz = clamp(s.z + Math.sin(a) * d * 0.6, area.minZ + 0.2, area.maxZ - 0.2);
      tries++;
    } while (tries < 20 && !clearOfRock(tx, tz, 0.6));
    Object.assign(s, { state: 'swim', tx, tz, swimAlt: rand(0.45, 1.5), swimSpeed: rand(0.45, 0.7), timer: 16, rock: null });
    s.swims++;
  }
  // no other stone lies across the straight line from the shrimp to this one: with one in the way,
  // the pull toward the target and the push away from the obstacle cancel, and it gets stuck
  function pathClear(s, o) {
    const dx = o.center.x - s.x, dz = o.center.z - s.z, len2 = dx * dx + dz * dz || 1;
    return obstacles.every((q) => {
      if (q === o) return true;
      const t = clamp(((q.center.x - s.x) * dx + (q.center.z - s.z) * dz) / len2, 0, 1);
      return Math.hypot(q.center.x - (s.x + t * dx), q.center.z - (s.z + t * dz)) > q.radius * 0.85 + 0.1;
    });
  }
  function startClimb(s) {
    const near = stones.filter((o) => o.center.x > area.minX - 0.2 && o.center.x < area.maxX + 0.2 && o.center.z > area.minZ - 0.2 && o.center.z < area.maxZ + 0.6 && pathClear(s, o));
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
    else if (r < 0.17) startSwim(s);
    else if (r < 0.30 && startClimb(s)) { /* on its way up */ }
    else if (r < 0.62) { s.state = 'forage'; s.timer = rand(3, 7); }
    else if (r < 0.76) { s.state = 'groom'; s.timer = rand(2, 4); }
    else { s.state = 'walk'; s.timer = rand(4, 11); s.turn = rand(-0.3, 0.3); }
  }
  function nextAfterForage(s) {
    const r = Math.random();
    if (r < 0.55) { s.state = 'walk'; s.timer = rand(4, 11); s.turn = rand(-0.3, 0.3); }
    else if (r < 0.65) startSwim(s);
    else if (r < 0.75 && startClimb(s)) { /* on its way up */ }
    else if (r < 0.9) { s.state = 'groom'; s.timer = rand(2, 4); }
    else s.timer = rand(2, 5);
  }

  // steer away from the stones (all but the one it means to be on), slowing as it gets close
  function steerAway(s, except) {
    let steer = 0;
    s.nearest = 9;
    for (const o of obstacles) {
      if (o === except) continue;
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
        // lift off, glide toward the target steering round the stones, and come down on it
        const dx = s.tx - s.x, dz = s.tz - s.z, dist = Math.hypot(dx, dz);
        const want = Math.atan2(-dz, dx);
        s.heading += clamp(clamp(wrapPI(want - s.heading), -1, 1) * 2 + steerAway(s, null), -1.8, 1.8) * dt;
        speed = s.swimSpeed * (dist > 0.4 ? 1 : 0.2 + dist / 0.5);
        if (s.timer <= 0) { s.tx = s.x; s.tz = s.z; }          // out of time: come down where it is
        const altTarget = dist > 1.1 ? s.swimAlt : 0;
        const rate = altTarget > s.alt ? 1.1 : 0.9;
        const before = s.alt;
        s.alt += clamp(altTarget - s.alt, -rate * dt, rate * dt);
        s.altVel = (s.alt - before) / Math.max(dt, 1e-4);
        if (dist < 0.35 && s.alt < 0.03) { s.alt = 0; s.altVel = 0; s.state = 'forage'; s.timer = rand(2, 5); }
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
        if (s.timer <= 0) {
          const o = s.rock;
          s.heading = Math.atan2(-(s.z - o.center.z), s.x - o.center.x) + rand(-0.6, 0.6);
          s.state = 'descend';
          s.timer = 14;
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
        const pad = s.rock ? 0.8 : 0;   // a stone at the edge of the sand may be climbed
        s.x = clamp(s.x, area.minX - pad, area.maxX + pad);
        s.z = clamp(s.z, area.minZ - pad, area.maxZ + pad);
        if (!swimmingNow) s.stride += dt * (9 + speed * 30);   // unhurried steps
      }

      // stand on the surface (sand or stone), and tilt to follow it; both are eased, and the
      // tilt halved on the sand, so it glides over the ripples and does not rock with each one
      const ahead = 0.15 * s.size * 2;
      const hA = heightAt(s, s.x + Math.cos(s.heading) * ahead, s.z - Math.sin(s.heading) * ahead);
      const hB = heightAt(s, s.x - Math.cos(s.heading) * ahead, s.z + Math.sin(s.heading) * ahead);
      const gy = heightAt(s, s.x, s.z);
      const slopeTilt = clamp((s.rock ? 0.9 : 0.5) * Math.atan2(hA - hB, 2 * ahead), -0.7, 0.7);
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
    // the scene sets where on the sand they may go, from what the screen can see of it
    setArea(a) { area = a; for (const s of list) { if (s.state === 'swim' || s.rock) continue; s.x = clamp(s.x, a.minX, a.maxX); s.z = clamp(s.z, a.minZ, a.maxZ); } },
    dispose() { for (const s of list) scene.remove(s.root); },
  };
}
