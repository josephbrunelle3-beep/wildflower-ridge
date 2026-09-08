/**
 * Attempts to generate the diagonal horse angles onfe's pack does not ship.
 *
 * Adapted from the icon-lab generator in JoebeesGardenPlanner: same gpt-image-1
 * images/edits call with a style anchor, same idea of a frozen style block so only the
 * subject changes. The anchor here is a real frame of onfe's horse, upscaled, which is
 * the only way the output stands a chance of matching the pack's line and palette.
 *
 * Two post-processing steps do the heavy lifting, because raw model output is never
 * pixel art: the image is downscaled with nearest-neighbour to the sheet's frame size,
 * and every pixel is then snapped to the nearest colour in onfe's own palette, sampled
 * from the anchor. That forces the result into the pack's exact colours instead of the
 * thousands of near-misses the model returns.
 *
 * Needs OPENAI_API_KEY in the environment. Costs real credits per image.
 *
 *   node tools/gen-diagonals.mjs --dry-run     # build and save the anchors only, no API
 *   node tools/gen-diagonals.mjs               # generate all four diagonals
 *   node tools/gen-diagonals.mjs --only down-right
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHEET = 'public/assets/sprites/horse-tacked.png';
const OUT_DIR = 'assets/generated';
const FW = 80;
const FH = 64;
const COLS = 9;
const ANCHOR_PX = 1024;

/** Row of each source facing in the gait sheet (idle rows). */
const ROW = { right: 0, left: 5, down: 10, up: 14 };

/**
 * Each diagonal is generated from the side view it is closest to, so the model has the
 * right body, tack and colouring in front of it and only has to swing the camera.
 */
const TARGETS = [
  { key: 'down-right', from: 'right', view: 'from behind and to the side, walking away from the viewer down and to the right, so the camera sees its hindquarters and the far side of its head' },
  { key: 'down-left', from: 'left', view: 'from behind and to the side, walking away from the viewer down and to the left, so the camera sees its hindquarters and the far side of its head' },
  { key: 'up-right', from: 'right', view: 'from in front and to the side, walking toward the viewer up and to the right, so the camera sees its chest and shoulder' },
  { key: 'up-left', from: 'left', view: 'from in front and to the side, walking toward the viewer up and to the left, so the camera sees its chest and shoulder' },
];

const STYLE_BLOCK =
  'Match the attached reference image exactly as the authoritative art style: identical pixel resolution and pixel-cluster size, identical colour palette, identical outline weight and colour, identical shading steps, identical level of detail. It is the same individual horse with the same brown coat, the same saddle and bridle. Chunky readable pixels, hard crisp edges, no anti-aliasing, no smooth gradients, no blur. Single horse centred in frame, full body, hooves included, no rider, no ground, no shadow, no scenery, no background, no frame, no text. The background must be fully transparent (alpha 0) outside the horse.';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

mkdirSync(OUT_DIR, { recursive: true });

/** Sample the distinct opaque colours of a frame: onfe's palette for this horse. */
async function paletteOf(buf, w, h) {
  const { data } = await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).raw().toBuffer({ resolveWithObject: true });
  const seen = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.keys()].map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
}

/** Snap every pixel to the nearest palette entry, which is what makes it read as pixel art. */
function quantise(data, palette) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) { data[i + 3] = 0; continue; }
    data[i + 3] = 255;
    let best = palette[0];
    let bestD = Infinity;
    for (const p of palette) {
      const d = (data[i] - p[0]) ** 2 + (data[i + 1] - p[1]) ** 2 + (data[i + 2] - p[2]) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    data[i] = best[0]; data[i + 1] = best[1]; data[i + 2] = best[2];
  }
  return data;
}

async function generate(target) {
  const col = 0;
  const row = ROW[target.from];
  const anchorRaw = await sharp(SHEET)
    .extract({ left: col * FW, top: row * FH, width: FW, height: FH })
    .ensureAlpha()
    .raw().toBuffer();
  const palette = await paletteOf(anchorRaw, FW, FH);

  const anchorPng = await sharp(anchorRaw, { raw: { width: FW, height: FH, channels: 4 } })
    .resize(ANCHOR_PX, ANCHOR_PX, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  writeFileSync(`${OUT_DIR}/anchor-${target.key}.png`, anchorPng);

  if (dryRun) {
    console.log(`[dry-run] ${target.key}: anchor from ${target.from} row ${row}, ${palette.length} palette colours`);
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const prompt = `A pixel-art sprite of the same horse as the reference, seen ${target.view}. ${STYLE_BLOCK}`;
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', 'high');
  form.append('background', 'transparent');
  form.append('image', new Blob([anchorPng], { type: 'image/png' }), 'anchor.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned');

  const raw = Buffer.from(b64, 'base64');
  writeFileSync(`${OUT_DIR}/raw-${target.key}.png`, raw);

  // Down to sprite size, then forced into onfe's palette.
  const small = await sharp(raw).trim({ threshold: 1 }).resize(FW, FH, {
    kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).ensureAlpha().raw().toBuffer();
  const snapped = quantise(Buffer.from(small), palette);
  await sharp(snapped, { raw: { width: FW, height: FH, channels: 4 } })
    .png().toFile(`${OUT_DIR}/sprite-${target.key}.png`);

  console.log(`${target.key}: wrote raw-${target.key}.png and sprite-${target.key}.png`);
}

for (const t of TARGETS) {
  if (only && t.key !== only) continue;
  await generate(t);
}
console.log(dryRun ? 'Dry run complete; anchors are in ' + OUT_DIR : 'Done. Review ' + OUT_DIR + ' before wiring anything in.');
