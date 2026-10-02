import * as THREE from 'three';
import { waterLitShader } from './riverscape/water.js';

/*
 * Snails on the front glass of the tank, seen from outside it.
 *
 * Built the way a snail is, and seen the way you see one on a real tank's glass: the foot is
 * pressed against the glass, so what faces you is the pale sole, long and narrow, with the
 * small head at its front end and one pair of tentacles (the eyes at their bases, as on an
 * aquatic snail). The shell is on the snail's back, so it is behind the foot, away from you,
 * tilted back over the tail and lifted off the glass by the soft body under it. They crawl in
 * slow wandering curves, pause, and sometimes draw the foot and head back in under the shell,
 * stay shut for a while (the horny plate that closes the shell, the operculum, shows), and
 * ease out again.
 *
 * They live in a strip down the right-hand side, set by the scene from the screen's shape, so
 * they never cross the clock or the words.
 *
 * Each one is a small state machine: crawl -> rest -> (crawl | retract -> hidden -> emerge ->
 * rest). Position is integrated from a heading and a speed, never assigned, and the heading
 * turns at a limited rate, so nothing jumps.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapPI = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (t) => t * t * (3 - 2 * t);

// where on the glass they may go; the scene replaces this from the screen's shape
let area = { minX: 4.0, maxX: 6.2, minY: 2.0, maxY: 7.2 };

/*
 * A turbinate shell: a surface of revolution stepped into whorls, with a spiral swelling and
 * stripes that follow it. Its base sits on the glass and the apex points out toward you, so
 * from the front you see the spiral from above.
 */
function shellGeometry() {
  const R = 0.5, H = 0.95, turns = 3.2, steps = 40;
  const profile = [];
  for (let i = 0; i <= steps; i++) {
    const h = i / steps;
    const r = R * Math.pow(1 - h, 0.85) * (1 + 0.05 * Math.sin(Math.PI * 2 * turns * h));
    profile.push(new THREE.Vector2(Math.max(r, 0.0001), h * H));
  }
  const geometry = new THREE.LatheGeometry(profile, 56);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const dark = new THREE.Color('#5c4725'), light = new THREE.Color('#b59a58'), c = new THREE.Color();   // brown and olive, not black and yellow
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const h = y / H;
    const spiral = Math.atan2(z, x) - Math.PI * 2 * 1.4 * h; // the twist, round the axis and along it
    const swell = 1 + 0.07 * Math.cos(spiral);
    position.setX(i, x * swell);
    position.setZ(i, z * swell);
    c.copy(dark).lerp(light, smoothstep(0.3, 0.7, 0.5 + 0.5 * Math.cos(spiral * 3)));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(Math.PI / 2); // the axis was y; now it runs out of the glass, along +z
  return geometry;
}

function tentacleGeometry() {
  const g = new THREE.CylinderGeometry(0.02, 0.042, 0.5, 6);
  g.rotateZ(-Math.PI / 2); // thin tip toward +x
  g.translate(0.25, 0, 0); // base at the origin
  return g;
}

function material(params, key) {
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...params });
  m.onBeforeCompile = (shader) => waterLitShader(shader);
  m.customProgramCacheKey = () => 'snail-' + key;
  return m;
}

function makeSnail(size, geo, mats) {
  const group = new THREE.Group(); // turns with the heading, about the glass's normal
  group.scale.setScalar(size);
  // Built with its back toward +z; flipped so the back points away from you, into the tank,
  // and the sole is what faces you.
  const flip = new THREE.Group();
  flip.rotation.x = Math.PI;
  group.add(flip);

  // the shell: tilted back over the tail, as a snail carries it, and lifted off the glass
  const shell = new THREE.Mesh(geo.shell, mats.shell);
  shell.rotation.y = -0.95;
  shell.position.set(-0.12, 0, 0.46);
  flip.add(shell);
  // the soft body under the shell, which shows round the foot
  const mass = new THREE.Mesh(geo.sphere, mats.mass);
  mass.scale.set(0.42, 0.34, 0.24);
  mass.position.set(-0.12, 0, 0.2);
  flip.add(mass);
  // the horny plate that shuts the shell: seen only when the snail is drawn in
  const operculum = new THREE.Mesh(geo.disc, mats.operculum);
  operculum.scale.set(0.26, 0.2, 1);
  operculum.position.set(0.28, 0, 0.03);
  operculum.rotation.x = Math.PI; // faces you
  flip.add(operculum);

  // everything that goes back under the shell hangs off one group, so retracting is one scale
  const body = new THREE.Group();
  flip.add(body);
  const foot = new THREE.Mesh(geo.sphere, mats.foot);
  foot.scale.set(1.0, 0.24, 0.05);
  foot.position.set(0.15, 0, 0.05); // spans about -0.85 to +1.15: a tail behind the shell, a neck and head ahead
  body.add(foot);
  const head = new THREE.Mesh(geo.sphere, mats.foot);
  head.scale.set(0.16, 0.15, 0.1);
  head.position.set(1.1, 0, 0.08);
  body.add(head);
  const tentacles = [];
  for (const side of [1, -1]) {
    const mesh = new THREE.Mesh(geo.tentacle, mats.tentacle);
    mesh.position.set(1.2, 0.07 * side, 0.1);
    mesh.rotation.z = 0.4 * side;
    body.add(mesh);
    tentacles.push({ mesh, base: 0.4 * side, side });
    const eye = new THREE.Mesh(geo.sphere, mats.eye);
    eye.scale.setScalar(0.035);
    eye.position.set(1.22, 0.11 * side, 0.14);
    body.add(eye);
  }
  return { group, body, foot, operculum, mass, tentacles };
}

export function createSnails(scene, { count = 2, glassZ = 3.55 } = {}) {
  const geo = {
    shell: shellGeometry(),
    sphere: new THREE.SphereGeometry(1, 16, 10),
    tentacle: tentacleGeometry(),
    disc: new THREE.CircleGeometry(1, 20),
  };
  const mats = {
    shell: material({ vertexColors: true, roughness: 0.42, metalness: 0 }, 'shell'),
    // a grey-tan body, as a mystery snail has, light enough to read against the blue
    foot: material({ color: '#aaa48e', roughness: 0.9, metalness: 0 }, 'foot'),
    tentacle: material({ color: '#8f8975', roughness: 0.9, metalness: 0 }, 'tentacle'),
    mass: material({ color: '#7d7866', roughness: 0.9, metalness: 0 }, 'mass'),
    operculum: material({ color: '#4b3a22', roughness: 0.6, metalness: 0 }, 'operculum'),
    eye: material({ color: '#15120c', roughness: 0.3, metalness: 0 }, 'eye'),
  };

  const list = [];
  const taken = [];
  for (let i = 0; i < count; i++) {
    let x, y, tries = 0;
    do {
      x = rand(area.minX + 0.3, area.maxX - 0.3);
      y = rand(area.minY + 0.3, area.maxY - 0.3);
      tries++;
    } while (tries < 40 && taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 1.2));
    taken.push([x, y]);
    // on the front glass, nearer than the back glass was, so smaller in the world for the same size on screen
    const snail = makeSnail(rand(0.18, 0.22), geo, mats);
    const start = ['crawl', 'rest'][i % 2];
    Object.assign(snail, {
      x, y,
      heading: rand(-Math.PI, Math.PI),
      speed: rand(0.02, 0.05),
      turn: rand(-0.2, 0.2),
      turnTimer: rand(2, 6),
      phase: rand(0, 6.28),
      state: start,
      timer: start === 'hidden' ? rand(3, 9) : rand(3, 14),
      out: start === 'hidden' ? 0 : 1, // 1 = out of the shell, 0 = drawn in
      noRetract: false,
    });
    scene.add(snail.group);
    list.push(snail);
  }

  function update(dt, time) {
    for (const s of list) {
      s.timer -= dt;

      if (s.state === 'crawl') {
        s.turnTimer -= dt;
        if (s.turnTimer <= 0) { s.turn = rand(-0.22, 0.22); s.turnTimer = rand(3, 7); }
        const margin = 0.3;
        const outside = s.x < area.minX + margin || s.x > area.maxX - margin || s.y < area.minY + margin || s.y > area.maxY - margin;
        if (outside) {
          // turn back toward the middle at a limited rate
          const want = Math.atan2((area.minY + area.maxY) / 2 - s.y, (area.minX + area.maxX) / 2 - s.x);
          s.heading += clamp(wrapPI(want - s.heading), -0.9 * dt, 0.9 * dt);
        } else {
          s.heading += s.turn * dt;
        }
        for (const o of list) {
          if (o === s) continue;
          const d = Math.hypot(o.x - s.x, o.y - s.y);
          if (d < 0.7) {
            const away = Math.atan2(s.y - o.y, s.x - o.x);
            s.heading += clamp(wrapPI(away - s.heading), -0.5 * dt, 0.5 * dt);
          }
        }
        // a snail glides in pulses, not at a constant speed
        const gait = 0.7 + 0.3 * Math.sin(time * 2.1 + s.phase);
        s.x = clamp(s.x + Math.cos(s.heading) * s.speed * gait * dt, area.minX, area.maxX);
        s.y = clamp(s.y + Math.sin(s.heading) * s.speed * gait * dt, area.minY, area.maxY);
        if (s.timer <= 0) { s.state = 'rest'; s.timer = rand(2, 7); }
      } else if (s.state === 'rest') {
        if (s.timer <= 0) {
          if (!s.noRetract && Math.random() < 0.35) { s.state = 'retract'; }
          else { s.state = 'crawl'; s.timer = rand(9, 26); s.turn = rand(-0.22, 0.22); }
          s.noRetract = false;
        }
      } else if (s.state === 'retract') {
        s.out = Math.max(0, s.out - dt / 1.4);
        if (s.out <= 0) { s.state = 'hidden'; s.timer = rand(6, 16); }
      } else if (s.state === 'hidden') {
        if (s.timer <= 0) s.state = 'emerge';
      } else if (s.state === 'emerge') {
        s.out = Math.min(1, s.out + dt / 2.0);
        if (s.out >= 1) { s.state = 'rest'; s.timer = rand(1.5, 4); s.noRetract = true; }
      }

      // pose
      const e = ease(s.out);
      s.body.scale.setScalar(Math.max(e, 0.001));
      s.body.visible = e > 0.02;
      // the soft body under the shell draws up into it too, so a closed snail is shell and plate
      s.mass.scale.set(0.42 * (0.3 + 0.7 * e), 0.34 * (0.3 + 0.7 * e), 0.24 * (0.3 + 0.7 * e));
      s.operculum.scale.set(0.26 * (1 - e) + 0.0001, 0.2 * (1 - e) + 0.0001, 1);
      s.operculum.visible = e < 0.98;
      const crawling = s.state === 'crawl' ? 1 : 0;
      s.foot.scale.x = 1.0 * (1 + 0.025 * Math.sin(time * 2.1 + s.phase) * crawling);
      for (const t of s.tentacles) {
        t.mesh.rotation.z = t.base + Math.sin(time * 1.6 + s.phase + (t.side > 0 ? 0 : 1.7)) * 0.14;
      }
      s.group.position.set(s.x, s.y, glassZ);
      s.group.rotation.z = s.heading;
    }
  }

  return {
    update,
    list,
    // the scene tells the snails where on the glass they may go, from the screen's shape
    setArea(a) { area = a; for (const s of list) { s.x = clamp(s.x, a.minX, a.maxX); s.y = clamp(s.y, a.minY, a.maxY); } },
    dispose() { for (const s of list) scene.remove(s.group); },
  };
}
