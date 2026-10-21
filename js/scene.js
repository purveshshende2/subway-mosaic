/* ------------------------------------------------------------------
   scene.js — the "photo" that gets sampled by the mosaic.

   A side-on slice of street level outside a subway entrance:
     · a very light, airy station backdrop (so it stays whisper-quiet
       in the mosaic, exactly like the reference footage)
     · a stairwell with handrails and a SUBWAY sign
     · a continuous stream of pedestrians walking out of the entrance
       and away in both directions
   Everything is drawn into a 2D canvas which the WebGL stage samples.
   ------------------------------------------------------------------ */

import { createPerson, drawPerson, rng } from "./person.js";

const BG = "#f9fafb";

export class Scene {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.groundY = Math.round(height * 0.80);
    this.entranceX = Math.round(width * 0.305);

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.bg = document.createElement("canvas");
    this.bg.width = width;
    this.bg.height = height;
    this.bgCtx = this.bg.getContext("2d", { alpha: false });

    this.people = [];
    this.spawnTimer = 0.2;
    this.rand = rng(0x5eed1a);

    this.layout();
    this.seed();
  }

  /* -------------------------------------------------------------- */

  layout() {
    const { w, h, bgCtx: c } = this;
    const gy = this.groundY;

    c.fillStyle = BG;
    c.fillRect(0, 0, w, h);

    /* --- soft vertical light shafts (the reference's underwater haze) --- */
    c.save();
    c.globalCompositeOperation = "lighter";
    const shafts = [
      [0.08, 0.10, 0.16], [0.22, 0.07, 0.11], [0.37, 0.12, 0.14],
      [0.52, 0.08, 0.12], [0.66, 0.13, 0.15], [0.80, 0.09, 0.12],
      [0.93, 0.11, 0.13],
    ];
    for (const [fx, fw, a] of shafts) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(255,255,255,${a * 0.9})`);
      g.addColorStop(0.55, `rgba(255,255,255,${a * 0.35})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect((fx - fw / 2) * w, 0, fw * w, h);
    }
    c.restore();

    /* --- faint architectural grid --- */
    c.strokeStyle = "rgba(24,28,36,0.012)";
    c.lineWidth = 1;
    for (let x = 0; x <= w; x += 192) {
      c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke();
    }

    /* --- glazed roof: trusses and light beams --- */
    c.strokeStyle = "rgba(24,28,36,0.020)";
    c.lineWidth = 1.6;
    for (let y = h * 0.055; y < h * 0.20; y += h * 0.042) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }
    c.strokeStyle = "rgba(24,28,36,0.013)";
    c.lineWidth = 1.4;
    for (let x = -h; x < w; x += 132) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + h * 0.30, h * 0.20);
      c.stroke();
    }

    /* --- back wall panels --- */
    c.fillStyle = "rgba(255,255,255,0.42)";
    c.fillRect(0, 0, w, gy - h * 0.20);

    c.strokeStyle = "rgba(24,28,36,0.018)";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0, gy - h * 0.20 + 0.5); c.lineTo(w, gy - h * 0.20 + 0.5); c.stroke();

    /* --- a long platform edge / service rail, gives the wall scale --- */
    const railY = gy - h * 0.175;
    c.strokeStyle = "rgba(24,28,36,0.030)";
    c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(0, railY); c.lineTo(w, railY); c.stroke();
    c.lineWidth = 1.4;
    c.strokeStyle = "rgba(24,28,36,0.020)";
    for (let x = 26; x < w; x += 58) {
      c.beginPath(); c.moveTo(x, railY); c.lineTo(x, railY + h * 0.028); c.stroke();
    }

    /* --- columns --- */
    for (const fx of [0.055, 0.46, 0.72, 0.93]) {
      const cw = w * 0.026;
      const x = fx * w - cw / 2;
      const g = c.createLinearGradient(x, 0, x + cw, 0);
      g.addColorStop(0, "rgba(255,255,255,0.34)");
      g.addColorStop(0.5, "rgba(24,28,36,0.016)");
      g.addColorStop(1, "rgba(255,255,255,0.34)");
      c.fillStyle = g;
      c.fillRect(x, h * 0.055, cw, gy - h * 0.055);
    }

    this.drawEntrance(c);

    /* --- ground: a touch cooler below the line --- */
    const fg = c.createLinearGradient(0, gy, 0, h);
    fg.addColorStop(0, "rgba(255,255,255,0.45)");
    fg.addColorStop(1, "rgba(232,236,243,0.40)");
    c.fillStyle = fg;
    c.fillRect(0, gy, w, h - gy);

    /* --- light pool on the pavement in front of the entrance --- */
    const pool = c.createRadialGradient(
      this.entranceX, gy, 0,
      this.entranceX, gy, w * 0.34
    );
    pool.addColorStop(0, "rgba(255,255,255,0.55)");
    pool.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = pool;
    c.fillRect(0, gy, w, h - gy);
  }

  /* --------------------------------------------------------------
     the stairwell: a recessed opening with treads, handrails and
     a sign.  Deliberately very light — it reads as architecture
     without stealing attention from the crowd.
     -------------------------------------------------------------- */
  drawEntrance(c) {
    const w = this.w, h = this.h, gy = this.groundY;
    const cx = this.entranceX;
    const ew = Math.min(w * 0.215, 320);
    const x0 = cx - ew / 2;
    const x1 = cx + ew / 2;
    const top = gy - h * 0.50;
    const archR = ew * 0.20;

    // recess
    c.save();
    c.beginPath();
    c.moveTo(x0, gy);
    c.lineTo(x0, top + archR);
    c.quadraticCurveTo(cx, top - archR * 0.70, x1, top + archR);
    c.lineTo(x1, gy);
    c.closePath();
    c.clip();

    const g = c.createLinearGradient(0, top, 0, gy);
    g.addColorStop(0, "rgba(232,235,242,1)");
    g.addColorStop(0.34, "rgba(240,242,247,1)");
    g.addColorStop(0.72, "rgba(246,248,251,1)");
    g.addColorStop(1, "rgba(251,252,253,1)");
    c.fillStyle = g;
    c.fillRect(x0 - 2, top - 4, ew + 4, gy - top + 8);

    // stair treads
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const y = gy - (gy - top) * 0.60 * t;
      const inset = (ew * 0.5) * (0.26 + 0.60 * t);
      c.strokeStyle = `rgba(24,28,36,${0.052 - i * 0.004})`;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(cx - inset, y);
      c.lineTo(cx + inset, y);
      c.stroke();
    }

    // the bright mouth of the stairwell
    const glow = c.createRadialGradient(cx, gy, 0, cx, gy, ew * 0.55);
    glow.addColorStop(0, "rgba(255,255,255,0.92)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = glow;
    c.fillRect(x0 - 2, gy - ew * 0.5, ew + 4, ew * 0.5);
    c.restore();

    // arch outline
    c.strokeStyle = "rgba(24,28,36,0.055)";
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(x0, gy);
    c.lineTo(x0, top + archR);
    c.quadraticCurveTo(cx, top - archR * 0.70, x1, top + archR);
    c.lineTo(x1, gy);
    c.stroke();

    // handrails
    c.strokeStyle = "rgba(24,28,36,0.115)";
    c.lineWidth = 3;
    c.lineCap = "round";
    for (const s of [-1, 1]) {
      const rx = cx + s * ew * 0.40;
      c.beginPath();
      c.moveTo(rx, gy + h * 0.006);
      c.lineTo(rx, top + h * 0.085);
      c.stroke();
    }
    c.strokeStyle = "rgba(24,28,36,0.08)";
    c.lineWidth = 2.2;
    for (const s of [-1, 1]) {
      const rx = cx + s * ew * 0.40;
      c.beginPath();
      c.moveTo(rx, gy + h * 0.006);
      c.lineTo(rx + s * ew * 0.10, gy + h * 0.006);
      c.stroke();
    }

    // sign above the entrance
    const sw = ew * 0.54, sh = h * 0.046;
    const sy = top - h * 0.115;
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath();
    const rr = sh * 0.42;
    c.moveTo(cx - sw / 2 + rr, sy);
    c.arcTo(cx + sw / 2, sy, cx + sw / 2, sy + sh, rr);
    c.arcTo(cx + sw / 2, sy + sh, cx - sw / 2, sy + sh, rr);
    c.arcTo(cx - sw / 2, sy + sh, cx - sw / 2, sy, rr);
    c.arcTo(cx - sw / 2, sy, cx + sw / 2, sy, rr);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(24,28,36,0.09)";
    c.lineWidth = 1.5;
    c.stroke();

    // the roundel
    const rx0 = cx - sw / 2 + sh * 0.72;
    c.strokeStyle = "rgba(24,28,36,0.13)";
    c.lineWidth = 3.4;
    c.beginPath();
    c.arc(rx0, sy + sh / 2, sh * 0.27, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "rgba(24,28,36,0.15)";
    c.fillRect(rx0 - sh * 0.47, sy + sh / 2 - sh * 0.07, sh * 0.94, sh * 0.14);

    c.fillStyle = "rgba(24,28,36,0.34)";
    c.font = `500 ${Math.round(h * 0.022)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.letterSpacing = "3.5px";
    c.fillText("SUBWAY", cx + sw * 0.14, sy + sh / 2 + 1);
    c.letterSpacing = "0px";
  }

  /* -------------------------------------------------------------- */

  /* Spread the opening frame out so the station never starts empty. */
  seed() {
    const r = this.rand;
    const n = 12;

    // even slots across the pavement, shuffled, so nobody overlaps
    const slots = [];
    for (let i = 0; i < n; i++) slots.push((i + 0.5) / n);
    slots.sort(() => r() - 0.5);

    for (const s of slots) {
      const dir = r() < 0.5 ? -1 : 1;
      this.people.push(
        createPerson(rng((r() * 1e9) | 0), {
          x: s * this.w,
          y: this.groundY,
          dir,
          speed: 0.85 + r() * 0.55,
        })
      );
    }

    // and a few just stepping out of the stairwell
    for (let i = 0; i < 3; i++) {
      const dir = r() < 0.5 ? -1 : 1;
      this.people.push(
        createPerson(rng((r() * 1e9) | 0), {
          x: this.entranceX + dir * (30 + r() * 150),
          y: this.groundY,
          dir,
          speed: 0.85 + r() * 0.55,
        })
      );
    }
  }

  /* -------------------------------------------------------------- */

  update(dt) {
    const { w } = this;
    const gy = this.groundY;
    const r = this.rand;

    // continuous flow out of the stairwell
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.7 + r() * 1.1;
      const dir = r() < 0.5 ? -1 : 1;

      // don't stack people on top of each other
      const gap = 132;
      let clear = true;
      for (const p of this.people) {
        if (p.dir === dir && Math.abs(p.x - this.entranceX) < gap) { clear = false; break; }
      }

      if (clear) {
        const p = createPerson(rng((r() * 1e9) | 0), {
          x: this.entranceX + dir * (r() * 22 - 11),
          y: gy,
          dir,
          speed: 0.85 + r() * 0.55,
        });
        this.people.push(p);
      }
    }

    // advance, front of the queue first, so nobody overtakes anybody
    const halfWidth = w * 0.06;
    const STEP = 46;
    const MIN_GAP = 70;

    for (const dir of [1, -1]) {
      const line = this.people.filter((p) => p.dir === dir);
      // front of the queue first: right-walkers lead with the largest x
      line.sort((a, b) => (dir > 0 ? b.x - a.x : a.x - b.x));
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        p.x += p.dir * p.speed * STEP * dt;
        if (i > 0) {
          const ahead = line[i - 1];
          p.x = dir > 0
            ? Math.min(p.x, ahead.x - MIN_GAP)
            : Math.max(p.x, ahead.x + MIN_GAP);
        }
      }
    }

    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (p.x < -halfWidth || p.x > w + halfWidth) this.people.splice(i, 1);
    }
  }

  draw(t) {
    const c = this.ctx;
    c.drawImage(this.bg, 0, 0);
    for (const p of this.people) drawPerson(c, p, t);
  }
}
