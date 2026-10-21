/* ------------------------------------------------------------------
   person.js — stylised side-view pedestrians.

   Every pedestrian is drawn from scratch: no sprites, no assets.
   A walker is described by a small record (body proportions + a
   colour story) and is re-drawn each frame with a phase-driven
   walk cycle, so the crowd never repeats exactly.
   ------------------------------------------------------------------ */

const SKIN = [
  "#f2cda8", "#e5b28c", "#cf9468", "#b0764b", "#8d5734", "#6b3f24",
  "#f7dcc0", "#d79a72",
];

const HAIR = [
  "#211c1a", "#3a2a20", "#55392a", "#7b5636", "#a2814f",
  "#c9b795", "#1b1a19", "#4c4c50", "#8c8c92",
];

const TOPS = [
  "#3f5878", "#6d5c4b", "#37452f", "#6b3f42", "#262a30", "#8a7d67",
  "#3c6b60", "#6d4a72", "#9c5c3f", "#22405e", "#565f43", "#8f4b52",
  "#2f5a6b", "#b08a5c", "#4a3f63", "#7d8b93",
];

const BOTTOMS = [
  "#232830", "#414750", "#5f574c", "#31373f", "#6f6759",
  "#28323d", "#474037", "#2b2b2b", "#7b7f88",
];

const SHOES = ["#1b1b1e", "#2a2320", "#3b3b41", "#6b5a45", "#e8e6e1"];

const HAIR_STYLES = ["short", "short", "short", "crop", "bun", "long", "bob", "bald"];
const ACCESSORIES = ["none", "none", "backpack", "tote", "briefcase", "cup", "phone", "headphones"];
const HATS = ["none", "none", "none", "none", "cap", "beanie", "brim"];

/* deterministic-ish helpers ---------------------------------------- */

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

/* ------------------------------------------------------------------
   create a pedestrian record
   ------------------------------------------------------------------ */

export function createPerson(r, opts = {}) {
  return {
    // position / motion
    x: opts.x ?? 0,
    y: opts.y ?? 0,          // feet
    dir: opts.dir ?? (r() < 0.5 ? -1 : 1),
    speed: opts.speed ?? (0.9 + r() * 0.55),   // px per second-ish

    // walk cycle
    phase: r() * Math.PI * 2,

    // colour story
    skin: pick(r, SKIN),
    hair: pick(r, HAIR),
    hairStyle: pick(r, HAIR_STYLES),
    top: pick(r, TOPS),
    bottom: pick(r, BOTTOMS),
    shoe: pick(r, SHOES),
    accessory: pick(r, ACCESSORIES),
    hat: pick(r, HATS),

    // silhouette tweaks
    bulk: 0.86 + r() * 0.3,
  };
}

/* ------------------------------------------------------------------
   drawing
   ------------------------------------------------------------------ */

function taperedLimb(ctx, x1, y1, x2, y2, w1, w2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1 * 0.5, y1 + ny * w1 * 0.5);
  ctx.lineTo(x2 + nx * w2 * 0.5, y2 + ny * w2 * 0.5);
  ctx.arc(x2, y2, w2 * 0.5, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
  ctx.lineTo(x1 - nx * w1 * 0.5, y1 - ny * w1 * 0.5);
  ctx.arc(x1, y1, w1 * 0.5, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* Draw one pedestrian.

   p.x / p.y  – ground point (feet)
   dir        – +1 facing right, -1 facing left
   t          – seconds (global clock)                                    */
export function drawPerson(ctx, p, t) {
  // everyone is the same height — only their build (width) varies, so
  // the crowd reads as one horizon
  const H = 252;
  const bulk = p.bulk;

  const ph = p.phase + t * p.speed * 4.1;
  const sw = Math.sin(ph);
  const sw2 = Math.sin(ph + Math.PI);
  const bob = Math.abs(Math.cos(ph)) * H * 0.013;
  const lean = 0.030 + p.speed * 0.012;

  // proportions (fractions of H, y grows downward)
  const hipY = -0.470 * H;
  const shoulderY = -0.795 * H;
  const headY = -0.893 * H;
  const headR = 0.0705 * H;

  const thighLen = 0.235 * H;
  const shinLen = 0.215 * H;
  const upperArm = 0.185 * H;
  const foreArm = 0.175 * H;

  const hipX = 0;
  const shoulderX = lean * H;

  ctx.save();
  ctx.translate(p.x, p.y - bob);
  ctx.scale(p.dir, 1);

  /* ---- ground shadow ---- */
  ctx.save();
  ctx.fillStyle = "rgba(30,34,42,0.10)";
  ctx.beginPath();
  ctx.ellipse(0, 1.5, H * 0.115, H * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ---- legs ---- */
  const legAngles = [sw * 0.58, sw2 * 0.58];
  const knees = [];
  const ankles = [];
  for (let i = 0; i < 2; i++) {
    const th = legAngles[i];
    const kn = th * 0.42 - 0.30 + Math.max(0, -th) * 0.55;
    const kx = hipX + Math.sin(th) * thighLen;
    const ky = hipY + Math.cos(th) * thighLen;
    const ax = kx + Math.sin(th + kn) * shinLen;
    const ay = ky + Math.cos(th + kn) * shinLen;
    knees.push([kx, ky]);
    ankles.push([ax, ay]);
  }

  // back leg (darker)
  ctx.globalAlpha = 0.82;
  taperedLimb(ctx, hipX, hipY, knees[1][0], knees[1][1], H * 0.072 * bulk, H * 0.055 * bulk, shade(p.bottom, 0.78));
  taperedLimb(ctx, knees[1][0], knees[1][1], ankles[1][0], ankles[1][1], H * 0.055 * bulk, H * 0.040 * bulk, shade(p.bottom, 0.78));
  ctx.globalAlpha = 1;

  /* ---- back arm ---- */
  const armAngles = [-sw * 0.52, -sw2 * 0.52];
  const elbows = [];
  const hands = [];
  for (let i = 0; i < 2; i++) {
    const a = armAngles[i];
    const el = a * 0.62 + 0.10;
    const ex = shoulderX + Math.sin(a) * upperArm;
    const ey = shoulderY + Math.cos(a) * upperArm;
    const hx = ex + Math.sin(a + el) * foreArm;
    const hy = ey + Math.cos(a + el) * foreArm;
    elbows.push([ex, ey]);
    hands.push([hx, hy]);
  }

  ctx.globalAlpha = 0.84;
  taperedLimb(ctx, shoulderX - H * 0.012, shoulderY, elbows[0][0], elbows[0][1], H * 0.050 * bulk, H * 0.040 * bulk, shade(p.top, 0.78));
  taperedLimb(ctx, elbows[0][0], elbows[0][1], hands[0][0], hands[0][1], H * 0.040 * bulk, H * 0.031 * bulk, shade(p.skin, 0.80));
  ctx.fillStyle = shade(p.skin, 0.8);
  ctx.beginPath();
  ctx.arc(hands[0][0], hands[0][1], H * 0.019, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  /* ---- torso ---- */
  const shoulderHalf = H * 0.122 * bulk;
  const hipHalf = H * 0.090 * bulk;
  const waistY = (shoulderY + hipY) * 0.5 + H * 0.022;

  ctx.fillStyle = p.top;
  ctx.beginPath();
  ctx.moveTo(shoulderX - shoulderHalf, shoulderY);
  ctx.quadraticCurveTo(shoulderX - shoulderHalf * 1.06, waistY, hipX - hipHalf, hipY + H * 0.012);
  ctx.quadraticCurveTo(hipX, hipY + H * 0.030, hipX + hipHalf, hipY + H * 0.012);
  ctx.quadraticCurveTo(shoulderX + shoulderHalf * 1.06, waistY, shoulderX + shoulderHalf, shoulderY);
  ctx.quadraticCurveTo(shoulderX, shoulderY - H * 0.030, shoulderX - shoulderHalf, shoulderY);
  ctx.closePath();
  ctx.fill();

  // collar hint
  ctx.strokeStyle = shade(p.top, 0.82);
  ctx.lineWidth = H * 0.012;
  ctx.beginPath();
  ctx.moveTo(shoulderX - shoulderHalf * 0.40, shoulderY + H * 0.004);
  ctx.quadraticCurveTo(shoulderX, shoulderY + H * 0.030, shoulderX + shoulderHalf * 0.40, shoulderY + H * 0.004);
  ctx.stroke();

  /* ---- front leg ---- */
  taperedLimb(ctx, hipX, hipY, knees[0][0], knees[0][1], H * 0.075 * bulk, H * 0.057 * bulk, p.bottom);
  taperedLimb(ctx, knees[0][0], knees[0][1], ankles[0][0], ankles[0][1], H * 0.057 * bulk, H * 0.042 * bulk, p.bottom);

  // shoes
  ctx.fillStyle = p.shoe;
  for (let i = 0; i < 2; i++) {
    const [ax, ay] = ankles[i];
    ctx.beginPath();
    ctx.ellipse(ax + H * 0.010, ay + H * 0.005, H * 0.030, H * 0.013, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---- accessories that hang off the body ---- */
  drawAccessoryBack(ctx, p, H, shoulderX, shoulderY);

  /* ---- front arm ---- */
  taperedLimb(ctx, shoulderX + H * 0.012, shoulderY, elbows[1][0], elbows[1][1], H * 0.052 * bulk, H * 0.042 * bulk, p.top);
  taperedLimb(ctx, elbows[1][0], elbows[1][1], hands[1][0], hands[1][1], H * 0.042 * bulk, H * 0.033 * bulk, p.skin);
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(hands[1][0], hands[1][1], H * 0.020, 0, Math.PI * 2);
  ctx.fill();

  drawAccessoryFront(ctx, p, H, hands[1], hands[0]);

  /* ---- head ---- */
  const hx = shoulderX + H * 0.012;
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(hx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // neck
  ctx.fillStyle = shade(p.skin, 0.9);
  ctx.fillRect(hx - H * 0.012, headY + headR * 0.45, H * 0.024, H * 0.045);

  drawHair(ctx, p, H, hx, headY, headR);
  drawHat(ctx, p, H, hx, headY, headR);

  ctx.restore();
}

/* ------------------------------------------------------------------ */

function drawHair(ctx, p, H, hx, hy, r) {
  const style = p.hairStyle;

  if (style === "bald") {
    ctx.fillStyle = p.hair;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.98, Math.PI * 1.08, Math.PI * 1.92);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  ctx.fillStyle = p.hair;

  if (style === "bun") {
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx - r * 0.85, hy - r * 0.75, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (style === "long") {
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.06, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx - r * 1.0, hy - r * 0.2);
    ctx.quadraticCurveTo(hx - r * 1.35, hy + r * 1.6, hx - r * 0.55, hy + r * 1.75);
    ctx.lineTo(hx - r * 0.1, hy + r * 0.4);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (style === "bob") {
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.04, Math.PI * 0.92, Math.PI * 2.08);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, hx - r * 1.06, hy - r * 0.2, r * 2.12, r * 1.25, r * 0.5);
    ctx.fill();
    return;
  }

  // short / crop
  ctx.beginPath();
  ctx.arc(hx, hy - r * 0.10, r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fill();
  if (style === "crop") {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.22, r * 0.82, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawHat(ctx, p, H, hx, hy, r) {
  if (!p.hat || p.hat === "none") return;

  if (p.hat === "beanie") {
    ctx.fillStyle = shade(p.top, 1.08);
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.10, r * 1.04, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(p.top, 0.86);
    ctx.beginPath();
    ctx.ellipse(hx, hy - r * 0.42, r * 1.02, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // cap / brim
  ctx.fillStyle = shade(p.top, 0.92);
  ctx.beginPath();
  ctx.arc(hx, hy - r * 0.10, r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(p.top, 0.78);
  ctx.beginPath();
  ctx.ellipse(hx + r * 0.72, hy - r * 0.22, r * 0.86, r * 0.17, -0.10, 0, Math.PI * 2);
  ctx.fill();
}

function drawAccessoryBack(ctx, p, H, shoulderX, shoulderY) {
  if (p.accessory === "backpack") {
    ctx.fillStyle = shade(p.top, 0.7);
    roundRect(ctx, shoulderX - H * 0.145, shoulderY + H * 0.010, H * 0.105, H * 0.150, H * 0.030);
    ctx.fill();
    ctx.strokeStyle = shade(p.top, 0.55);
    ctx.lineWidth = H * 0.008;
    ctx.beginPath();
    ctx.moveTo(shoulderX - H * 0.095, shoulderY + H * 0.070);
    ctx.lineTo(shoulderX - H * 0.045, shoulderY + H * 0.070);
    ctx.stroke();
  } else if (p.accessory === "headphones") {
    ctx.strokeStyle = "#2b2d31";
    ctx.lineWidth = H * 0.016;
    ctx.beginPath();
    ctx.arc(shoulderX + H * 0.012, shoulderY - H * 0.098, H * 0.082, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.fillStyle = "#2b2d31";
    ctx.beginPath();
    ctx.ellipse(shoulderX + H * 0.012 - H * 0.070, shoulderY - H * 0.093, H * 0.017, H * 0.024, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(shoulderX + H * 0.012 + H * 0.070, shoulderY - H * 0.093, H * 0.017, H * 0.024, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAccessoryFront(ctx, p, H, frontHand, backHand) {
  const [hx, hy] = frontHand;
  const [bx, by] = backHand;

  switch (p.accessory) {
    case "tote": {
      ctx.fillStyle = "#c9bda6";
      roundRect(ctx, bx - H * 0.030, by - H * 0.005, H * 0.062, H * 0.078, H * 0.010);
      ctx.fill();
      ctx.strokeStyle = "#b3a68d";
      ctx.lineWidth = H * 0.007;
      ctx.beginPath();
      ctx.moveTo(bx - H * 0.018, by - H * 0.004);
      ctx.quadraticCurveTo(bx, by - H * 0.040, bx + H * 0.018, by - H * 0.004);
      ctx.stroke();
      break;
    }
    case "briefcase": {
      ctx.fillStyle = "#43362b";
      roundRect(ctx, hx - H * 0.052, hy - H * 0.012, H * 0.085, H * 0.062, H * 0.008);
      ctx.fill();
      ctx.strokeStyle = "#2e241c";
      ctx.lineWidth = H * 0.006;
      ctx.beginPath();
      ctx.moveTo(hx - H * 0.020, hy - H * 0.012);
      ctx.quadraticCurveTo(hx - H * 0.012, hy - H * 0.032, hx + H * 0.000, hy - H * 0.012);
      ctx.stroke();
      break;
    }
    case "cup": {
      ctx.fillStyle = "#f2f0ec";
      roundRect(ctx, hx - H * 0.014, hy - H * 0.036, H * 0.030, H * 0.042, H * 0.005);
      ctx.fill();
      ctx.fillStyle = "#6b4a35";
      ctx.fillRect(hx - H * 0.014, hy - H * 0.040, H * 0.030, H * 0.007);
      break;
    }
    case "phone": {
      ctx.fillStyle = "#1e2024";
      roundRect(ctx, hx - H * 0.011, hy - H * 0.040, H * 0.023, H * 0.044, H * 0.005);
      ctx.fill();
      ctx.fillStyle = "rgba(190,205,225,0.85)";
      ctx.fillRect(hx - H * 0.007, hy - H * 0.035, H * 0.015, H * 0.032);
      break;
    }
  }
}

/* colour utility ---------------------------------------------------- */

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
