// The sky, in two moods. Day: a summer afternoon over the Swedish countryside – a deep blue zenith,
// a pale hazy horizon, a warm sun and drifting fair-weather clouds. Dusk (course 2): the sun has
// just set ahead of you in the south-west, the horizon glows orange and pink under a deep blue sky
// with the first stars. The same dome, with a ground below it, is rendered into an environment
// map: that is what the paint, the chrome and the glass reflect.
import * as THREE from './three.js';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.62, -0.66).normalize(); // from the south-west, afternoon

export const MOODS = {
  day: {
    sun: SUN_DIR.clone(), zen: [0.10, 0.27, 0.66], hor: [0.70, 0.80, 0.90], glow: [1.0, 0.86, 0.62], band: 0, disc: 1,
    cloudA: [0.78, 0.8, 0.84], cloudB: [1.0, 0.98, 0.95], cover: 0.9, stars: 0, ground: [0.17, 0.2, 0.12],
  },
  dusk: {
    sun: new THREE.Vector3(-0.5, -0.045, -0.86).normalize(), zen: [0.03, 0.05, 0.15], hor: [0.36, 0.28, 0.4], glow: [1.0, 0.45, 0.17], band: 1, disc: 0,
    cloudA: [0.07, 0.07, 0.12], cloudB: [0.95, 0.45, 0.32], cover: 0.75, stars: 1, ground: [0.03, 0.035, 0.03],
  },
};

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);   // always at the far plane
}`;

const FRAG = /* glsl */`
uniform vec3 uSun, uZen, uHor, uGlow, uCloudA, uCloudB, uGroundCol;
uniform float uTime, uGround, uSunDisc, uBand, uCover, uStars;
varying vec3 vDir;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHor, uZen, pow(max(y, 0.0), 0.55));
  float sd = max(dot(d, uSun), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6);
  // after sunset: a warm band along the horizon, strongest toward where the sun went down
  if (uBand > 0.0) {
    vec2 hz = normalize(d.xz + 1e-5), sz = normalize(uSun.xz);
    float az = max(dot(hz, sz), 0.0);
    col += uGlow * uBand * (pow(az, 2.5) * 0.9 + 0.12) * exp(-max(y, 0.0) * 7.0);
    col += vec3(0.25, 0.12, 0.25) * uBand * pow(az, 1.5) * exp(-max(y, 0.0) * 2.5) * 0.4;
  }
  // stars, fading in high up
  if (uStars > 0.0 && y > 0.05) {
    vec2 g = floor(d.xz / (y + 0.4) * 220.0);
    float st = step(0.9975, h2(g)) * (0.5 + 0.5 * h2(g + 3.1));
    col += vec3(st) * uStars * smoothstep(0.12, 0.5, y) * 0.9;
  }
  // clouds on a flat layer above
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(uv * 1.3);
    float cov = smoothstep(0.52, 0.78, c) * smoothstep(0.0, 0.18, y) * uCover;
    vec3 cc = mix(uCloudA, uCloudB, smoothstep(0.55, 0.85, c) * 0.8 * (1.0 - uBand * 0.5) + pow(sd, 3.0) * (0.4 + uBand * 0.6));
    col = mix(col, cc, cov * 0.9);
  }
  col += vec3(30.0, 26.0, 20.0) * smoothstep(0.9994, 0.9998, sd) * uSunDisc;
  if (uGround > 0.5 && y < 0.0) col = mix(uHor * 0.8, uGroundCol, smoothstep(0.0, 0.12, -y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function skyMaterial(ground = false, mood = 'day') {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3() }, uTime: { value: 0 }, uGround: { value: ground ? 1 : 0 }, uSunDisc: { value: 1 },
      uZen: { value: new THREE.Vector3() }, uHor: { value: new THREE.Vector3() }, uGlow: { value: new THREE.Vector3() }, uBand: { value: 0 },
      uCloudA: { value: new THREE.Vector3() }, uCloudB: { value: new THREE.Vector3() }, uCover: { value: 1 }, uStars: { value: 0 }, uGroundCol: { value: new THREE.Vector3() },
    },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  setSkyMood(m, mood);
  return m;
}

export function setSkyMood(m, mood) {
  const M = MOODS[mood], U = m.uniforms;
  U.uSun.value.copy(M.sun); U.uZen.value.copy(v3(M.zen)); U.uHor.value.copy(v3(M.hor)); U.uGlow.value.copy(v3(M.glow));
  U.uBand.value = M.band; U.uSunDisc.value = M.disc; U.uCloudA.value.copy(v3(M.cloudA)); U.uCloudB.value.copy(v3(M.cloudB));
  U.uCover.value = M.cover; U.uStars.value = M.stars; U.uGroundCol.value.copy(v3(M.ground));
}

export function makeSky(radius = 2000) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), skyMaterial(false));
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// the environment map: the sky with a ground, pre-filtered for every roughness (one per mood)
const ENV = {};
export function makeEnvironment(renderer, mood = 'day') {
  if (ENV[mood]) return ENV[mood];
  const scene = new THREE.Scene();
  const mat = skyMaterial(true, mood);
  mat.uniforms.uSunDisc.value = MOODS[mood].disc * 0.35;
  mat.uniforms.uStars.value = 0;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0, 0.1, 1000);
  pm.dispose();
  return (ENV[mood] = rt.texture);
}
