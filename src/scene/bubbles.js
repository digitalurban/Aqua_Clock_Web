import * as THREE from 'three';

/*
 * Glassy bubbles for the tank.
 *
 * The bubbles this replaces were 0.13-unit additive points: about two pixels
 * across on screen, in dark fog, which is to say invisible. That is not a tuning
 * problem, it is arithmetic, and it is why an air stone with bubbles rising from
 * it never showed no matter how many were emitted.
 *
 * A real bubble reads as: a bright thin rim (Fresnel), an almost clear body, a
 * hard specular glint where the key light hits it, a fainter reflection of the
 * opposite side, and a dark hairline edge that separates it from a bright
 * background. Below about seven pixels none of that can be resolved, so it
 * collapses smoothly to a soft dot, and nothing is ever drawn smaller than ~2.7px.
 *
 * Three sources:
 *   - the air stone: a dense plume that widens and grows as it rises, because the
 *     pressure falls, and wobbles harder the bigger a bubble is;
 *   - the pump: fine white micro-bubbles it entrains and throws across the tank;
 *   - pearling: single bubbles that form on leaves and let go now and then.
 *
 * Bubbles are camera-facing instanced quads, depth-tested so a plant in front
 * hides a bubble behind it, tinted by the same per-channel absorption the water
 * model uses, and fully simulated on the CPU (a few hundred, which is nothing).
 */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec4 aData;            // x radius, y seed, z fade, w kind
uniform float uPxScale;          // pixels per world unit at distance 1
varying vec2 vUv;
varying vec4 vData;
varying float vDepth;
varying float vPx;
void main() {
  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  float d = max(-mv.z, 0.1);
  float diaPx = aData.x * 2.0 * uPxScale / d;
  // never smaller than about 2.7px: a bubble that shrinks below the pixel grid
  // does not fade, it flickers
  float grow = max(1.0, 2.7 / max(diaPx, 1e-3));
  float r = aData.x * grow * step(0.0001, aData.x);
  mv.xy += position.xy * (2.0 * r);
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
  vData = aData;
  vDepth = d;
  vPx = diaPx * grow;
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vData;
varying float vDepth;
varying float vPx;
uniform vec3 uAbsorb;            // per-channel absorption, the water model's own
uniform float uLight;            // how much light there is: 1 by day, less at night
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;

  // resolvable only when there are enough pixels to hold the structure
  float detail = smoothstep(3.2, 7.5, vPx);

  float rim = smoothstep(0.52, 0.90, r) * (1.0 - smoothstep(0.90, 1.0, r));
  float edge = smoothstep(0.88, 0.955, r) * (1.0 - smoothstep(0.955, 1.0, r));
  // the key light comes from above-left-front: glint high and to the left
  vec2 g1 = vUv - vec2(-0.36, 0.40);
  float glint = exp(-dot(g1, g1) / 0.020);
  // and the opposite face throws back a dimmer reflection
  vec2 g2 = vUv - vec2(0.42, -0.36);
  float back = exp(-dot(g2, g2) / 0.060);

  float glassA = clamp(rim * 0.78 + 0.08 + glint * 0.95 + back * 0.34, 0.0, 1.0);
  vec3 glassC = mix(vec3(0.62, 0.80, 0.86), vec3(1.0), clamp(glint * 1.2 + rim * 0.4, 0.0, 1.0));
  glassC = mix(glassC, vec3(0.02, 0.06, 0.06), edge * 0.42);

  // small ones: a soft dot
  float dotA = exp(-r * r * 3.0) * 0.85;
  float a = mix(dotA, glassA, detail);
  vec3 c = mix(vec3(0.86, 0.96, 1.0), glassC, detail);

  // light reaching the eye has crossed this much water
  vec3 T = exp(-uAbsorb * vDepth);
  c *= T * 1.08 * uLight;
  a *= vData.z * mix(0.55, 1.0, T.g);
  gl_FragColor = vec4(c, a);
}
`;

export function createBubbles(scene, cfg) {
  // The surface is movable: it is where the bubbles pop. The water's surface is never drawn, so
  // on a lens wide enough to see above it the scene raises this to just past the top of the
  // screen, and the bubbles run off the top of the picture and not out in open water.
  let surfaceY = cfg.surfaceY;
  let pumpSurfaceY = cfg.surfaceY; // the pump hangs far back, where the top of the screen is higher, so its bubbles pop higher
  const { lite, stone, pump, bedAt, absorb = [0.022, 0.0085, 0.0055] } = cfg;
  const MAX = lite ? 1000 : 1800;
  const RATE_STONE = lite ? 115 : 230;
  const RATE_PUMP = lite ? 34 : 70;

  const center = new Float32Array(MAX * 3);
  const data = new Float32Array(MAX * 4);
  const pool = Array.from({ length: MAX }, () => ({
    on: false, kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, ox: 0, oz: 0,
    r: 0.03, r0: 0.03, seed: 0, age: 0, life: 0, drift: 0, driftZ: 0, freq: 0, phase: 0,
  }));

  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(center, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = MAX;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uPxScale: { value: 1500 },
      uAbsorb: { value: new THREE.Vector3(...absorb) },
      uLight: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  // stone axis, for spreading emission along its length
  const axis = new THREE.Vector3(Math.cos(stone.yaw), 0, -Math.sin(stone.yaw));

  let cursor = 0;
  function take() {
    for (let n = 0; n < MAX; n++) {
      const i = (cursor + n) % MAX;
      if (!pool[i].on) { cursor = (i + 1) % MAX; return pool[i]; }
    }
    return null;
  }

  function spawnStone() {
    const b = take(); if (!b) return;
    const a = rand(-0.5, 0.5) * stone.length;
    b.on = true; b.kind = 0; b.age = 0;
    b.ox = stone.x + axis.x * a + rand(-0.05, 0.05);
    b.oz = stone.z + axis.z * a + rand(-0.05, 0.05);
    b.x = b.ox; b.z = b.oz; b.y = stone.y + stone.radius * 0.85;
    // a fine mist of small bubbles with a tail of larger ones
    b.r0 = b.r = Math.pow(Math.random(), 1.7) * 0.03 + 0.020;
    b.vy = 1.35 + 24 * b.r0 + rand(-0.15, 0.25);      // bigger rises faster
    b.drift = rand(-0.16, 0.16);
    b.driftZ = rand(-0.06, 0.06);
    b.freq = rand(4.5, 9);
    b.phase = rand(0, 6.283);
    b.life = 99;
  }

  function spawnPump() {
    const b = take(); if (!b) return;
    b.on = true; b.kind = 1; b.age = 0;
    b.x = pump.x + (pump.outlet ?? 1.55); b.y = pump.y - 0.1 + rand(-0.2, 0.2); b.z = pump.z + rand(-0.55, 0.3);
    b.r0 = b.r = rand(0.016, 0.036);
    b.vx = rand(2.2, 3.6); b.vy = rand(-0.25, 0.1);
    b.freq = rand(2, 5); b.phase = rand(0, 6.283);
    b.life = 99;   // they live until they reach the surface (pumpSurfaceY), not for a few seconds
  }

  function spawnPearl(e) {
    const b = take(); if (!b) return;
    b.on = true; b.kind = 2; b.age = 0;
    b.ox = e.x + rand(-0.06, 0.06); b.oz = e.z; b.x = b.ox; b.z = b.oz; b.y = e.y;
    b.r0 = b.r = rand(0.024, 0.040);
    b.vy = rand(0.9, 1.5);
    b.freq = rand(5, 9); b.phase = rand(0, 6.283);
    b.life = 99;
  }

  const pearls = Array.from({ length: lite ? 3 : 6 }, () => {
    const x = rand(-6.5, 6.5), z = rand(-2.6, 0.6);
    return { x, z, y: bedAt(x, z) + rand(1.1, 2.6), timer: rand(0, 3) };
  });

  let accStone = 0, accPump = 0;
  let intensity = 1;   // 1 is as it was; 0 none, and up to 3 times as many

  function update(dt, t) {
    accStone += RATE_STONE * intensity * dt; while (accStone >= 1) { accStone -= 1; spawnStone(); }
    accPump += RATE_PUMP * intensity * dt; while (accPump >= 1) { accPump -= 1; spawnPump(); }
    for (const e of pearls) { e.timer -= dt * intensity; if (e.timer <= 0) { spawnPearl(e); e.timer = rand(1.3, 4.5); } }

    for (let i = 0; i < MAX; i++) {
      const b = pool[i];
      if (!b.on) { data[i * 4] = 0; continue; }
      b.age += dt;
      let fade = 1;

      if (b.kind === 0) {
        const h = b.y - stone.y;
        b.y += b.vy * (1 + 0.035 * h) * dt;
        // bigger bubbles wobble harder, and the whole plume sways a little
        const wob = 0.05 + 0.9 * b.r;
        const sway = Math.sin(t * 0.45 + h * 0.35) * 0.05 * h;
        b.x = b.ox + b.drift * b.age + Math.sin(b.phase + b.age * b.freq) * wob * 0.5 + sway;
        b.z = b.oz + b.driftZ * b.age + Math.cos(b.phase * 1.3 + b.age * b.freq * 0.8) * wob * 0.35;
        b.r = b.r0 * (1 + 0.03 * h);            // pressure falls as it rises
        fade = clamp(b.age / 0.12, 0, 1) * clamp((surfaceY - 0.25 - b.y) / 0.5, 0, 1);
        if (b.y > surfaceY - 0.25) b.on = false;
      } else if (b.kind === 1) {
        b.vx *= Math.exp(-0.6 * dt);
        b.vy = Math.min(1.1, b.vy + 0.9 * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt + Math.sin(b.phase + b.age * b.freq) * 0.12 * dt;
        fade = clamp(b.age / 0.25, 0, 1) * clamp((b.life - b.age) / 1.0, 0, 1) * 0.9;
        if (b.age > b.life || b.y > pumpSurfaceY - 0.3) b.on = false;
      } else {
        b.y += b.vy * dt;
        b.x = b.ox + Math.sin(b.phase + b.age * b.freq) * 0.08;
        fade = clamp(b.age / 0.2, 0, 1) * clamp((surfaceY - 0.25 - b.y) / 0.5, 0, 1);
        if (b.y > surfaceY - 0.25) b.on = false;
      }

      center[i * 3] = b.x; center[i * 3 + 1] = b.y; center[i * 3 + 2] = b.z;
      data[i * 4] = b.on ? b.r : 0;
      data[i * 4 + 1] = b.seed; data[i * 4 + 2] = fade; data[i * 4 + 3] = b.kind;
    }
    geometry.attributes.aCenter.needsUpdate = true;
    geometry.attributes.aData.needsUpdate = true;
  }

  // the column should already be running when the page first draws
  for (let i = 0; i < 200; i++) update(1 / 30, i / 30);

  return {
    update,
    // how many bubbles: 1 as it was, 0 none (bubbles already rising finish their way up)
    setIntensity(k) { intensity = Math.min(3, Math.max(0, Number.isFinite(+k) ? +k : 1)); },
    /** Pixels per world unit at distance 1, from the drawing-buffer height and the vertical fov. */
    setLight(v) { material.uniforms.uLight.value = v; },
    setSurface(y, pumpY = y) { surfaceY = y; pumpSurfaceY = pumpY; },
    get surface() { return surfaceY; },
    get pumpSurface() { return pumpSurfaceY; },
    setViewport(heightPx, fovDeg) {
      material.uniforms.uPxScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    },
    dispose() { geometry.dispose(); material.dispose(); quad.dispose(); scene.remove(mesh); },
  };
}
