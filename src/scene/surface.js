import * as THREE from 'three';
import { SURFACE_Y } from './riverscape/water.js';

/*
 * What there is to see at the top of the water, and what comes down through it.
 *
 * The surface. Seen from below at a shallow angle, the surface of water is a mirror: it
 * reflects the tank back at you. The tank's lens, wide in full screen and on a phone, sees
 * a band of it at the top of the picture, so it is drawn: a rippled sheet that is brightest
 * toward the top of the screen, fading into the fog where it meets the back panel, with thin
 * bright lines where a ripple faces you and dark green wisps low in the band, which is the
 * grass tops reflected in it. It is a fake: no second render of the tank, which a phone
 * could not afford.
 *
 * The beams. Soft shafts of light from the surface, slanting the way the key light does, a
 * few of them, drifting a little, fading as they go down. They are additive and sit behind
 * the fish and the nearer plants.
 */

const rand = (a, b) => a + Math.random() * (b - a);

const SURFACE_VERT = /* glsl */ `
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vW = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const SURFACE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uBright;
  uniform float uLite;
  uniform vec3 uTint;
  uniform vec3 uDeep;
  uniform vec3 uSheen;
  varying vec3 vW;
  #include <common>
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // The surface height: layers of noise drifting at different speeds, so the ripples are irregular.
  float height(vec2 p, float t) {
    float h = vnoise(p + vec2(t * 0.04, t * 0.02)) * 0.6;
    h += vnoise(p * 2.3 - vec2(t * 0.06, -t * 0.03) + 7.3) * 0.4;
    return h;
  }
  void main() {
    vec3 rd = normalize(vW - cameraPosition);
    // Ripples seen from below at a shallow angle are long and low, so the pattern is sampled
    // much wider across than along.
    vec2 p = vec2(vW.x * 1.1, vW.z * 0.36);
    float h = height(p, uTime);
    // how far up the picture: 0 at the far edge, where the surface meets the back panel, 1 at the top
    float up = smoothstep(0.19, 0.34, clamp(rd.y, 0.0, 1.0));
    // a calm, bright, bluish sheet that is brighter toward the top. It is never made darker than
    // this: no dark patches, which read as dirt and not as water
    vec3 col = mix(uDeep, uTint, 0.35 + 0.5 * up);
    // thin bright lines along the contours of the ripples, where they catch the light
    float f = fract(h * 6.0 + uTime * 0.03);
    float line = smoothstep(0.055, 0.0, min(f, 1.0 - f));
    col += uSheen * line * (0.07 + 0.15 * up);
    col *= mix(0.3, 1.0, uBright);
    // it is only a thin shimmering band at the top: it fades out well before it reaches the tank
    float alpha = smoothstep(0.22, 0.31, rd.y);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function createSurface(scene, { lite = false } = {}) {
  const geometry = new THREE.PlaneGeometry(70, 30);
  geometry.rotateX(Math.PI / 2); // lies flat, facing down into the water
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uBright: { value: 1 }, uLite: { value: lite ? 1 : 0 },
    uTint: { value: new THREE.Color('#9fc8dc') }, uDeep: { value: new THREE.Color('#2a6688') },
    uSheen: { value: new THREE.Color('#ffffff') }, uPlant: { value: new THREE.Color('#2f6b3a') },
  }]);
  const material = new THREE.ShaderMaterial({ uniforms, fog: true, vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  // from the back panel to just short of the camera, so the band reaches the top of any picture
  mesh.position.set(0, SURFACE_Y, 6);
  scene.add(mesh);
  const tint = new THREE.Color(), cyan = new THREE.Color('#8fd0ee');
  return {
    mesh,
    update(time, s) {
      uniforms.uTime.value = time;
      uniforms.uBright.value = s.surface;
      uniforms.uDeep.value.copy(s.board);
      tint.copy(s.fog).lerp(cyan, 0.55);        // the fog's colour, pushed toward a bright blue
      uniforms.uTint.value.copy(tint);
      uniforms.uSheen.value.copy(s.keyC);
    },
    dispose() { geometry.dispose(); material.dispose(); scene.remove(mesh); },
  };
}

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uSeed;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float across = clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);
    float profile = pow(across, 2.2);
    float down = pow(vUv.y, 1.3);                     // uv.y is 1 at the surface, 0 at the far end
    float shimmer = 0.78 + 0.22 * sin(vUv.y * 11.0 - uTime * 0.5 + uSeed) * sin(uTime * 0.23 + uSeed * 2.0);
    float a = profile * down * shimmer * uStrength;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;

export function createShafts(scene, { lite = false } = {}) {
  const count = lite ? 4 : 7;
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, -0.5, 0); // hangs down from its top edge, which is at the surface
  const group = new THREE.Group();
  group.position.y = SURFACE_Y + 4;   // the beams start above the top of the picture, so none has a visible top end
  scene.add(group);
  const beams = [];
  for (let i = 0; i < count; i++) {
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0 }, uSeed: { value: rand(0, 100) }, uColor: { value: new THREE.Color() } },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(rand(1.1, 2.6), rand(12.4, 13.6), 1);
    const pivot = new THREE.Group();
    pivot.add(mesh);
    group.add(pivot);
    beams.push({ pivot, material, x0: rand(-9, 9), z0: rand(-5, 0.5), drift: rand(0.2, 0.5), phase: rand(0, 6.28), speed: rand(0.04, 0.09), base: rand(0.6, 1) });
  }
  const colour = new THREE.Color(), pale = new THREE.Color('#cfe9f2');
  return {
    beams,
    update(time, s) {
      // the beams slant the way the key light travels: down and away from it
      const tilt = Math.atan2(-s.keyPos.x, s.keyPos.y - 1);
      colour.copy(pale).lerp(s.keyC, 0.5);
      for (const b of beams) {
        b.pivot.position.set(b.x0 + Math.sin(time * b.speed + b.phase) * b.drift, 0, b.z0);
        b.pivot.rotation.z = tilt + 0.02 * Math.sin(time * 0.07 + b.phase);
        const u = b.material.uniforms;
        u.uTime.value = time;
        u.uStrength.value = s.shafts * b.base * 0.16;
        u.uColor.value.copy(colour);
      }
    },
    dispose() { for (const b of beams) b.material.dispose(); geometry.dispose(); scene.remove(group); },
  };
}
