/**
 * Builds a contact sheet: the first N frames of every row, upscaled, so we can
 * eyeball which row is which direction and animation.
 *
 *   node tools/montage-rows.mjs <png> <out> [frameW] [frameH] [framesPerRow] [scale]
 */
import sharp from 'sharp';

const [file, out, fwArg, fhArg, nArg, scaleArg] = process.argv.slice(2);
const FW = Number(fwArg ?? 80);
const FH = Number(fhArg ?? 64);
const N = Number(nArg ?? 3);
const SCALE = Number(scaleArg ?? 2);

const meta = await sharp(file).metadata();
const cols = Math.floor(meta.width / FW);
const rows = Math.floor(meta.height / FH);
const take = Math.min(N, cols);

const composites = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < take; c++) {
    const frame = await sharp(file)
      .extract({ left: c * FW, top: r * FH, width: FW, height: FH })
      .resize(FW * SCALE, FH * SCALE, { kernel: 'nearest' })
      .toBuffer();
    composites.push({ input: frame, left: c * FW * SCALE, top: r * FH * SCALE });
  }
}

await sharp({
  create: {
    width: take * FW * SCALE,
    height: rows * FH * SCALE,
    channels: 4,
    background: { r: 24, g: 22, b: 16, alpha: 1 },
  },
})
  .composite(composites)
  .png()
  .toFile(out);

console.log(`wrote ${out} (${take * FW * SCALE}x${rows * FH * SCALE}) — ${rows} rows, first ${take} frames each`);
