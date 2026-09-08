/**
 * Reports the tight (non-transparent) bounding box of a single frame, so we can
 * see how big the artwork actually is inside its padded frame.
 *
 *   node tools/bbox.mjs <png> <frameW> <frameH> <col> <row>
 */
import sharp from 'sharp';

const [file, fwArg, fhArg, colArg, rowArg] = process.argv.slice(2);
const FW = Number(fwArg ?? 80);
const FH = Number(fhArg ?? 64);
const col = Number(colArg ?? 0);
const row = Number(rowArg ?? 0);

const { data, info } = await sharp(file)
  .extract({ left: col * FW, top: row * FH, width: FW, height: FH })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX < 0) {
  console.log(`${file} [${col},${row}] EMPTY`);
} else {
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  console.log(
    `${file.split('/').pop()} [col ${col}, row ${row}]  content ${w}x${h}` +
    `  at x${minX}..${maxX} y${minY}..${maxY}  (frame ${FW}x${FH})` +
    `  => ${(w / 16).toFixed(1)} x ${(h / 16).toFixed(1)} tiles at 16px`,
  );
}
