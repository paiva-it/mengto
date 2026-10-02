// WebGL laser background (per the webgl-laser skill): one full-screen quad, thin white-hot core,
// accent halo, fbm smoke concentrated around the beam. Extra over the skill's initializer: the
// beam's horizontal position is a screen fraction that eases between per-section targets.

const vert = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const frag = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color;
uniform float u_xOffset;
uniform float u_coreWidth;
uniform float u_glowWidth;
uniform float u_smokeDensity;
varying vec2 v_uv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (v_uv - 0.5) * aspect;
  float x = p.x - u_xOffset;
  float distanceToBeam = abs(x);

  float core = exp(-pow(distanceToBeam / u_coreWidth, 2.0));
  float glow = exp(-pow(distanceToBeam / u_glowWidth, 1.45));
  float scatter = exp(-pow(distanceToBeam / (u_glowWidth * 5.5), 1.25));
  float pulse = 0.9 + 0.1 * sin(u_time * 1.15);

  vec2 fogUv = p * 3.1 + vec2(0.0, -u_time * 0.035);
  fogUv.x += sin(p.y * 3.5 + u_time * 0.11) * 0.14;
  float fogBase = fbm(fogUv);
  float fogFine = fbm(p * 8.0 + vec2(sin(u_time * 0.07) * 0.35, u_time * 0.05));
  float fog = smoothstep(0.30, 0.86, fogBase * 0.72 + fogFine * 0.28);
  float smoke = fog * scatter * u_smokeDensity;

  vec3 brand = clamp(u_color, 0.0, 1.0);
  vec3 haloColor = mix(brand, vec3(1.0), 0.16);
  vec3 smokeColor = mix(brand, vec3(0.55), 0.28) * 0.55;
  vec3 hotCore = vec3(1.0, 0.96, 0.90);

  vec3 color = vec3(0.006, 0.007, 0.010);
  color += smokeColor * smoke;
  color += haloColor * glow * 0.46 * pulse;
  color += hotCore * core * 1.35;

  float vignette = smoothstep(1.25, 0.18, length(p));
  color *= vignette;

  float alpha = clamp(smoke * 0.72 + glow * 0.68 + core, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const v = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'compile failed');
  return s;
}

interface LaserHandle {
  /** Move the beam to a screen fraction (0 = left edge, 1 = right edge). */
  setTarget(frac: number): void;
}

function initLaser(canvas: HTMLCanvasElement, accentHex: string): LaserHandle | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;

  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link failed');
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const u = (n: string) => gl.getUniformLocation(program, n);
  const uRes = u('u_resolution'), uTime = u('u_time'), uX = u('u_xOffset');
  const [r, g, b] = hexToRgb01(accentHex);
  gl.uniform3f(u('u_color'), r, g, b);
  gl.uniform1f(u('u_coreWidth'), 0.0045);
  gl.uniform1f(u('u_glowWidth'), 0.035);
  gl.uniform1f(u('u_smokeDensity'), 1.5);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frac = 0.5, target = 0.5, raf = 0, last = 0;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const draw = (t: number) => {
    const aspect = canvas.width / canvas.height;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t * 0.001);
    // Screen fraction -> the shader's aspect-correct centred space.
    gl.uniform1f(uX, (frac - 0.5) * aspect);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const loop = (t: number) => {
    const dt = Math.min(64, t - (last || t));
    last = t;
    frac += (target - frac) * (1 - Math.exp(-dt / 520)); // slow, weighted glide
    draw(t);
    raf = requestAnimationFrame(loop);
  };

  resize();
  addEventListener('resize', () => {
    resize();
    if (reduce) draw(0);
  });
  if (reduce) draw(0);
  else raf = requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    cancelAnimationFrame(raf);
    last = 0;
    if (!document.hidden) raf = requestAnimationFrame(loop);
  });

  return {
    setTarget(f) {
      target = f;
      if (reduce) {
        frac = f;
        draw(0);
      }
    },
  };
}

export { initLaser };
