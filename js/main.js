/* ------------------------------------------------------------------
   main.js — wires the scene, the mosaic and the chrome together.
   ------------------------------------------------------------------ */

import { Scene } from "./scene.js";
import { Mosaic } from "./mosaic.js";
import { buildAtlas } from "./atlas.js";

const canvas = document.getElementById("stage");
const input = document.getElementById("ask");
const form = document.querySelector(".composer");
const pill = document.querySelector(".pill");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let mosaic, scene, atlas;
let blurChain = [];
let cell = 0;
let last = performance.now();
let time = 0;
let fps = 60;
let frames = 0;
let fpsClock = performance.now();
let cpu = 0;
let cpuWindow = 0;
const DEBUG = location.search.includes("debug");
const PERF = location.search.includes("perf");

/* ------------------------------------------------------------------ */

function sceneSizeFor(w, h) {
  const maxW = 1600, maxH = 1000;
  const s = Math.min(1, maxW / w, maxH / h);
  return {
    w: Math.max(640, Math.round(w * s)),
    h: Math.max(420, Math.round(h * s)),
  };
}

function build() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  const size = sceneSizeFor(w, h);
  scene = new Scene(size.w, size.h);

  // blur chain: scene -> 1/2 -> 1/4 (reflection) and -> 1/8 (the ghost)
  blurChain = [];
  for (const f of [2, 4, 8]) {
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(size.w / f));
    c.height = Math.max(2, Math.round(size.h / f));
    blurChain.push({ canvas: c, ctx: c.getContext("2d", { alpha: false }) });
  }

  // chip size: ten CSS pixels, like the reference footage
  const chip = Math.max(7, Math.min(14, Math.round(w / 118)));
  cell = Math.round(chip * dpr);
  atlas = buildAtlas(cell);
}

/* Cheap, wide blur.  Each halving of the image is a box filter, so
   the chain gives a smooth Gaussian-ish falloff for a fraction of the
   cost of a real convolution — and it uploads as a tiny texture.     */
function makeBlur() {
  const [a, b, c] = blurChain;
  for (const s of blurChain) {
    s.ctx.imageSmoothingEnabled = true;
    s.ctx.imageSmoothingQuality = "medium";
  }
  a.ctx.drawImage(scene.canvas, 0, 0, a.canvas.width, a.canvas.height);
  b.ctx.drawImage(a.canvas, 0, 0, b.canvas.width, b.canvas.height);
  c.ctx.drawImage(b.canvas, 0, 0, c.canvas.width, c.canvas.height);
}

/* ------------------------------------------------------------------ */

let debugEl = null;
function debugOverlay() {
  if (debugEl) return debugEl;
  debugEl = document.createElement("canvas");
  debugEl.id = "debug";
  debugEl.style.cssText = "position:fixed;inset:0;z-index:9;width:100%;height:100%;";
  document.body.appendChild(debugEl);
  return debugEl;
}

/* the pavement line, in device pixels from the top of the viewport */
function floorY() {
  const cover = Math.max(canvas.width / scene.canvas.width, canvas.height / scene.canvas.height);
  const offY = (canvas.height - scene.canvas.height * cover) * 0.5;
  return offY + scene.groundY * cover;
}

function draw(t) {
  scene.update(1 / 60, t);
  scene.draw(t);
  makeBlur();

  mosaic.render({
    sceneCanvas: scene.canvas,
    blurCanvas: blurChain[1].canvas,
    softCanvas: blurChain[2].canvas,
    atlas,
    time: t,
    cell,
    floorY: floorY(),
    pan: reduceMotion ? 0 : Math.sin(t * 0.12) * 16,
    echo: reduceMotion ? 0.12 : 0.24,
  });
}

function frame(now) {
  const t0 = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  frames++;
  if (now - fpsClock > 500) {
    fps = (frames * 1000) / (now - fpsClock);
    frames = 0;
    fpsClock = now;
  }

  scene.update(dt, time);
  scene.draw(time);
  makeBlur();

  if (DEBUG) {
    const d = debugOverlay();
    if (d.width !== scene.canvas.width || d.height !== scene.canvas.height) {
      d.width = scene.canvas.width; d.height = scene.canvas.height;
    }
    const dc = d.getContext("2d");
    dc.drawImage(scene.canvas, 0, 0);
    dc.strokeStyle = "rgba(255,0,0,0.8)";
    dc.lineWidth = 2;
    dc.beginPath();
    dc.moveTo(0, scene.groundY); dc.lineTo(scene.canvas.width, scene.groundY);
    dc.stroke();
    dc.fillStyle = "#c00";
    dc.font = "600 22px monospace";
    dc.fillText(`${fps.toFixed(0)} fps  ·  ${scene.people.length} people`, 16, 34);
  }

  mosaic.render({
    sceneCanvas: scene.canvas,
    blurCanvas: blurChain[1].canvas,
    softCanvas: blurChain[2].canvas,
    atlas,
    time,
    cell,
    floorY: floorY(),
    pan: reduceMotion ? 0 : Math.sin(time * 0.12) * 16,
    echo: reduceMotion ? 0.12 : 0.24,
  });
  cpu += performance.now() - t0;
  cpuWindow += dt;
  if (cpuWindow > 2) {
    if (PERF) {
      const avg = cpu / Math.max(1, Math.round(cpuWindow / (1 / 60)));
      const line =
        `fps=${fps.toFixed(1)} cpu/frame=${avg.toFixed(2)}ms ` +
        `people=${scene.people.length} scene=${scene.canvas.width}x${scene.canvas.height}`;
      console.log(`[perf] ${line}`);
      // post it to the dev server so the numbers can be read from a shell
      try {
        fetch("/stats", { method: "POST", body: line, keepalive: true });
      } catch (e) { /* the static server has no /stats */ }
    }
    cpu = 0;
    cpuWindow = 0;
  }

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */

function start() {
  try {
    mosaic = new Mosaic(canvas);
  } catch (err) {
    console.error(err);
    document.body.classList.add("no-webgl");
    return;
  }
  build();

  // recording mode: a deterministic, frame-by-stepped run that posts
  // each frame to the dev server.  See js/capture.js.
  if (location.search.includes("export")) {
    import("./capture.js")
      .then(({ runCapture }) =>
        runCapture({
          scene,
          mosaic,
          makeBlur,
          floorY,
          blurChain,
          atlas,
          cell,
          frames: 150,
          fps: 30,
        })
      )
      .catch((err) => console.error("[capture]", err));
    return;
  }

  requestAnimationFrame((t) => { last = t; frame(t); });
}
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!mosaic) return;
    const prevScene = scene;
    build();
    // keep the crowd alive across a resize
    if (prevScene) {
      scene.people = prevScene.people.filter((p) => p.x > -200 && p.x < scene.w + 200);
      for (const p of scene.people) p.y = scene.groundY;
    }
  }, 180);
});

/* tiny bit of chrome behaviour ------------------------------------- */

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  input?.blur();
});

pill?.addEventListener("click", () => {
  const open = pill.getAttribute("aria-expanded") === "true";
  pill.setAttribute("aria-expanded", String(!open));
});

start();
