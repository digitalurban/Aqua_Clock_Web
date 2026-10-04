import * as THREE from 'three';
import { waterLitShader } from './riverscape/water.js';

/*
 * Small crabs, living on the sand in the front of the tank.
 *
 * The animal is modelled on the Thai micro crab, the freshwater crab sold for nano tanks, though
 * these are red, so that they show against the sand. What is modelled is what it is, from how it is
 * described: a rounded, flat "pill-box" shell about a centimetre
 * across; two eyes on short stalks; long, spindly legs, four pairs for walking; and a pair of
 * small claws that are for eating and not for fighting, with bristles to graze the film on
 * stones and plants. They are shy. Much of the day is spent sitting still with the legs tucked
 * under the body, and they are good climbers of stones and plants. They are drawn here two to three
 * times life size, because a real one would be a speck.
 *
 * Each foot on the ground stays where it is while the body moves over it: a foot is put down
 * ahead of the body and the leg's joints are worked out from where the foot is (a two-link leg
 * reaching for a point on the ground), so the legs do the walking and nothing skates. The step
 * rate follows the speed: unhurried when it strolls, a blur when it scuttles.
 *
 * A crab faces forward but walks sideways, so each has a heading (the way it is travelling) and
 * a side (which of its flanks leads); it faces the heading turned a quarter turn to that side.
 * It changes side only while standing still.
 *
 * Each is a small state machine:
 *   walk    -> forage | rest | scuttle | climb | walk
 *   forage  -> walk | rest | climb | forage      (the claws pass food to the mouth, one then the other)
 *   rest    -> walk | forage | climb             (still, legs tucked under the body)
 *   scuttle -> rest                              (a short quick dash sideways, dying away)
 *   climb   -> perch                             (walks up the stone to its top)
 *   perch   -> descend                           (sits and grazes the stone)
 *   descend -> walk                              (walks off the stone)
 * Position is integrated from a heading and a speed, never assigned, and the heading and the way
 * the crab faces turn at a limited rate, so nothing jumps. It stands on the sand or the stone
 * and tilts to the surface it is on, both eased. The low stones are not walls to it: it walks over
 * them, as well as climbing them on purpose to sit on top; only the tall rocks and the air stone
 * are in its way.
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
  m.customProgramCacheKey = () => 'crab-' + key;
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
 * The height of a stone's top surface, as a grid over its footprint: the same method as for the
 * shrimp (shrimp.js). The stones are noisy ellipsoids with no formula for their surface; but each
 * is a mesh, and the highest vertex in each small cell is the top of the stone there.
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

// the two parts of a leg, the length of a stride (how far a foot is carried while the body moves over it),
// the share of each step the foot spends on the ground, and how high it is lifted to swing
const L1 = 0.55, L2 = 0.7, STRIDE = 0.3, STANCE = 0.6, LIFT = 0.2;

/*
 * Put a leg's foot at (fx, fz) in the body's frame, lifted `lift` above the ground: turn the leg to
 * point at it, then solve the two joints, with the knee up, so that the foot lands there.
 */
function placeLeg(l, fx, fz, lift, bodyY) {
  const dx = fx - l.sx, dz = fz - l.sz;
  const reach = Math.hypot(dx, dz);
  l.g.rotation.y = Math.atan2(-dz, dx);
  const drop = -(bodyY + l.sy) + lift;                       // the foot's height relative to the shoulder
  const d = clamp(Math.hypot(reach, drop), 0.45, L1 + L2 - 0.02);
  const toFoot = Math.atan2(drop, reach);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const knee = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  l.upper.rotation.z = toFoot + a;
  l.lower.rotation.z = -(Math.PI - knee);
}

/*
 * One crab, in its own units: the shell is about one unit across, the model faces +x, its flanks
 * are +z and -z, and it stands on y = 0. The scene scales it down.
 */
function makeCrab(geo, mats) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.36;
  root.add(body);

  // the shell: rounded and flat, a little wider than long, with a darker patch on the back
  const shell = new THREE.Mesh(geo.sphere, mats.shell);
  shell.scale.set(0.47, 0.2, 0.52);
  body.add(shell);
  const back = new THREE.Mesh(geo.sphere, mats.back);
  back.scale.set(0.24, 0.09, 0.27);
  back.position.set(-0.02, 0.15, 0);
  body.add(back);

  // two eyes on short stalks at the front
  for (const s of [1, -1]) {
    const stalk = new THREE.Mesh(geo.stalk, mats.shell);
    stalk.position.set(0.4, 0.13, s * 0.14);
    body.add(stalk);
    const eye = new THREE.Mesh(geo.sphere, mats.eye);
    eye.scale.setScalar(0.062);
    eye.position.set(0.41, 0.22, s * 0.15);
    body.add(eye);
  }

  // the claws: shoulder, upper arm, an elbow that turns the forearm in toward the mouth, a hand
  // with a fixed finger and one that opens and shuts
  const arms = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.36, -0.02, s * 0.34);
    body.add(shoulder);
    const upper = new THREE.Group();
    upper.rotation.z = 0.05;
    shoulder.add(upper);
    upper.add(new THREE.Mesh(geo.arm1, mats.claw));
    const elbow = new THREE.Group();
    elbow.position.x = 0.42;
    elbow.rotation.y = s * 0.75;
    elbow.rotation.z = -0.1;
    upper.add(elbow);
    elbow.add(new THREE.Mesh(geo.arm2, mats.claw));
    const hand = new THREE.Group();
    hand.position.x = 0.38;
    elbow.add(hand);
    const palm = new THREE.Mesh(geo.sphere, mats.claw);
    palm.scale.set(0.21, 0.12, 0.15);
    palm.position.x = 0.09;
    hand.add(palm);
    const fixedFinger = new THREE.Mesh(geo.finger, mats.claw);
    fixedFinger.position.set(0.2, 0, -s * 0.06);
    hand.add(fixedFinger);
    const mover = new THREE.Group();
    mover.position.set(0.2, 0, s * 0.06);
    hand.add(mover);
    mover.add(new THREE.Mesh(geo.finger, mats.claw));
    arms.push({ s, shoulder, upper, elbow, mover });
  }

  // four pairs of walking legs: out from the shell edge, up to a knee, then down to the ground
  const legs = [];
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.set([0.26, 0.09, -0.09, -0.26][i], -0.04, s * 0.42);
      const fanOut = [0.5, 0.18, -0.18, -0.5][i];       // the front pair reach forward, the back pair aft
      body.add(g);
      const upper = new THREE.Group();
      upper.rotation.z = 0.6;
      g.add(upper);
      upper.add(new THREE.Mesh(geo.leg1, mats.leg));
      const lower = new THREE.Group();
      lower.position.x = 0.55;
      lower.rotation.z = -1.9;
      upper.add(lower);
      lower.add(new THREE.Mesh(geo.leg2, mats.leg));
      const knee = new THREE.Mesh(geo.knee, mats.leg);   // hides the blunt ends where the two parts meet
      knee.scale.setScalar(0.066);
      lower.add(knee);
      legs.push({ g, upper, lower, i, s, sx: g.position.x, sy: g.position.y, sz: g.position.z, dirX: Math.sin(fanOut), dirZ: s * Math.cos(fanOut) });
    }
  }
  return { root, body, arms, legs };
}

export function createCrabs(scene, { count = 2, ground, obstacles = [] } = {}) {
  const geo = {
    sphere: new THREE.SphereGeometry(1, 16, 12),
    stalk: new THREE.CylinderGeometry(0.028, 0.032, 0.11, 6),
    knee: new THREE.SphereGeometry(1, 8, 6),
    // thick enough to show: the real legs are finer, but sub-pixel tubes break into dots
    leg1: tube(0.55, 0.07, 0.058, 8),
    leg2: tube(0.7, 0.056, 0.03, 8),
    arm1: tube(0.42, 0.075, 0.06),
    arm2: tube(0.38, 0.06, 0.055),
    finger: (() => { const g = new THREE.ConeGeometry(0.058, 0.3, 6); g.rotateZ(-Math.PI / 2); g.translate(0.15, 0, 0); return g; })(),
  };
  const mats = {
    // red, so that they show against the sand (the real animal is grey-tan, and nearly invisible)
    shell: material({ color: '#b3301f', roughness: 0.45, metalness: 0 }, 'shell'),
    back: material({ color: '#7a2016', roughness: 0.55, metalness: 0 }, 'back'),
    leg: material({ color: '#c33f29', roughness: 0.5, metalness: 0 }, 'leg'),
    claw: material({ color: '#e0583a', roughness: 0.45, metalness: 0 }, 'claw'),
    eye: material({ color: '#0e0c0a', roughness: 0.25, metalness: 0 }, 'eye'),
  };

  // The low stones are not walls to a crab: it climbs over them, and it is what lets it get from one end of
  // the sand to the other (with them as walls, only a sliver in the middle is clear). Only the tall rocks and
  // the air stone block it. Each stone's surface grid is built the first time a crab is near it.
  const stones = obstacles.filter((o) => o.mesh && o.mesh.scale.y <= 0.6);
  const solid = obstacles.filter((o) => !stones.includes(o));
  const clearOfRock = (x, z, margin) => solid.every((o) => Math.hypot(x - o.center.x, z - o.center.z) > o.radius + margin);
  const gridOf = (o) => (o.grid ??= buildGrid(o.mesh));
  // a stone whose top is inside a tall rock's keep-clear circle is not a place to go or to start
  const reachable = (o) => clearOfRock(o.center.x, o.center.z, 0);
  // the height they stand at: the sand, or the top of a stone, if it is higher there
  function heightAt(s, x, z) {
    let y = ground(x, z);
    for (const o of stones) {
      if (Math.hypot(x - o.center.x, z - o.center.z) > o.radius + 0.4) continue;
      const t = gridOf(o).at(x, z);
      if (t !== null && t > y) y = t;
    }
    return y;
  }

  const UP = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const qYaw = new THREE.Quaternion();
  const qTarget = new THREE.Quaternion();

  const list = [];
  for (let i = 0; i < count; i++) {
    let x, z, tries = 0;
    do {
      x = rand(area.minX + 0.4, area.maxX - 0.4);
      z = rand(area.minZ + 0.2, area.maxZ - 0.2);
      tries++;
    } while (tries < 80 && !clearOfRock(x, z, 0.5));
    const model = makeCrab(geo, mats);
    const size = rand(0.23, 0.28);   // about 2.5 times life size: a real one would be a speck
    model.root.scale.setScalar(size);
    scene.add(model.root);
    const heading = rand(-Math.PI, Math.PI), side = Math.random() < 0.5 ? 1 : -1;
    Object.assign(model, {
      size, x, z, heading, side,
      face: heading + side * Math.PI / 2,
      cruise: rand(0.10, 0.16),
      turn: rand(-0.25, 0.25),
      turnTimer: rand(2, 5),
      phase: rand(0, 6.28),
      stride: rand(0, 6.28),
      state: i % 2 === 0 ? 'walk' : 'rest',
      timer: rand(3, 9),
      moving: 0,        // 0 = standing, 1 = going: eases, so the legs do not snap
      vSm: 0,           // its speed, smoothed: sets how fast it steps
      tuck: 0,          // 0 = legs out, 1 = tucked under the body: eases
      dashT: 0,
      rock: null,       // the stone it is on, climbing, or leaving
      slow: 1,
      qTilt: new THREE.Quaternion(),
      climbs: 0, scuttles: 0,
    });
    list.push(model);
  }

  // ---- choosing what to do next ----
  function startWalk(s) {
    s.state = 'walk';
    s.timer = rand(5, 12);
    s.turn = rand(-0.25, 0.25);
    // it picks its direction, and which flank leads, while it is standing still
    if (Math.random() < 0.5) s.side = -s.side;
    s.heading += rand(-1.2, 1.2);
  }
  // no other stone lies across the straight line from the crab to this one: with one in the way,
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
    const near = stones.filter((o) => reachable(o) && o.center.x > area.minX - 0.2 && o.center.x < area.maxX + 0.2 && o.center.z > area.minZ - 0.2 && o.center.z < area.maxZ + 0.2 && pathClear(s, o));
    if (!near.length) return false;
    near.sort((a, b) => Math.hypot(a.center.x - s.x, a.center.z - s.z) - Math.hypot(b.center.x - s.x, b.center.z - s.z));
    s.rock = near[Math.min(near.length - 1, Math.floor(Math.random() * Math.min(3, near.length)))];
    s.state = 'climb';
    // time enough to get there at the pace it walks, and a margin; a stone far off is a long way
    s.timer = 14 + Math.hypot(s.rock.center.x - s.x, s.rock.center.z - s.z) / 0.05;
    s.climbs++;
    return true;
  }
  function nextAfterWalk(s) {
    const r = Math.random();
    if (r < 0.06) { s.state = 'scuttle'; s.dashT = 0; s.scuttles++; }
    else if (r < 0.30 && startClimb(s)) { /* on its way up */ }
    else if (r < 0.58) { s.state = 'forage'; s.timer = rand(4, 9); }
    else if (r < 0.86) { s.state = 'rest'; s.timer = rand(6, 16); }
    else startWalk(s);
  }
  function nextAfterForage(s) {
    const r = Math.random();
    if (r < 0.4) startWalk(s);
    else if (r < 0.55 && startClimb(s)) { /* on its way up */ }
    else if (r < 0.82) { s.state = 'rest'; s.timer = rand(6, 16); }
    else s.timer = rand(3, 7);
  }
  function nextAfterRest(s) {
    const r = Math.random();
    if (r < 0.62) startWalk(s);
    else if (r < 0.78 && startClimb(s)) { /* on its way up */ }
    else { s.state = 'forage'; s.timer = rand(4, 9); }
  }

  // steer away from the stones (all but the one it means to be on), slowing as it gets close
  function steerAway(s, except) {
    let steer = 0;
    s.nearest = 9;
    for (const o of solid) {
      if (o === except) continue;
      const dx = s.x - o.center.x, dz = s.z - o.center.z;
      const surface = Math.hypot(dx, dz) - o.radius - 0.9 * s.size;
      if (surface < s.nearest) s.nearest = surface;
      if (surface < 0.4) {
        const away = Math.atan2(-dz, dx);
        steer += clamp(wrapPI(away - s.heading), -1, 1) * (0.4 - surface) * 4.5;
        if (surface < 0.1) s.slow = Math.min(s.slow, Math.max(0.2, surface / 0.1));
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
        if (s.turnTimer <= 0) { s.turn = rand(-0.3, 0.3); s.turnTimer = rand(2, 5); }
        s.heading += clamp(s.turn + steerAway(s, null) + steerInside(s), -1.3, 1.3) * dt;
        if (s.timer <= 0) nextAfterWalk(s);
      } else if (s.state === 'forage') {
        if (s.timer <= 0) nextAfterForage(s);
      } else if (s.state === 'rest') {
        if (s.timer <= 0) nextAfterRest(s);
      } else if (s.state === 'scuttle') {
        // a quick dash sideways that dies away, steering round the stones
        s.dashT += dt;
        speed = 0.55 * Math.exp(-s.dashT / 0.4);
        s.heading += clamp(steerAway(s, null) + steerInside(s), -1.5, 1.5) * dt;
        if (s.dashT > 0.9) { s.state = 'rest'; s.timer = rand(6, 14); }
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
        if (dist < 0.3 * Math.min(o.mesh.scale.x, o.mesh.scale.z) + 0.1) { s.state = 'perch'; s.timer = rand(8, 18); }
        else if (s.timer <= 0) { s.rock = null; startWalk(s); }
      } else if (s.state === 'perch') {
        // sit on the stone and graze it, then turn and walk off
        if (s.timer <= 0) {
          const o = s.rock;
          s.heading = Math.atan2(-(s.z - o.center.z), s.x - o.center.x) + rand(-0.6, 0.6);
          s.state = 'descend';
          s.timer = 16;
        }
      } else if (s.state === 'descend') {
        const o = s.rock;
        speed = s.cruise;
        s.heading += clamp(steerAway(s, o) * 0.6, -1, 1) * dt;
        const d = Math.hypot(s.x - o.center.x, s.z - o.center.z);
        if (d > Math.max(o.mesh.scale.x, o.mesh.scale.z) * 1.1 + 0.1 || s.timer <= 0) { s.rock = null; startWalk(s); }
      }
      speed *= s.slow;
      // it turns to face the way it means to go before it goes: held still for a big turn (a change of
      // flank), but not for the small steady lag of steering round a stone, or it would never get away
      speed *= 1 - clamp((Math.abs(wrapPI(s.heading + s.side * Math.PI / 2 - s.face)) - 0.3) / 0.8, 0, 1);

      // move: along the heading, never by assignment
      s.moving += ((speed > 0 ? 1 : 0) - s.moving) * Math.min(1, dt * 6);
      if (speed > 0) {
        s.x += Math.cos(s.heading) * speed * dt;
        s.z -= Math.sin(s.heading) * speed * dt;
        const pad = s.rock ? 0.8 : 0;   // a stone at the edge of the sand may be climbed
        s.x = clamp(s.x, area.minX - pad, area.maxX + pad);
        s.z = clamp(s.z, area.minZ - pad, area.maxZ + pad);
      }
      // it faces a quarter turn from the way it travels, toward the leading flank, and turns to it gradually
      s.face += wrapPI(s.heading + s.side * Math.PI / 2 - s.face) * Math.min(1, dt * 5);

      // a safety net: if the sand strip moved or a turn carried it into a tall rock, ease it out along the line
      // from the rock's centre, slowly (steering does the real avoiding)
      for (const o of solid) {
        const dx = s.x - o.center.x, dz = s.z - o.center.z, dist = Math.hypot(dx, dz) || 1e-3, want = o.radius + 0.3 * s.size;
        if (dist < want) { const k = Math.min(want - dist, 0.15 * dt) / dist; s.x += dx * k; s.z += dz * k; }   // gently, never a shove
      }

      // stand on the surface (sand or stone), and tilt to it; both are eased, and the tilt halved
      // on the sand, so it glides over the ripples and does not rock with each one
      const gy = heightAt(s, s.x, s.z);
      const onStone = gy > ground(s.x, s.z) + 0.03;
      const d = 0.06;
      normal.set(
        -(heightAt(s, s.x + d, s.z) - heightAt(s, s.x - d, s.z)) / (2 * d),
        1,
        -(heightAt(s, s.x, s.z + d) - heightAt(s, s.x, s.z - d)) / (2 * d),
      ).normalize();
      normal.lerp(UP, onStone ? 0 : 0.5);
      // never tilted past a limit (about 35 degrees on a stone, 14 on the sand): the sideways part of the
      // normal is scaled back, then it is normalised
      const sideways = Math.hypot(normal.x, normal.z), limit = Math.tan(onStone ? 0.62 : 0.25) * normal.y;
      if (sideways > limit) { normal.x *= limit / sideways; normal.z *= limit / sideways; }
      normal.normalize();
      qTarget.setFromUnitVectors(UP, normal).multiply(qYaw.setFromAxisAngle(UP, s.face));
      if (s.gy === undefined) { s.gy = gy; s.qTilt.copy(qTarget); }
      // the height follows the surface, but can only rise or fall so fast: the edge of a stone is
      // nearly a cliff, and a crab scrambles up it and does not hop
      const ease = Math.min(1, dt * (onStone ? 8 : 4));
      s.gy += clamp((gy - s.gy) * ease, -0.6 * dt, 0.6 * dt);
      s.qTilt.slerp(qTarget, Math.min(1, dt * (onStone ? 6 : 3)));
      s.root.position.set(s.x, s.gy, s.z);
      s.root.quaternion.copy(s.qTilt);

      // legs tucked under the body when it rests; the body sinks a little with them
      const restingNow = s.state === 'rest';
      s.tuck += ((restingNow ? 1 : 0) - s.tuck) * Math.min(1, dt * 2.5);
      s.body.position.y = 0.36 - 0.1 * s.tuck;
      // The gait. Each foot is put down ahead of the body and stays where it is while the body
      // moves over it, so relative to the body it travels one stride backward; then it is lifted
      // and swung forward again. The step rate is set by the speed so that a foot on the ground
      // really does stay put: it stays down for as long as the body takes to move one stride.
      s.vSm += (speed - s.vSm) * Math.min(1, dt * 8);
      const bodyY = 0.36 - 0.1 * s.tuck;
      const amp = STRIDE * s.moving;
      const rate = clamp((s.vSm * STANCE) / (STRIDE * s.size), 0, 5);
      s.stride += dt * Math.PI * 2 * rate;
      const reach0 = 0.62 - 0.24 * s.tuck;                     // tucked, the feet are drawn in under the body
      for (const l of s.legs) {
        // alternate legs step in turn, and the two sides are a quarter of a step apart
        const u = ((((s.stride + (l.i % 2) * Math.PI + (l.s > 0 ? 0 : Math.PI / 2)) / (Math.PI * 2)) % 1) + 1) % 1;
        let q, lift = 0;
        if (u < STANCE) {
          q = amp * (0.5 - u / STANCE);                        // on the ground: carried back, relative to the body
        } else {
          const w = (u - STANCE) / (1 - STANCE), e = w * w * (3 - 2 * w);
          q = amp * (-0.5 + e);                                // lifted and swung forward to the next place
          lift = LIFT * Math.sin(Math.PI * w) * s.moving;
        }
        // "forward" is the way the crab is travelling: along +z when its +z flank leads, -z when -z does
        placeLeg(l, l.sx + reach0 * l.dirX, l.sz + reach0 * l.dirZ + s.side * q, lift, bodyY);
      }

      // claws: held forward and a little out; grazing, each in turn brings food in to the mouth
      const grazing = s.state === 'forage' || s.state === 'perch';
      for (const a of s.arms) {
        const cycle = Math.sin(time * 2.6 + s.phase + (a.s > 0 ? 0 : Math.PI));
        const pull = grazing ? Math.max(0, cycle) : restingNow ? 0.45 : 0.1 + 0.08 * Math.sin(time * 1.1 + a.s);
        a.shoulder.rotation.y = -a.s * (0.55 - 0.4 * pull);
        a.shoulder.rotation.z = -0.55 * pull;
        a.upper.rotation.z = 0.05 - 0.05 * pull;
        // the fingers open and shut as it picks
        a.mover.rotation.y = a.s * (0.1 + (grazing ? 0.4 * Math.abs(Math.sin(time * 5.2 + a.s * 1.3 + s.phase)) : 0.06));
      }
    }
  }

  return {
    update,
    list,
    area: () => area,
    // Put them down across the whole strip of sand, not bunched in the middle: each in its own part of
    // the strip (the strip is divided between them, in a random order), anywhere clear of the stones, and
    // now and then one starts perched on a stone. The scene does this once, when it first knows what the
    // screen shows. (With the stones as they are, only a sliver of the strip is clear of all of them by a
    // generous margin, and it is in the middle, so the margin here is small.)
    scatter() {
      const n = list.length, width = area.maxX - area.minX;
      const order = list.map((_, i) => i).sort(() => Math.random() - 0.5);
      const inStrip = stones.filter((o) => reachable(o) && o.center.x > area.minX && o.center.x < area.maxX && o.center.z > area.minZ - 0.2 && o.center.z < area.maxZ + 0.2);
      order.forEach((k, slot) => {
        let lo = area.minX + (width * slot) / n, hi = area.minX + (width * (slot + 1)) / n;
        // the middle fifth of the strip is left out of the starting places: they are the ones that always
        // used to be there
        if (hi <= 0) hi = Math.min(hi, -0.1 * width); else if (lo >= 0) lo = Math.max(lo, 0.1 * width);
        const s = list[k];
        s.rock = null; s.gy = undefined;
        s.heading = rand(-Math.PI, Math.PI);
        s.side = Math.random() < 0.5 ? 1 : -1;
        s.face = s.heading + s.side * Math.PI / 2;
        const here = inStrip.filter((o) => o.center.x > lo && o.center.x < hi);
        if (here.length && Math.random() < 0.3) {
          // perched on a stone in its part of the strip
          const o = here[Math.floor(Math.random() * here.length)];
          s.rock = o; s.x = o.center.x; s.z = o.center.z;
          s.state = 'perch'; s.timer = rand(6, 16);
          return;
        }
        let x, z, tries = 0, ok = false;
        while (!ok && tries < 300) {
          // its own part of the strip first, then the whole of it
          x = tries < 200 ? rand(lo + 0.2, hi - 0.2) : rand(area.minX + 0.4, area.maxX - 0.4);
          z = rand(area.minZ + 0.1, area.maxZ - 0.1);
          ok = clearOfRock(x, z, 0.1);
          tries++;
        }
        s.x = x; s.z = z;
        s.state = Math.random() < 0.5 ? 'walk' : 'rest';
        s.timer = rand(2, 8);
      });
    },
    // send crab i up a stone, or on a dash (for testing, and for whatever else wants to startle them)
    climb(i) { const s = list[i]; if (!s || s.rock) return false; return startClimb(s); },
    scuttle(i) { const s = list[i]; if (!s || s.rock) return false; s.state = 'scuttle'; s.dashT = 0; s.scuttles++; return true; },
    // the scene sets where on the sand they may go, from what the screen can see of it
    setArea(a) { area = a; for (const s of list) { if (s.rock) continue; s.x = clamp(s.x, a.minX, a.maxX); s.z = clamp(s.z, a.minZ, a.maxZ); } },
    dispose() { for (const s of list) scene.remove(s.root); },
  };
}
