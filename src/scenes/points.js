/**
 * Additive point renderer for the live particle layers (hero sphere, closing wordmark).
 * WebGL2 with soft round points that add up like light, as the film's particles do; a plain 2D
 * canvas fallback draws small squares.
 */
const VERT = `#version 300 es
in vec3 a;
uniform vec2 uView;
uniform float uSize;
out float vB;
void main() {
  gl_Position = vec4(a.x / uView.x * 2.0 - 1.0, 1.0 - a.y / uView.y * 2.0, 0.0, 1.0);
  gl_PointSize = uSize;
  vB = a.z;
}`;
const FRAG = `#version 300 es
precision mediump float;
in float vB;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float k = exp(-dot(c, c) * 9.0) * vB;
  o = vec4(vec3(0.98, 0.98, 0.985) * k, k);
}`;

export function createPoints(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  const g2 = gl ? null : canvas.getContext('2d');
  let uView, uSize;
  if (gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    uView = gl.getUniformLocation(prog, 'uView');
    uSize = gl.getUniformLocation(prog, 'uSize');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  }
  let cw = 0, ch = 0, dpr = 1, shown = false;

  return {
    get shown() {
      return shown;
    },
    resize(vw, vh) {
      const r = Math.min(devicePixelRatio || 1, 2);
      if (cw === vw && ch === vh && dpr === r) return;
      cw = vw;
      ch = vh;
      dpr = r;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    },
    /** data: n triples (x, y in CSS px, brightness); size: point size in CSS px */
    draw(data, n, size) {
      shown = true;
      if (gl) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.uniform2f(uView, cw, ch);
        gl.uniform1f(uSize, size * dpr);
        gl.drawArrays(gl.POINTS, 0, n);
      } else {
        g2.setTransform(dpr, 0, 0, dpr, 0, 0);
        g2.clearRect(0, 0, cw, ch);
        g2.globalCompositeOperation = 'lighter';
        g2.fillStyle = 'rgba(250,250,251,0.4)';
        for (let j = 0; j < n * 3; j += 3) if (data[j + 2] > 0.01) g2.fillRect(data[j] - 0.8, data[j + 1] - 0.8, 1.6, 1.6);
      }
    },
    clear() {
      if (!shown) return;
      shown = false;
      if (gl) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else g2.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
