#!/usr/bin/env node
/**
 * Vendor third-party agent toolkit assets into the repo (skills) and optional runtime dir.
 *
 * Sources:
 * - obra/superpowers (MIT) — full skills/ library
 * - find-skills (skills.sh) — bundled from template in repo
 * - vercel-labs/agent-browser (Apache-2.0) — skills/agent-browser stub
 *
 * Usage: node scripts/vendor-agent-toolkit.mjs
 * Env:   SKIP_AGENT_TOOLKIT_VENDOR=1 to no-op
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUILTIN_SKILLS = path.join(ROOT, 'src', 'process', 'resources', 'skills', '_builtin');
const VENDOR_RUNTIME = path.join(ROOT, 'src', 'process', 'resources', 'skills', '_vendor-cache');

const SUPERPOWERS_ZIP_URL =
  'https://github.com/obra/superpowers/archive/refs/heads/main.zip';
const AGENT_BROWSER_SKILL_URL =
  'https://raw.githubusercontent.com/vercel-labs/agent-browser/main/skills/agent-browser/SKILL.md';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error('Too many redirects'));
        return;
      }
      https
        .get(currentUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            follow(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
            return;
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        })
        .on('error', reject);
    };
    follow(url);
  });
}

function copyDir(src, dest, { overwrite = true } = {}) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to, { overwrite });
    } else if (entry.isFile()) {
      if (!overwrite && fs.existsSync(to)) continue;
      fs.copyFileSync(from, to);
    }
  }
}

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function vendorSuperpowers() {
  const zipPath = path.join(VENDOR_RUNTIME, 'superpowers-main.zip');
  const extractDir = path.join(VENDOR_RUNTIME, 'superpowers-extract');
  ensureDir(VENDOR_RUNTIME);

  console.log('[vendor-agent-toolkit] Downloading superpowers...');
  await downloadUrl(SUPERPOWERS_ZIP_URL, zipPath);

  rmDir(extractDir);
  ensureDir(extractDir);

  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`unzip -q -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
  }

  const skillsRoot = path.join(extractDir, 'superpowers-main', 'skills');
  if (!fs.existsSync(skillsRoot)) {
    throw new Error(`superpowers skills/ not found at ${skillsRoot}`);
  }

  let count = 0;
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = path.join(skillsRoot, entry.name);
    const dest = path.join(BUILTIN_SKILLS, entry.name);
    copyDir(src, dest, { overwrite: true });
    count += 1;
  }
  console.log(`[vendor-agent-toolkit] Superpowers: synced ${count} skills to _builtin/`);
}

async function vendorAgentBrowserSkill() {
  console.log('[vendor-agent-toolkit] Downloading agent-browser skill stub...');
  const destDir = path.join(BUILTIN_SKILLS, 'agent-browser');
  ensureDir(destDir);
  const destFile = path.join(destDir, 'SKILL.md');
  await downloadUrl(AGENT_BROWSER_SKILL_URL, destFile);
  console.log('[vendor-agent-toolkit] agent-browser skill stub written');
}

function vendorFindSkills() {
  const src = path.join(BUILTIN_SKILLS, 'find-skills', 'SKILL.md');
  if (fs.existsSync(src)) {
    console.log('[vendor-agent-toolkit] find-skills already present');
    return;
  }
  console.warn('[vendor-agent-toolkit] find-skills/SKILL.md missing — commit it in repo');
}

async function main() {
  if (process.env.SKIP_AGENT_TOOLKIT_VENDOR === '1') {
    console.log('[vendor-agent-toolkit] SKIP_AGENT_TOOLKIT_VENDOR=1, skipping');
    return;
  }

  ensureDir(BUILTIN_SKILLS);
  vendorFindSkills();
  await vendorAgentBrowserSkill();
  await vendorSuperpowers();
  console.log('[vendor-agent-toolkit] Done');
}

main().catch((err) => {
  console.error('[vendor-agent-toolkit] Failed:', err);
  process.exit(1);
});
