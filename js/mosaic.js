/* ------------------------------------------------------------------
   mosaic.js — the WebGL stage.

   The reference effect is a photo broken into a grid of ~10px chips;
   every chip holds one small character, and the whole thing sits on
   a white page with a soft blurred echo and a mirrored reflection.

   This reproduces it:
     · the scene is quantised to a chip grid (flat colour per chip)
     · a random glyph from the atlas is stamped on each chip
     · a thin white gap separates the chips
     · below the pavement line the scene is mirrored and faded
     · a blurred, drifting copy of the scene ghosts through the image
   ------------------------------------------------------------------ */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform sampler2D uScene;      // sharp scene
uniform sampler2D uBlur;       // medium blur (reflection)
uniform sampler2D uSoft;       // heavy blur (the drifting ghost)
uniform sampler2D uAtlas;      // glyph atlas

uniform vec2  uRes;            // viewport size, device px
uniform vec2  uSceneSize;      // scene texture size, px
uniform float uCover;          // device px per scene px
uniform vec2  uOffset;         // device px offset of the scene origin
uniform float uCell;           // chip size, device px
uniform float uTime;
uniform float uFloorY;         // pavement line, device px from the top
uniform float uPan;            // slow camera drift, device px
uniform float uEcho;           // strength of the blurred echo

const float ATLAS_N = 8.0;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 toSceneUv(vec2 screenPx) {
  vec2 p = (screenPx - uOffset - vec2(uPan, 0.0)) / uCover;
  return p / uSceneSize;
}

void main() {
  // device pixels, origin at the top-left
  vec2 sp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);

  // ---- locate the chip -------------------------------------------
  vec2 cell = floor(sp / uCell);
  vec2 center = (cell + 0.5) * uCell;          // chip centre
  vec2 cuv = fract(sp / uCell);                // 0..1 inside the chip cell

  // ---- the "photo" the chips sample --------------------------------
  vec2 suv = toSceneUv(center);
  vec3 sharp = texture2D(uScene, suv).rgb;

  // blurred, drifting echo: adds "ink" wherever the sharp pass is
  // near-white, which is exactly how the reference ghosts in
  vec2 drift = vec2(sin(uTime * 0.13) * 0.075, -0.045 - cos(uTime * 0.11) * 0.025);
  vec3 e = texture2D(uSoft, suv + drift).rgb;

  vec3 ink = (1.0 - sharp) + (1.0 - e) * uEcho;
  vec3 photo = clamp(1.0 - ink, 0.0, 1.0);

  // ---- mirrored reflection on the polished pavement ---------------
  vec2 msp = vec2(center.x, 2.0 * uFloorY - center.y);
  vec3 m = texture2D(uBlur, toSceneUv(msp)).rgb;

  float d = center.y - uFloorY;
  float fade = exp(-max(d, 0.0) / (uRes.y * 0.30));
  float g = clamp(max(d, 0.0) / (uRes.y * 0.60), 0.0, 1.0);
  vec3 floorCol = mix(vec3(0.996, 0.998, 1.0), vec3(0.945, 0.958, 0.975), g);
  vec3 refl = mix(floorCol, m, fade * 0.80);

  float edge = smoothstep(-5.0, 9.0, d);
  photo = mix(photo, refl, edge);

  // ---- draw the chip ----------------------------------------------
  const float FILL = 0.86;                     // chip size within its cell
  vec2 q = (cuv - 0.5) / FILL + 0.5;
  vec3 col;

  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) {
    col = vec3(1.0);                           // the white gap between chips
  } else {
    col = photo;

    // each chip carries a character that re-rolls on its own clock
    float seed = hash21(cell);
    float tick = floor(uTime * 1.1 + seed * 37.0);
    float idx = floor(hash21(cell + vec2(tick * 1.7, tick * 0.9)) * 64.0);
    idx = mod(idx, 64.0);

    vec2 gxy = vec2(mod(idx, ATLAS_N), floor(idx / ATLAS_N));
    vec2 auv = (gxy + clamp(q, 0.0015, 0.9985)) / ATLAS_N;

    // tiny emboss: a white face with a soft shadow under it, so the
    // character reads on dark chips and only ghosts on pale ones
    vec2 eoff = vec2(0.75 / uCell) / ATLAS_N;
    float aFace = texture2D(uAtlas, auv + eoff).a;
    float aShade = texture2D(uAtlas, auv - eoff).a;

    float dark = 1.0 - dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(0.05), aShade * 0.058 * (0.30 + 0.70 * dark));
    col = mix(col, vec3(1.0), aFace * 0.92);

    // per-chip shimmer
    float flick = 0.955 + 0.09 * hash21(cell + vec2(floor(uTime * 3.0) * 3.1, 0.0));
    col *= flick;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Mosaic {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.u = {};
    this.atlas = null;
    this.cell = 0;
    this.dpr = 1;

    const opts = { alpha: false, antialias: false, depth: false, stencil: false,
                   premultipliedAlpha: false, powerPreference: "high-performance" };
    const gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (!gl) throw new Error("WebGL is not available in this browser.");
    this.gl = gl;

    this.initGeometry();
    this.initProgram();
  }

  initGeometry() {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 3, -1, -1, 3,
    ]), gl.STATIC_DRAW);
    this.buffer = buf;
  }

  compile(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("Shader compile failed:\n" + log);
    }
    return sh;
  }

  initProgram() {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Program link failed:\n" + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = p;
    gl.useProgram(p);

    this.u = {
      scene: gl.getUniformLocation(p, "uScene"),
      blur: gl.getUniformLocation(p, "uBlur"),
      atlas: gl.getUniformLocation(p, "uAtlas"),
      soft: gl.getUniformLocation(p, "uSoft"),
      res: gl.getUniformLocation(p, "uRes"),
      sceneSize: gl.getUniformLocation(p, "uSceneSize"),
      cover: gl.getUniformLocation(p, "uCover"),
      offset: gl.getUniformLocation(p, "uOffset"),
      cell: gl.getUniformLocation(p, "uCell"),
      time: gl.getUniformLocation(p, "uTime"),
      floorY: gl.getUniformLocation(p, "uFloorY"),
      pan: gl.getUniformLocation(p, "uPan"),
      echo: gl.getUniformLocation(p, "uEcho"),
    };

    const pos = gl.getAttribLocation(p, "aPos");
    gl.enableVertexAttribArray(pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  }

  /* --- textures ---------------------------------------------------- */

  makeTexture(filter = this.gl.LINEAR) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  uploadScene(canvas, tex) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (tex.__w !== canvas.width || tex.__h !== canvas.height) {
      tex.__w = canvas.width; tex.__h = canvas.height;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
  }

  uploadAtlas(atlas) {
    const gl = this.gl;
    if (!this.atlasTex) {
      this.atlasTex = this.makeTexture(gl.LINEAR);
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    this.atlas = atlas;
  }

  /* --- frame ------------------------------------------------------- */

  render({ sceneCanvas, blurCanvas, softCanvas, atlas, time, cell, dpr, floorY, pan, echo }) {
    const gl = this.gl;
    const canvas = this.canvas;
    const w = canvas.width, h = canvas.height;

    if (!this.sceneTex) this.sceneTex = this.makeTexture();
    if (!this.blurTex) this.blurTex = this.makeTexture();
    if (!this.softTex) this.softTex = this.makeTexture();

    this.uploadScene(sceneCanvas, this.sceneTex);
    this.uploadScene(blurCanvas, this.blurTex);
    this.uploadScene(softCanvas, this.softTex);
    if (!this.atlas || this.atlas.cell !== atlas.cell) this.uploadAtlas(atlas);

    // cover-fit the scene into the viewport
    const cover = Math.max(w / sceneCanvas.width, h / sceneCanvas.height);
    const offX = (w - sceneCanvas.width * cover) * 0.5;
    const offY = (h - sceneCanvas.height * cover) * 0.5;

    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.u.scene, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTex);
    gl.uniform1i(this.u.blur, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.softTex);
    gl.uniform1i(this.u.soft, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(this.u.atlas, 3);

    gl.uniform2f(this.u.res, w, h);
    gl.uniform2f(this.u.sceneSize, sceneCanvas.width, sceneCanvas.height);
    gl.uniform1f(this.u.cover, cover);
    gl.uniform2f(this.u.offset, offX, offY);
    gl.uniform1f(this.u.cell, cell);
    gl.uniform1f(this.u.time, time);
    gl.uniform1f(this.u.floorY, floorY);
    gl.uniform1f(this.u.pan, pan);
    gl.uniform1f(this.u.echo, echo);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
