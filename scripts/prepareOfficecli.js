/**
 * Prepare officecli binary for Electron packaging.
 *
 * Resolution order:
 *  1. Existing bundled output at resources/bundled-officecli/{platform-arch}/officecli(.exe) (offline / vendored)
 *  2. Optional vendor drop at resources/vendor/officecli/{platform-arch}/officecli(.exe)
 *  3. User local install at %LOCALAPPDATA%\OfficeCli\officecli.exe (Windows, dev-time convenience copy)
 *  4. GitHub release download (ONLY if OFFICECLI_ALLOW_DOWNLOAD=1; end-user installs must not rely on this)
 *
 * Output: resources/bundled-officecli/{platform}-{arch}/officecli[.exe]
 *
 * Pattern follows prepareAionrs.js.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GITHUB_OWNER = 'iOfficeAI';
const GITHUB_REPO = 'OfficeCLI';

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFileSafe(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function ensureExecutableMode(filePath) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'officecli.exe' : 'officecli';
}

function allowDownload() {
  return process.env.OFFICECLI_ALLOW_DOWNLOAD === '1' || process.env.OFFICECLI_ALLOW_DOWNLOAD === 'true';
}

function readBinaryVersion(binaryPath) {
  try {
    return execFileSync(binaryPath, ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function getLocalInstallPath(platform) {
  if (platform !== 'win32') return null;
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const candidate = path.join(localAppData, 'OfficeCli', 'officecli.exe');
  return fs.existsSync(candidate) ? candidate : null;
}

function downloadFile(url, outputPath) {
  console.log(`  Downloading officecli from ${url}`);
  if (process.platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 180000 });
    return;
  }
  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], { timeout: 180000 });
  } catch {
    execFileSync('wget', ['-q', '-O', outputPath, url], { timeout: 180000 });
  }
}

function downloadBinary(platform, arch) {
  const archMap = { x64: 'amd64', arm64: 'arm64' };
  const platformMap = { darwin: 'macos', linux: 'linux', win32: 'windows' };
  const normalizedArch = archMap[arch];
  const normalizedPlatform = platformMap[platform];
  if (!normalizedArch || !normalizedPlatform) {
    throw new Error(`Unsupported officecli target: ${platform}-${arch}`);
  }
  const ext = platform === 'win32' ? '.exe' : '';
  const assetName = `officecli-${normalizedPlatform}-${normalizedArch}${ext}`;
  const url = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${assetName}`;
  const tempDir = path.join(os.tmpdir(), 'aionui-officecli', `${platform}-${arch}`);
  ensureDirectory(tempDir);
  const downloadPath = path.join(tempDir, assetName);
  downloadFile(url, downloadPath);
  return downloadPath;
}

/**
 * @param {{ strict?: boolean }} [opts]
 */
function prepareOfficecli(opts) {
  const strict = Boolean(opts && opts.strict);
  const projectRoot = path.resolve(__dirname, '..');
  const platform = process.platform;
  const arch = process.env.OFFICECLI_ARCH || process.env.npm_config_target_arch || process.arch;
  const runtimeKey = `${platform}-${arch}`;

  const targetDir = path.join(projectRoot, 'resources', 'bundled-officecli', runtimeKey);
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(targetDir, binaryName);

  console.log(`Preparing officecli for ${runtimeKey}`);

  // 1) Reuse already-bundled binary
  if (fs.existsSync(targetBinaryPath)) {
    console.log(`  Using existing bundled binary: ${path.relative(projectRoot, targetBinaryPath)}`);
    ensureExecutableMode(targetBinaryPath);
    const version = readBinaryVersion(targetBinaryPath);
    writeJson(path.join(targetDir, 'manifest.json'), {
      platform, arch, version,
      generatedAt: new Date().toISOString(),
      sourceType: 'bundled-local',
      source: { path: path.relative(projectRoot, targetBinaryPath) },
      files: [binaryName], skipped: false,
    });
    console.log(`  Bundled officecli prepared [source=bundled-local, version=${version}]`);
    return { prepared: true, dir: targetDir, sourceType: 'bundled-local' };
  }

  ensureDirectory(targetDir);

  // 2) Vendor drop folder
  const vendorPath = path.join(projectRoot, 'resources', 'vendor', 'officecli', runtimeKey, binaryName);
  if (fs.existsSync(vendorPath)) {
    copyFileSafe(vendorPath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);
    const version = readBinaryVersion(targetBinaryPath);
    writeJson(path.join(targetDir, 'manifest.json'), {
      platform, arch, version,
      generatedAt: new Date().toISOString(),
      sourceType: 'vendor',
      source: { path: path.relative(projectRoot, vendorPath) },
      files: [binaryName], skipped: false,
    });
    console.log(`  Bundled officecli from vendor [version=${version}]`);
    return { prepared: true, dir: targetDir, sourceType: 'vendor' };
  }

  // 3) Local install (Windows dev convenience — not for cross-compile)
  if (platform === process.platform) {
    const localPath = getLocalInstallPath(platform);
    if (localPath) {
      console.log(`  Copying from local install: ${localPath}`);
      copyFileSafe(localPath, targetBinaryPath);
      ensureExecutableMode(targetBinaryPath);
      const version = readBinaryVersion(targetBinaryPath);
      writeJson(path.join(targetDir, 'manifest.json'), {
        platform, arch, version,
        generatedAt: new Date().toISOString(),
        sourceType: 'local-install',
        source: { path: localPath },
        files: [binaryName], skipped: false,
      });
      console.log(`  Bundled officecli from local install [version=${version}]`);
      return { prepared: true, dir: targetDir, sourceType: 'local-install' };
    }
  }

  // 4) GitHub release download (build machine only)
  if (!allowDownload()) {
    const msg = 'officecli binary missing (offline mode). Add resources/bundled-officecli/<platform-arch>/officecli(.exe) or set OFFICECLI_ALLOW_DOWNLOAD=1 on build machine.';
    if (strict) throw new Error(msg);
    console.warn(`  ${msg}`);
    writeJson(path.join(targetDir, 'manifest.json'), {
      platform, arch, version: 'none',
      generatedAt: new Date().toISOString(),
      sourceType: 'none', source: {}, files: [], skipped: true,
      reason: 'binary not found (offline mode)',
    });
    return { prepared: false, reason: 'missing_offline' };
  }

  try {
    const downloadedPath = downloadBinary(platform, arch);
    copyFileSafe(downloadedPath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);
    const version = readBinaryVersion(targetBinaryPath);
    writeJson(path.join(targetDir, 'manifest.json'), {
      platform, arch, version,
      generatedAt: new Date().toISOString(),
      sourceType: 'download',
      source: { url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest` },
      files: [binaryName], skipped: false,
    });
    console.log(`  Bundled officecli from GitHub releases [version=${version}]`);
    return { prepared: true, dir: targetDir, sourceType: 'download' };
  } catch (error) {
    console.warn(`  Download failed: ${error.message}`);
  }

  const msg = 'officecli not found — agent xlsx features will not work in packaged app';
  if (strict) throw new Error(msg);
  console.warn(`  ${msg}`);
  writeJson(path.join(targetDir, 'manifest.json'), {
    platform, arch, version: 'none',
    generatedAt: new Date().toISOString(),
    sourceType: 'none', source: {}, files: [], skipped: true,
    reason: 'not found',
  });
  return { prepared: false, reason: 'not_found' };
}

module.exports = prepareOfficecli;

if (require.main === module) {
  const result = prepareOfficecli();
  process.exit(result.prepared ? 0 : 1);
}
