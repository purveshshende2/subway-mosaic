/* ------------------------------------------------------------------
   atlas.js — a 8×8 grid of little glyphs, rendered once and used as
   the "chips" of the mosaic.  Drawn large and downsampled with a high
   quality filter so each glyph stays legible once it is squeezed into
   a ten-pixel chip.
   ------------------------------------------------------------------ */

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
export const GLYPH_COUNT = ATLAS_COLS * ATLAS_ROWS;

/* Mixed case + digits + a few marks — the same visual family as the
   reference footage, where every chip carries a stray character.     */
export const GLYPHS =
  "0123456789" +
  "ABCDEFGHIJ" +
  "KLMNOPQRST" +
  "UVWXYZabc" +
  "defghijklm" +
  "nopqrstuvw" +
  "xyz#%&*+=" +
  "<>@$?!.,:;";

const SUPERSAMPLE = 64;

export function buildAtlas(cellPx) {
  const px = Math.max(8, Math.round(cellPx));
  const cols = ATLAS_COLS;
  const rows = ATLAS_ROWS;

  // 1. draw the glyphs big, on transparent
  const big = document.createElement("canvas");
  big.width = cols * SUPERSAMPLE;
  big.height = rows * SUPERSAMPLE;
  const b = big.getContext("2d");
  b.clearRect(0, 0, big.width, big.height);
  b.fillStyle = "#fff";
  b.textAlign = "center";
  b.textBaseline = "middle";
  b.font = `600 ${Math.round(SUPERSAMPLE * 0.68)}px "SF Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace`;

  for (let i = 0; i < GLYPH_COUNT; i++) {
    const ch = GLYPHS[i % GLYPHS.length];
    const cx = (i % cols) * SUPERSAMPLE + SUPERSAMPLE / 2;
    const cy = Math.floor(i / cols) * SUPERSAMPLE + SUPERSAMPLE / 2;
    b.fillText(ch, cx, cy);
  }

  // 2. downsample to the working size (this is what makes the tiny
  //    glyphs read as crisp strokes rather than mush)
  const out = document.createElement("canvas");
  out.width = cols * px;
  out.height = rows * px;
  const o = out.getContext("2d");
  o.clearRect(0, 0, out.width, out.height);
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = "high";
  o.drawImage(big, 0, 0, out.width, out.height);

  return { canvas: out, cell: px, cols, rows, count: GLYPH_COUNT };
}
