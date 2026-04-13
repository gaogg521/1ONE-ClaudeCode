/**
 * Brand pipeline (run: bun run icons:brand):
 * 1. If resources/brand-mark.png exists — canonical mascot (what you edit). Syncs to
 *    src/renderer/assets/brand-mark.png and drives app.ico / app.png / login logo.
 * 2. Else if resources/brand-source.png exists — use that.
 * 3. Else create brand-source from built-in SVG.
 *
 * ICO / app.png use 512×512, fit contain + transparent padding (no cropping).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Rounded pink mascot aligned with 1ONE product branding (replace SVG if art updates). */
const BRAND_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FF9EB5"/>
      <stop offset="100%" style="stop-color:#FF5C8D"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <path d="M130 150 L200 48 L248 168 Z" fill="#E8487A"/>
  <path d="M382 150 L312 48 L264 168 Z" fill="#E8487A"/>
  <ellipse cx="256" cy="308" rx="148" ry="128" fill="#FFF8FA" opacity="0.96"/>
  <ellipse cx="196" cy="268" rx="32" ry="38" fill="#2D2D2D"/>
  <ellipse cx="316" cy="268" rx="32" ry="38" fill="#2D2D2D"/>
  <ellipse cx="256" cy="288" rx="22" ry="14" fill="#FFB6C8"/>
  <path d="M220 332 Q256 360 292 332" stroke="#E8487A" stroke-width="12" fill="none" stroke-linecap="round"/>
</svg>`;

const resourcesDir = path.join(root, 'resources');
const brandDir = path.join(root, 'src', 'renderer', 'assets', 'logos', 'brand');
const brandMarkCanonicalPath = path.join(resourcesDir, 'brand-mark.png');
const rendererBrandMarkPath = path.join(root, 'src', 'renderer', 'assets', 'brand-mark.png');
const brandSourcePath = path.join(resourcesDir, 'brand-source.png');

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function main() {
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.mkdirSync(brandDir, { recursive: true });
  fs.mkdirSync(path.dirname(rendererBrandMarkPath), { recursive: true });

  let rasterInputPath = brandSourcePath;

  if (fs.existsSync(brandMarkCanonicalPath)) {
    await fs.promises.copyFile(brandMarkCanonicalPath, rendererBrandMarkPath);
    const normalized = await sharp(brandMarkCanonicalPath)
      .resize(1024, 1024, { fit: 'contain', background: transparent })
      .png()
      .toBuffer();
    fs.writeFileSync(brandSourcePath, normalized);
    rasterInputPath = brandMarkCanonicalPath;
    console.log('[icons:brand] using', path.relative(root, brandMarkCanonicalPath));
    console.log('[icons:brand] synced', path.relative(root, rendererBrandMarkPath));
  } else if (fs.existsSync(brandSourcePath)) {
    console.log('[icons:brand] using', path.relative(root, brandSourcePath));
  } else {
    const masterPng = await sharp(Buffer.from(BRAND_SVG)).resize(1024, 1024).png().toBuffer();
    fs.writeFileSync(brandSourcePath, masterPng);
    rasterInputPath = brandSourcePath;
    console.log('[icons:brand] created', path.relative(root, brandSourcePath), '(1024×1024 from SVG; add resources/brand-mark.png to customize)');
  }

  const png512 = await sharp(rasterInputPath)
    .resize(512, 512, { fit: 'contain', background: transparent })
    .png()
    .toBuffer();

  const appPngPath = path.join(resourcesDir, 'app.png');
  const loginPngPath = path.join(brandDir, 'app.png');
  fs.writeFileSync(appPngPath, png512);
  fs.writeFileSync(loginPngPath, png512);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    sizes.map((s) => sharp(png512).resize(s, s).png().toBuffer())
  );
  const ico = await toIco(icoBuffers);
  fs.writeFileSync(path.join(resourcesDir, 'app.ico'), ico);

  console.log('[icons:brand] wrote resources/app.png, resources/app.ico, src/renderer/assets/logos/brand/app.png');
  if (fs.existsSync(brandMarkCanonicalPath)) {
    console.log('[icons:brand] updated resources/brand-source.png (1024 contain, from brand-mark)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
