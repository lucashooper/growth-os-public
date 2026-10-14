/**
 * WebGL2 Orb engine — faithful port of the standalone HTML embed.
 * Browser-only; call from client components.
 */

export type OrbConfig = {
  colors: string[];
  duration: number;
  blobScale: number;
  flow: number;
  turbulence: number;
  shift: number;
  balance: number;
  chroma: number;
  contrast: number;
  rim: number;
  specular: number;
  inner: number;
  wobble: number;
  iridescence: number;
  shading: number;
  refraction: number;
  lightX: number;
  lightY: number;
  aberration: number;
  grain: number;
  softness: number;
  glow: number;
};

export type OrbHandle = {
  update: (next: Partial<OrbConfig>) => void;
  capture: (size?: number) => { width: number; height: number; premultiplied: Uint8Array } | null;
  destroy: () => void;
  supported: boolean;
};

export const ORB_CONFIG: OrbConfig = {
  colors: ["#5c515c", "#5bcd1d"],
  duration: 7,
  blobScale: 3,
  flow: 0.6,
  turbulence: 0.4,
  shift: 0.23,
  balance: 0.5,
  chroma: 1,
  contrast: 1,
  rim: 0,
  specular: 0.15,
  inner: 0.38,
  wobble: 0,
  iridescence: 0,
  shading: 0.05,
  refraction: 0.25,
  lightX: -0.6,
  lightY: -1,
  aberration: 0.8,
  grain: 0.55,
  softness: 0.02,
  glow: 0.08,
};

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  uRes;
uniform float uPhase;
uniform vec3  uLab[4];
uniform float uCount;
uniform float uScaleN;
uniform float uFlow;
uniform float uTurb;
uniform float uWobble;
uniform float uIrid;
uniform float uShift;
uniform float uBalance;
uniform float uChroma;
uniform float uContrast;
uniform float uSoft;
uniform float uGlow;
uniform float uShading;
uniform float uSpec;
uniform float uRim;
uniform float uRefract;
uniform float uInner;
uniform float uAberr;
uniform float uGrain;
uniform vec3  uLight;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float RAD = 0.86;
const float RMAX = 1.0 / RAD;

uint hashU(uint x) {
  x ^= x >> 16; x *= 0x85EBCA6Bu;
  x ^= x >> 13; x *= 0xC2B2AE35u;
  x ^= x >> 16;
  return x;
}
uint hashU2(uvec2 p) { return hashU(p.x * 0x9E3779B9u ^ hashU(p.y)); }
uint hashU3(uvec3 p) { return hashU(p.x * 0x9E3779B9u ^ hashU(p.y) ^ hashU(p.z) * 0x27D4EB2Fu); }
float rand2(ivec2 p) { return float(hashU2(uvec2(p + 4096)) >> 8) / 16777216.0; }
float rand3(ivec3 p) { return float(hashU3(uvec3(p + 4096)) >> 8) / 16777216.0; }

float vnoise(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rand2(i),                 rand2(i + ivec2(1, 0)), u.x),
             mix(rand2(i + ivec2(0, 1)),   rand2(i + ivec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s / 0.875;
}

vec2 flowField(vec2 p) {
  float ang = TAU * vnoise(p + 11.3) + uPhase;
  float mag = 0.35 + 0.65 * vnoise(p + 27.9);
  return vec2(cos(ang), sin(ang)) * mag;
}

vec3 iridesce(vec3 lab, float f) {
  float a = uIrid * f * -2.2;
  float c = cos(a), s = sin(a);
  return vec3(lab.x, c * lab.y - s * lab.z, s * lab.y + c * lab.z);
}

vec3 labRamp(float x) {
  float xx = clamp(x, 0.0, 1.0) * (uCount - 1.0);
  vec3 c = mix(uLab[0], uLab[1], clamp(xx, 0.0, 1.0));
  c = mix(c, uLab[2], clamp(xx - 1.0, 0.0, 1.0));
  c = mix(c, uLab[3], clamp(xx - 2.0, 0.0, 1.0));
  return c;
}

vec3 paletteLab(float t) {
  float x = pow(clamp(0.5 + 0.5 * cos(TAU * t), 0.0, 1.0), uBalance);
  vec3 lab = labRamp(x);
  float ang = TAU * (t * 2.0 + 0.123);
  float amp = 0.17 * uChroma * length(lab.yz);
  lab.yz += amp * vec2(sin(ang), cos(ang * 1.37 + 1.1));
  float ch = length(lab.yz);
  if (ch > 0.33) lab.yz *= 0.33 / ch;
  lab.x = clamp(0.5 + (lab.x - 0.5) * uContrast, 0.0, 1.0);
  return lab;
}

vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  vec3 lms = vec3(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  return mat3( 4.0767416621, -1.2684380046, -0.0041960863,
              -3.3077115913,  2.6097574011, -0.7034186147,
               0.2309699292, -0.3413193965,  1.7076147010) * lms;
}

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  uv /= RAD;

  if (uWobble > 0.0) {
    float r0 = length(uv);
    float th = atan(uv.y, uv.x + 1e-6);
    float wob = 0.60 * sin(3.0 * th + uPhase)
              + 0.40 * sin(5.0 * th - 2.0 * uPhase)
              + 0.25 * sin(7.0 * th + 3.0 * uPhase);
    uv *= 1.0 - uWobble * 0.055 * wob * smoothstep(0.0, 0.5, r0);
  }

  float r = length(uv);
  vec2 pd = uv / max(r, 1.0);
  float z = sqrt(max(1.0 - dot(pd, pd), 0.0));
  vec3 n = vec3(pd, z);

  vec2 p0 = (pd - n.xy * uRefract) * uScaleN;
  vec2 p1 = p0 + uFlow * flowField(p0);
  vec2 p2 = p1 + uTurb * flowField(p1 * 1.7 + 5.2);
  float noise = mix(0.5, fbm(p2 + 3.7), 1.35);
  float t = noise + uShift;

  float fres3 = pow(1.0 - n.z, 3.0);
  vec3 lab = iridesce(paletteLab(t), fres3);
  vec3 base;
  if (uAberr > 0.001) {
    float d = uAberr * 0.05 * r * r;
    base = vec3(oklabToLinear(iridesce(paletteLab(t - d), fres3)).r,
                oklabToLinear(lab).g,
                oklabToLinear(iridesce(paletteLab(t + d), fres3)).b);
  } else {
    base = oklabToLinear(lab);
  }
  base = max(base, 0.0);

  vec3 L = normalize(uLight);
  float diffD = clamp(dot(n, L), 0.0, 1.0);
  vec3 col = mix(base, vec3(diffD), uShading);

  vec2 op = pd + L.xy * 0.45;
  col += uInner * exp(-dot(op, op) * 2.2) * base;

  float fres = pow(1.0 - n.z, 8.0) * uRim;
  vec3 half_ = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, half_), 0.0), 24.3) * uSpec;
  col += fres + spec;

  vec3 lit = linearToSrgb(col);
  vec3 flat_ = linearToSrgb(base);

  float w = max(uSoft, 1.5 * fwidth(r));
  float body = 1.0 - smoothstep(1.0 - w, 1.0, r);
  float glowF = uGlow * exp(-max(r - 1.0, 0.0) * 20.0);
  glowF *= 1.0 - smoothstep(0.45, 1.0, (r - 1.0) / (RMAX - 1.0));
  float a = clamp(body + glowF * (1.0 - body), 0.0, 1.0);
  vec3 outCol = mix(flat_, lit, body);

  int frame = int(uPhase / TAU * 24.0);
  float gn = rand3(ivec3(ivec2(gl_FragCoord.xy), frame)) - 0.5;
  outCol += gn * (uGrain * 0.1 + 1.0 / 255.0);

  outCol = clamp(outCol, 0.0, 1.0);
  fragColor = vec4(outCol * a, a);
}`;

function hexToRGB(hex: string): [number, number, number] {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  let v = parseInt(h, 16);
  if (isNaN(v)) v = 0;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function srgbToOklab(hex: string): [number, number, number] {
  const c = hexToRGB(hex).map((u) =>
    u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4),
  );
  const l = 0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2];
  const m = 0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2];
  const s = 0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2];
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

export function createOrb(
  container: HTMLElement,
  config: Partial<OrbConfig> = {},
): OrbHandle {
  const cfg: OrbConfig = { ...ORB_CONFIG, ...config };
  const TAU = Math.PI * 2;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "width:100%;height:100%;display:block;border:0;outline:none;box-shadow:none;background:transparent;";
  container.appendChild(canvas);

  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
  } catch {
    gl = null;
  }

  if (!gl) {
    canvas.remove();
    const fb = document.createElement("div");
    fb.style.cssText = "width:100%;height:100%;border-radius:50%;";
    container.appendChild(fb);
    const applyFallback = (next: Partial<OrbConfig>) => {
      Object.assign(cfg, next);
      const cs = (cfg.colors || ["#888888", "#444444"]).slice(0, 4);
      fb.style.background = `radial-gradient(circle at 35% 32%, ${cs.join(", ")})`;
    };
    applyFallback(config);
    return {
      update: applyFallback,
      capture: () => null,
      destroy: () => {
        fb.remove();
      },
      supported: false,
    };
  }

  const gl2 = gl;
  let prog: WebGLProgram | null = null;
  let loc: Record<string, WebGLUniformLocation | null> = {};
  const vals: Record<string, number | number[] | Float32Array> = {};

  function compile(type: number, src: string) {
    const sh = gl2.createShader(type);
    if (!sh) throw new Error("Orb shader create failed");
    gl2.shaderSource(sh, src);
    gl2.compileShader(sh);
    if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) {
      const log = gl2.getShaderInfoLog(sh);
      gl2.deleteShader(sh);
      throw new Error("Orb shader compile failed: " + log);
    }
    return sh;
  }

  function pushUniforms() {
    if (!prog) return;
    gl2.useProgram(prog);
    for (const k of Object.keys(vals)) {
      const l = loc[k];
      if (!l) continue;
      const v = vals[k];
      if (typeof v === "number") gl2.uniform1f(l, v);
      else if (v.length === 2) gl2.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl2.uniform3f(l, v[0], v[1], v[2]);
      else gl2.uniform3fv(l, v as Float32Array);
    }
  }

  function buildProgram() {
    const vs = compile(gl2.VERTEX_SHADER, VERT);
    const fs = compile(gl2.FRAGMENT_SHADER, FRAG);
    const p = gl2.createProgram();
    if (!p) throw new Error("Orb program create failed");
    gl2.attachShader(p, vs);
    gl2.attachShader(p, fs);
    gl2.linkProgram(p);
    gl2.deleteShader(vs);
    gl2.deleteShader(fs);
    if (!gl2.getProgramParameter(p, gl2.LINK_STATUS)) {
      throw new Error("Orb program link failed: " + gl2.getProgramInfoLog(p));
    }
    prog = p;
    loc = {};
    const n = gl2.getProgramParameter(p, gl2.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl2.getActiveUniform(p, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, "");
      loc[name] = gl2.getUniformLocation(p, name);
    }
    gl2.useProgram(p);
    gl2.disable(gl2.DEPTH_TEST);
    gl2.disable(gl2.BLEND);
    pushUniforms();
  }

  function update(next: Partial<OrbConfig>) {
    Object.assign(cfg, next);
    const cols = cfg.colors.slice(0, 4);
    while (cols.length < 4) cols.push(cols[cols.length - 1]!);
    const lab = new Float32Array(12);
    for (let i = 0; i < 4; i++) {
      const v = srgbToOklab(cols[i]!);
      lab[i * 3] = v[0];
      lab[i * 3 + 1] = v[1];
      lab[i * 3 + 2] = v[2];
    }
    vals.uLab = lab;
    vals.uCount = Math.max(2, Math.min(cfg.colors.length, 4));
    vals.uScaleN = 1.45 / Math.max(cfg.blobScale, 0.05);
    vals.uFlow = cfg.flow;
    vals.uTurb = cfg.turbulence;
    vals.uWobble = cfg.wobble;
    vals.uIrid = cfg.iridescence;
    vals.uShift = cfg.shift;
    vals.uBalance = Math.pow(5, (0.5 - cfg.balance) * 2);
    vals.uChroma = cfg.chroma;
    vals.uContrast = cfg.contrast;
    vals.uSoft = cfg.softness;
    vals.uGlow = cfg.glow;
    vals.uShading = cfg.shading;
    vals.uSpec = cfg.specular;
    vals.uRim = cfg.rim;
    vals.uRefract = cfg.refraction;
    vals.uInner = cfg.inner;
    vals.uAberr = cfg.aberration;
    vals.uGrain = cfg.grain;
    vals.uLight = [cfg.lightX, cfg.lightY, 0.65];
    pushUniforms();
    if (!running) render();
  }

  function resize(entry?: ResizeObserverEntry) {
    let w: number;
    let h: number;
    const box = entry?.devicePixelContentBoxSize;
    if (box && box.length) {
      w = box[0]!.inlineSize;
      h = box[0]!.blockSize;
    } else {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.round((container.clientWidth || 1) * dpr);
      h = Math.round((container.clientHeight || 1) * dpr);
    }
    w = Math.max(1, w);
    h = Math.max(1, h);
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    gl2.viewport(0, 0, w, h);
    vals.uRes = [w, h];
    pushUniforms();
    return true;
  }

  function render() {
    if (!prog) return;
    gl2.useProgram(prog);
    gl2.drawArrays(gl2.TRIANGLES, 0, 3);
  }

  let phase = 0;
  let pending = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let onScreen = true;
  let reduced = false;
  const CAP = 1000 / 60;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) : 16.7;
    last = now;
    pending += dt;
    if (pending < CAP - dt * 0.5) return;
    phase = (phase + pending / 1000 / cfg.duration) % 1;
    pending = 0;
    vals.uPhase = phase * TAU;
    gl2.useProgram(prog);
    if (loc.uPhase) gl2.uniform1f(loc.uPhase, vals.uPhase as number);
    render();
  }

  function start() {
    if (running || reduced || !onScreen || !prog) return;
    running = true;
    last = 0;
    pending = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  vals.uPhase = 0;
  buildProgram();
  resize();
  update(config);

  const mq = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  function applyMotionPref() {
    reduced = !!(mq && mq.matches);
    if (reduced) {
      stop();
      phase = 0;
      vals.uPhase = 0;
      pushUniforms();
      render();
    } else {
      start();
    }
  }
  if (mq && mq.addEventListener) mq.addEventListener("change", applyMotionPref);

  let ro: ResizeObserver | null = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver((entries) => {
      if (resize(entries[0]) && !running) render();
    });
    try {
      ro.observe(container, { box: "device-pixel-content-box" });
    } catch {
      ro.observe(container);
    }
  }

  let io: IntersectionObserver | null = null;
  if (window.IntersectionObserver) {
    io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[entries.length - 1]!.isIntersecting;
        if (onScreen) start();
        else stop();
      },
      { rootMargin: "120px" },
    );
    io.observe(container);
  }

  function onLost(e: Event) {
    e.preventDefault();
    stop();
    prog = null;
  }
  function onRestored() {
    buildProgram();
    resize();
    update({});
    applyMotionPref();
  }
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  applyMotionPref();

  function capture(size?: number) {
    if (!prog) return null;
    size = Math.max(1, Math.min(Math.round(size || 2048), 4096));
    const pw = canvas.width;
    const ph = canvas.height;
    canvas.width = size;
    canvas.height = size;
    gl2.viewport(0, 0, size, size);
    vals.uRes = [size, size];
    pushUniforms();
    render();
    const px = new Uint8Array(size * size * 4);
    gl2.readPixels(0, 0, size, size, gl2.RGBA, gl2.UNSIGNED_BYTE, px);
    canvas.width = pw;
    canvas.height = ph;
    gl2.viewport(0, 0, pw, ph);
    vals.uRes = [pw, ph];
    pushUniforms();
    render();
    return { width: size, height: size, premultiplied: px };
  }

  return {
    update,
    capture,
    supported: true,
    destroy() {
      stop();
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (mq && mq.removeEventListener)
        mq.removeEventListener("change", applyMotionPref);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (prog) gl2.deleteProgram(prog);
      const ext = gl2.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
      canvas.remove();
    },
  };
}
