/**
 * Crop the mascot from a header screenshot (e.g. sidebar logo + "1ONE Code" text),
 * write src/renderer/assets/brand-mark.png and resources/brand-source.png.
 * Then run: bun run icons:brand
 *
 * Usage: node scripts/import-user-brand-screenshot.mjs <path-to-screenshot.png>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const inputPath = process.argv[2];
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node scripts/import-user-brand-screenshot.mjs <screenshot.png>');
  process.exit(1);
}

/** Known layout: narrow strip with hamburger, then cat, then title text */
function presetCrop(meta) {
  if (meta.width === 295 && meta.height === 118) {
    return { left: 30, top: 26, width: 66, height: 92 };
  }
  return null;
}

async function main() {
  const base = sharp(inputPath);
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('Could not read image size');

  const box = presetCrop(meta);
  if (!box) {
    console.error(
      '[import-brand] No preset crop for this size. Add one in presetCrop() or crop manually to PNG, then set as resources/brand-source.png'
    );
    process.exit(2);
  }

  const cropped = await base.extract(box).png().toBuffer();

  const brandMarkPath = path.join(root, 'src', 'renderer', 'assets', 'brand-mark.png');
  const brandSourcePath = path.join(root, 'resources', 'brand-source.png');

  fs.mkdirSync(path.dirname(brandMarkPath), { recursive: true });
  fs.mkdirSync(path.dirname(brandSourcePath), { recursive: true });

  await sharp(cropped)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(brandSourcePath);

  await sharp(cropped)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(brandMarkPath);

  console.log('[import-brand] crop', box);
  console.log('[import-brand] wrote', path.relative(root, brandMarkPath));
  console.log('[import-brand] wrote', path.relative(root, brandSourcePath));
  console.log('[import-brand] next: bun run icons:brand');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
