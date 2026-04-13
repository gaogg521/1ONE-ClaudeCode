/**
 * Split branding in locale JSON:
 * - conversation.json + cron.json: "1ONE Code" → "1ONE CODE" (built-in chat / session assistant)
 * - common.json + login.json: "1ONE Code" → "1ONE" (local app shell)
 * - settings.json: "1ONE Code Agent" → "1ONE CODE Agent", then "1ONE Code" → "1ONE"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesRoot = path.join(__dirname, '..', 'src', 'renderer', 'services', 'i18n', 'locales');

function walkJson(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(p, acc);
    else if (e.isFile() && e.name.endsWith('.json')) acc.push(p);
  }
  return acc;
}

function transform(filePath, baseName) {
  let s = fs.readFileSync(filePath, 'utf8');
  const orig = s;

  if (baseName === 'conversation.json' || baseName === 'cron.json') {
    s = s.replace(/1ONE Code/g, '1ONE CODE');
  } else if (baseName === 'common.json' || baseName === 'login.json') {
    s = s.replace(/1ONE Code/g, '1ONE');
  } else if (baseName === 'settings.json') {
    s = s.replace(/1ONE Code Agent/g, '1ONE CODE Agent');
    s = s.replace(/1ONE Code/g, '1ONE');
  }

  if (s !== orig) {
    fs.writeFileSync(filePath, s, 'utf8');
    return true;
  }
  return false;
}

let n = 0;
for (const file of walkJson(localesRoot)) {
  if (transform(file, path.basename(file))) {
    console.log(path.relative(localesRoot, file));
    n += 1;
  }
}
console.log(`[split-1one-brand] updated ${n} files`);
