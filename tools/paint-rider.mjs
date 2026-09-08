/**
 * Dresses onfe's rider.
 *
 * The pack ships the ridden horse with the rider drawn as an unclothed base, meant to be
 * painted over. Rather than draw a rider from scratch - which would never match the horse's
 * line or bob correctly with each gait - we recolour that base in place.
 *
 * The rider is isolated exactly by diffing the ridden sheet against the riderless sheet of
 * the same horse: the horse pixels are byte-identical between them, so whatever differs is
 * rider (and reins). Within that mask we remap only the skin tones, banded by height into
 * head / torso / legs, which turns the base into shirt, jeans and boots while leaving the
 * face, hair and reins alone.
 *
 *   node tools/paint-rider.mjs [--preview]
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const RIDING = 'assets/raw/Full_Pack/Horse_Sprite_Riding_Asset/Horses_saddeled/Horse_fullcolor_brown_brownsaddled_riding.png';
const ALONE = 'assets/raw/Full_Pack/Horse_Sprite_Asset/Horses_equipped_smallsaddle/Horse_fullcolor_brown_brownsaddled_smallsaddle.png';
const OUT = 'public/assets/sprites/horse-ridden.png';

const FW = 80;
const FH = 64;

/** The rider base's skin ramp, lightest to darkest. */
const SKIN = ['ffd6c2', 'e2a182', 'c16e47'];
/** Doubles as skin outline and hair; only remapped where it outlines clothing. */
const OUTLINE = '983e13';

const CLOTH = {
  shirt: ['d76a52', 'c4553f', '9e4030'],
  shirtOutline: '7a3124',
  jeans: ['5d84bd', '4a6fa5', '38548a'],
  jeansOutline: '2b4370',
  boots: ['5a3a22', '4a2e1a', '3a2414'],
  bootsOutline: '2a1a0f',
  hat: '7d4f2a',
  hatDark: '5e3a1e',
  hatLight: '9a6234',
};

const hex = (r, g, b) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

const sheets = await Promise.all([
  sharp(RIDING).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(ALONE).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
]);
const [ride, alone] = sheets;
const W = ride.info.width;
const H = ride.info.height;
const cols = Math.floor(W / FW);
const rows = Math.floor(H / FH);
const aloneCols = Math.floor(alone.info.width / FW);

const out = Buffer.from(ride.data); // start from the ridden sheet, then repaint the rider

const at = (buf, info, x, y) => (y * info.width + x) * 4;

let painted = 0;
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    // Frames past the riderless sheet's width have no counterpart to diff against.
    if (col >= aloneCols) continue;

    // Pass 1: find the rider mask and its vertical extent.
    const mask = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const px = col * FW + x;
        const py = row * FH + y;
        const i = at(ride.data, ride.info, px, py);
        const j = at(alone.data, alone.info, px, py);
        const aOn = ride.data[i + 3] > 0;
        const bOn = alone.data[j + 3] > 0;
        const differs = aOn && bOn && (ride.data[i] !== alone.data[j] || ride.data[i + 1] !== alone.data[j + 1] || ride.data[i + 2] !== alone.data[j + 2]);
        if (!(aOn && !bOn) && !differs) continue;
        mask.push([x, y, i]);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!mask.length) continue;

    // Bands as fractions of the rider's height, so they hold across every pose.
    const h = maxY - minY + 1;
    const headEnd = minY + Math.round(h * 0.30);
    const torsoEnd = minY + Math.round(h * 0.62);
    const bootTop = minY + Math.round(h * 0.88);

    // Pass 2: repaint skin, band by band. Hair, face and reins are left as drawn.
    for (const [, y, i] of mask) {
      const h6 = hex(out[i], out[i + 1], out[i + 2]);
      const skinIdx = SKIN.indexOf(h6);
      const isOutline = h6 === OUTLINE;
      if (skinIdx < 0 && !isOutline) continue; // reins, eyes, anything else: leave alone
      if (y < headEnd) continue; // face and hair stay as they are

      let target;
      if (y < torsoEnd) target = isOutline ? CLOTH.shirtOutline : CLOTH.shirt[skinIdx];
      else if (y < bootTop) target = isOutline ? CLOTH.jeansOutline : CLOTH.jeans[skinIdx];
      else target = isOutline ? CLOTH.bootsOutline : CLOTH.boots[skinIdx];

      const [r, g, b] = rgb(target);
      out[i] = r; out[i + 1] = g; out[i + 2] = b;
      painted++;
    }

    // Pass 3: a hat. The brim sits on the hairline and the crown above it, drawn across
    // the head's own width so it fits whichever way the rider is facing.
    let hxMin = Infinity;
    let hxMax = -Infinity;
    for (const [x, y] of mask) {
      if (y >= minY && y < headEnd) { if (x < hxMin) hxMin = x; if (x > hxMax) hxMax = x; }
    }
    if (hxMin <= hxMax) {
      const brimY = minY + 1;
      const put = (x, y, colour) => {
        if (x < 0 || x >= FW || y < 0 || y >= FH) return;
        const i = at(ride.data, ride.info, col * FW + x, row * FH + y);
        const [r, g, b] = rgb(colour);
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
      };
      for (let x = hxMin - 1; x <= hxMax + 1; x++) put(x, brimY, CLOTH.hatDark);
      for (let x = hxMin; x <= hxMax; x++) put(x, brimY - 1, CLOTH.hat);
      for (let x = hxMin + 1; x <= hxMax - 1; x++) {
        put(x, brimY - 2, CLOTH.hat);
        put(x, brimY - 3, CLOTH.hatLight);
      }
    }
  }
}

mkdirSync('public/assets/sprites', { recursive: true });
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(OUT);
console.log(`wrote ${OUT} (${W}x${H}, ${cols}x${rows} frames, ${painted} pixels repainted)`);

if (process.argv.includes('--preview')) {
  const SC = 9;
  const show = [0, 10, 14];
  const tiles = [];
  for (let k = 0; k < show.length; k++) {
    const buf = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
      .extract({ left: 0, top: show[k] * FH, width: FW, height: FH })
      .resize(FW * SC, FH * SC, { kernel: 'nearest' })
      .png().toBuffer();
    tiles.push({ input: buf, left: k * FW * SC, top: 0 });
  }
  await sharp({ create: { width: show.length * FW * SC, height: FH * SC, channels: 4, background: { r: 60, g: 60, b: 70, alpha: 1 } } })
    .composite(tiles).png().toFile('C:/Users/josep/AppData/Local/Temp/wfr/rider-dressed.png');
  console.log('wrote preview rider-dressed.png (right, down, up)');
}
