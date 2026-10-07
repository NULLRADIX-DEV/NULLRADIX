/**
 * Speed effects over the film: while the film is scrubbed fast, a WebGL2 layer takes the film
 * canvas as a texture and redraws it - forwards with a zoom blur and chromatic fringes, backwards as
 * a tape rewinding (jittering lines, a rolling tracking strip, bleeding chroma, scanlines). The beat
 * in the bore breathes it in a little. At rest the layer is hidden and costs nothing: the film
 * itself stays on its fast 2D path.
 */
const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uFilm;
uniform vec2 uView;
uniform float uFwd, uBack, uKick, uTime;
out vec4 o;

float hash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 film(vec2 uv) { return texture(uFilm, uv).rgb; }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 uv = frag / uView, c = vec2(0.5);
  vec2 asp = vec2(uView.x / uView.y, 1.0);
  vec2 d = uv - c;
  float r = length(d * asp);
  uv = c + d * (1.0 - 0.006 * uKick); // the beat: a breath inwards
  d = uv - c;

  vec3 col;
  if (uFwd > 0.001) {
    // forwards: barrel, zoom blur towards the centre, fringes that grow to the edges
    uv = c + d * (1.0 + 0.035 * uFwd * r * r);
    d = uv - c;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 10; i++) {
      vec2 q = c + d * (1.0 - uFwd * 0.045 * float(i) / 9.0);
      vec2 ca = d * 0.007 * uFwd;
      acc += vec3(film(q + ca).r, film(q).g, film(q - ca).b);
    }
    col = acc / 10.0;
  } else col = film(uv);

  if (uBack > 0.001) {
    // backwards: the tape
    float tick = floor(uTime * 24.0);
    float jit = (hash(vec2(floor(frag.y / 3.0), tick)) - 0.5) * 0.014 * uBack;
    float wave = sin(uv.y * 38.0 + uTime * 9.0) * 0.0025 * uBack;
    float roll = fract(uv.y * 0.55 - uTime * 0.6);
    float strip = smoothstep(0.0, 0.035, roll) * (1.0 - smoothstep(0.035, 0.09, roll));
    vec2 q = uv + vec2(jit + wave + strip * 0.03 * uBack, 0.0);
    float bleed = 0.005 * uBack;
    vec3 t = vec3(film(q + vec2(bleed, 0.0)).r, film(q).g, film(q - vec2(bleed, 0.0)).b);
    t = mix(t, vec3(dot(t, vec3(0.299, 0.587, 0.114))), 0.35 * uBack);
    t *= 1.0 - 0.14 * uBack * step(0.5, fract(frag.y / 2.0));
    t += (hash(frag + uTime) - 0.5) * 0.09 * uBack;
    t += strip * 0.18 * uBack * hash(vec2(frag.x * 0.1, tick));
    col = mix(col, t, uBack);
  }
  col *= 1.0 - uKick * 0.22 * smoothstep(0.35, 1.1, r); // the edges darken with the beat
  o = vec4(col, 1.0);
}`;

export function createSpeedFx(film, layer) {
  const gl = layer.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return { render() {}, kind: 'off' };
  let uni = null, lost = false, shown = false;

  function init() {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one triangle covers it all
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    uni = {};
    for (const n of ['uView', 'uFwd', 'uBack', 'uKick', 'uTime']) uni[n] = gl.getUniformLocation(prog, n);
  }
  try {
    init();
  } catch (e) {
    console.warn('speed fx off', e);
    return { render() {}, kind: 'off' };
  }
  layer.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    show(false);
  });
  layer.addEventListener('webglcontextrestored', () => {
    init();
    lost = false;
  });

  function show(on) {
    if (on === shown) return;
    shown = on;
    layer.style.visibility = on ? 'visible' : 'hidden';
  }
  const smooth = (x) => x * x * (3 - 2 * x);

  return {
    kind: 'webgl2',
    /** every animation frame, after the film drew: speed in film seconds per second, kick 0..1 */
    render({ speed = 0, kick = 0, transform = '' }) {
      const fwd = smooth(Math.max(0, Math.min(1, (speed - 1.5) / 5.5)));
      const back = smooth(Math.max(0, Math.min(1, (-speed - 1.5) / 4.5)));
      const on = !lost && film.width > 0 && fwd + back + kick > 0.002;
      show(on);
      if (!on) return;
      if (layer.width !== film.width || layer.height !== film.height) {
        layer.width = film.width;
        layer.height = film.height;
      }
      layer.style.transform = transform; // the film's parallax
      gl.viewport(0, 0, layer.width, layer.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, film);
      gl.uniform2f(uni.uView, layer.width, layer.height);
      gl.uniform1f(uni.uFwd, fwd);
      gl.uniform1f(uni.uBack, back);
      gl.uniform1f(uni.uKick, kick);
      gl.uniform1f(uni.uTime, (performance.now() / 1000) % 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
