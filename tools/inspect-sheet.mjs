/**
 * Prints an occupancy map of a sprite sheet so we can work out its frame grid
 * without guessing: one character per cell, '#' where the cell holds a sprite.
 *
 *   node tools/inspect-sheet.mjs <png> <frameWidth> <frameHeight>
 */
import sharp from 'sharp';

const [file, fwArg, fhArg] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/inspect-sheet.mjs <png> [frameW] [frameH]');
  process.exit(1);
}
const FW = Number(fwArg ?? 80);
const FH = Number(fhArg ?? 64);

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const cols = Math.floor(width / FW);
const rows = Math.floor(height / FH);

console.log(`${file}`);
console.log(`  image ${width}x${height}, frame ${FW}x${FH} => ${cols} cols x ${rows} rows` +
  `${width % FW || height % FH ? '  (WARNING: not an exact division)' : ''}\n`);

const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
for (let y = 0; y < height; y++) {
  const row = Math.floor(y / FH);
  if (row >= rows) continue;
  for (let x = 0; x < width; x++) {
    const col = Math.floor(x / FW);
    if (col >= cols) continue;
    if (data[(y * width + x) * channels + 3] > 8) counts[row][col] += 1;
  }
}

const header = '    ' + Array.from({ length: cols }, (_, i) => String(i % 10)).join('');
console.log(header);
counts.forEach((row, r) => {
  console.log(String(r).padStart(3) + ' ' + row.map((n) => (n > 40 ? '#' : '.')).join(''));
});

console.log('\nframes per row:', counts.map((r) => r.filter((n) => n > 40).length).join(','));
