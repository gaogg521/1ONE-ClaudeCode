/**
 * One-off / maintenance: replace product name "1ONE" with "1ONE Code" in locale JSON.
 * Preserves strings that already say "1ONE Code".
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src', 'renderer', 'services', 'i18n', 'locales');

/** Must not contain the substring "1ONE" or the second replace will corrupt it */
const PLACEHOLDER = '\uE000__BRAND_PH__\uE001';

function walkJson(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(p, acc);
    else if (e.isFile() && e.name.endsWith('.json')) acc.push(p);
  }
  return acc;
}

let count = 0;
for (const file of walkJson(root)) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  s = s.replace(/1ONE Code/g, PLACEHOLDER);
  s = s.replace(/1ONE/g, '1ONE Code');
  s = s.split(PLACEHOLDER).join('1ONE Code');
  if (s !== orig) {
    fs.writeFileSync(file, s, 'utf8');
    console.log(path.relative(root, file));
    count += 1;
  }
}
console.log(`[replace-1one-brand] updated ${count} files`);
