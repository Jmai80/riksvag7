// The sky: a summer afternoon over the Swedish countryside – a deep blue zenith, a pale hazy
// horizon, a warm sun and drifting fair-weather clouds. The same dome, with a ground below it, is
// rendered once into an environment map: that is what the paint, the chrome and the glass reflect.
import * as THREE from './three.js';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.62, -0.66).normalize(); // from the south-west, afternoon

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);   // always at the far plane
}`;

const FRAG = /* glsl */`
uniform vec3 uSun;
uniform float uTime;
uniform float uGround;   // 1: draw a ground colour below the horizon (for the environment map)
uniform float uSunDisc;
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
  vec3 zen = vec3(0.10, 0.27, 0.66), hor = vec3(0.70, 0.80, 0.90);
  vec3 col = mix(hor, zen, pow(max(y, 0.0), 0.55));
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.86, 0.62) * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6);
  // clouds on a flat layer above
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(uv * 1.3);
    float cov = smoothstep(0.52, 0.78, c) * smoothstep(0.0, 0.18, y);
    vec3 cc = mix(vec3(0.78, 0.8, 0.84), vec3(1.0, 0.98, 0.95), smoothstep(0.55, 0.85, c) * 0.8 + pow(sd, 4.0) * 0.4);
    col = mix(col, cc, cov * 0.9);
  }
  col += vec3(30.0, 26.0, 20.0) * smoothstep(0.9994, 0.9998, sd) * uSunDisc;
  if (uGround > 0.5 && y < 0.0) {
    vec3 g = vec3(0.17, 0.2, 0.12);
    col = mix(hor * 0.8, g, smoothstep(0.0, 0.12, -y));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function skyMaterial(ground = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 }, uGround: { value: ground ? 1 : 0 }, uSunDisc: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

export function makeSky(radius = 2000) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), skyMaterial(false));
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// the environment map: the sky with a ground, pre-filtered for every roughness
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const mat = skyMaterial(true);
  mat.uniforms.uSunDisc.value = 0.35;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat));
  // a few soft light shapes in the env: a bright horizon band, like a sunlit landscape
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0, 0.1, 1000);
  pm.dispose();
  return rt.texture;
}
