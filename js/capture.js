/* ------------------------------------------------------------------
   capture.js — records the animation to a series of frames.

   Loaded on demand (dynamic import) when the page is opened with
   ?export=1.  Each frame is read back off the WebGL canvas, the
   interface is drawn over it, and the result is POSTed to the dev
   server, which writes it to disk.  ffmpeg then turns the frames
   into media/demo.mp4 and media/demo.gif.
   ------------------------------------------------------------------ */

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* a stand-in for the DOM overlay, so the recording shows the whole
   page rather than just the canvas */
function drawOverlay(ctx, w, h) {
  const scale = Math.min(1, w / 1440);
  const font = '"Helvetica Neue", Inter, -apple-system, system-ui, sans-serif';

  /* --- headline --- */
  const size = Math.max(22, Math.min(54, w * 0.0375));
  ctx.save();
  ctx.font = `200 ${size}px ${font}`;
  ctx.fillStyle = "#1f2023";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const headline = "what's on your mind?";
  const track = -size * 0.022;
  let textWidth = 0;
  for (const ch of headline) textWidth += ctx.measureText(ch).width + track;
  const hy = h * 0.395;
  let x = w / 2 - textWidth / 2;
  for (const ch of headline) {
    const cw = ctx.measureText(ch).width;
    ctx.fillText(ch, x + cw / 2, hy);
    x += cw + track;
  }
  ctx.restore();

  /* --- composer --- */
  const cw = Math.min(760 * scale, w * 0.86);
  const ch = Math.max(66, 84 * scale);
  const cx = w / 2 - cw / 2;
  const cy = h * 0.515 - ch / 2;
  const r = 18 * scale;

  ctx.save();

  // glass: a cheap blur of what is underneath, clipped to the panel
  const pad = 40;
  const bx = Math.max(0, cx - pad), by = Math.max(0, cy - pad);
  const bw = Math.min(w - bx, cw + pad * 2), bh = Math.min(h - by, ch + pad * 2);
  const sw = Math.max(2, Math.round(bw / 10));
  const sh = Math.max(2, Math.round(bh / 10));
  const tmp = document.createElement("canvas");
  tmp.width = sw; tmp.height = sh;
  const tc = tmp.getContext("2d");
  tc.imageSmoothingEnabled = true;
  tc.imageSmoothingQuality = "high";
  tc.drawImage(ctx.canvas, bx, by, bw, bh, 0, 0, sw, sh);

  ctx.save();
  roundRect(ctx, cx, cy, cw, ch, r);
  ctx.clip();
  ctx.drawImage(tmp, 0, 0, sw, sh, bx, by, bw, bh);
  ctx.restore();

  // panel
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  roundRect(ctx, cx, cy, cw, ch, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,22,28,0.10)";
  ctx.lineWidth = Math.max(1, scale);
  ctx.stroke();

  // icons
  const padX = 22 * scale;
  const icx = cx + padX + 16 * scale;
  const icy = cy + ch / 2 - 6 * scale;
  ctx.strokeStyle = "#6d7078";
  ctx.lineWidth = 1.4 * scale;
  ctx.beginPath();
  ctx.moveTo(icx - 6 * scale, icy); ctx.lineTo(icx + 6 * scale, icy);
  ctx.moveTo(icx, icy - 6 * scale); ctx.lineTo(icx, icy + 6 * scale);
  ctx.stroke();

  const mx = icx + 42 * scale;
  ctx.beginPath();
  ctx.roundRect?.(mx - 4.6 * scale, icy - 7 * scale, 9.2 * scale, 13 * scale, 4.6 * scale);
  if (!ctx.roundRect) ctx.rect(mx - 4.6 * scale, icy - 7 * scale, 9.2 * scale, 13 * scale);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mx, icy + 2 * scale, 6.4 * scale, 0, Math.PI);
  ctx.stroke();

  // placeholder
  ctx.fillStyle = "#a4a7ae";
  ctx.font = `400 ${16 * scale}px ${font}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Ask anything…", mx + 22 * scale, cy + ch / 2 - 6 * scale);

  // hint
  ctx.fillStyle = "#b0b3ba";
  ctx.font = `400 ${11.5 * scale}px ${font}`;
  const hintX = cx + cw - 34 * scale - 96 * scale;
  ctx.fillText("↵ send · ⇧ newline", hintX, cy + ch / 2 - 6 * scale);

  // send button
  const sr = 19 * scale;
  const sx = cx + cw - 14 * scale - sr;
  const sy = cy + ch / 2 - 12 * scale - sr;
  ctx.fillStyle = "rgba(20,22,28,0.06)";
  roundRect(ctx, sx, sy, sr * 2, sr * 2, 11 * scale);
  ctx.fill();
  ctx.strokeStyle = "#5a5d64";
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(sx + 7 * scale, sy + sr * 1.35);
  ctx.lineTo(sx + sr * 1.35, sy + 7 * scale);
  ctx.moveTo(sx + sr * 1.35, sy + 7 * scale);
  ctx.lineTo(sx + sr * 0.75, sy + 7 * scale);
  ctx.moveTo(sx + sr * 1.35, sy + 7 * scale);
  ctx.lineTo(sx + sr * 1.35, sy + sr * 0.75);
  ctx.stroke();

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */

export async function runCapture({
  scene, mosaic, makeBlur, floorY,
  blurChain, atlas, cell,
  frames = 150, fps = 30, post = "/frame",
}) {
  const w = mosaic.canvas.width;
  const h = mosaic.canvas.height;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");

  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    scene.update(1 / fps, t);
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
      pan: Math.sin(t * 0.12) * 16,
      echo: 0.24,
    });

    const pixels = mosaic.readPixels();
    octx.putImageData(pixels, 0, 0);
    drawOverlay(octx, w, h);

    const blob = await new Promise((res) => out.toBlob(res, "image/jpeg", 0.88));
    await fetch(post, { method: "POST", body: blob });
    if (i % 10 === 0) console.log(`[capture] ${i + 1}/${frames}`);
  }
  console.log(`[capture] done — ${frames} frames`);
}
