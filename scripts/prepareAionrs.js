/**
 * Prepare aionrs binary for Electron packaging.
 *
 * Resolution order:
 *  1. Existing bundled output at resources/bundled-aionrs/{platform-arch}/aionrs(.exe) (offline / vendored)
 *  2. Optional vendor drop at resources/vendor/aionrs/{platform-arch}/aionrs(.exe)
 *  3. GitHub release download (ONLY if AIONRS_ALLOW_DOWNLOAD=1; end-user installs must not rely on this)
 *
 * Output: resources/bundled-aionrs/{platform}-{arch}/aionrs[.exe]
 *
 * Pattern follows prepareBundledBun.js.
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GITHUB_OWNER = 'iOfficeAI';
const GITHUB_REPO = 'aionrs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDirectorySafe(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
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
  return platform === 'win32' ? 'aionrs.exe' : 'aionrs';
}

function getVersion() {
  return (process.env.AIONRS_VERSION || 'latest').trim();
}

function allowDownload() {
  return process.env.AIONRS_ALLOW_DOWNLOAD === '1' || process.env.AIONRS_ALLOW_DOWNLOAD === 'true';
}

function readBinaryVersion(binaryPath, fallbackVersion) {
  try {
    return execFileSync(binaryPath, ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return fallbackVersion;
  }
}

function fetchLatestTagName() {
  // Use GitHub API so we can derive asset names in "latest" mode.
  // Important: use `process.execPath` so we don't depend on `node` being on PATH.
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

  const nodeBin = process.execPath;
  const result = execFileSync(
    nodeBin,
    [
      '-e',
      "const https=require('https');const u=process.argv[1];https.get(u,{headers:{'User-Agent':'1ONE-ClaudeCode','Accept':'application/vnd.github+json'}},(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{const j=JSON.parse(d);process.stdout.write(String(j.tag_name||''));}catch(e){process.exit(2);}})}).on('error',()=>process.exit(3));",
      url,
    ],
    { encoding: 'utf-8', timeout: 25000, windowsHide: true }
  ).trim();

  if (!result) throw new Error('Failed to resolve latest aionrs release tag');
  return result;
}

// ---------------------------------------------------------------------------
// Source resolvers
// ---------------------------------------------------------------------------

/**
 * 1. Download from GitHub releases
 */
function getAssetName(platform, arch, versionOrTag) {
  const archMap = { x64: 'x86_64', arm64: 'aarch64' };
  const platformMap = { darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc' };
  const normalizedArch = archMap[arch];
  const normalizedPlatform = platformMap[platform];
  if (!normalizedArch || !normalizedPlatform) return null;
  const ext = platform === 'win32' ? '.zip' : '.tar.gz';
  // Asset naming (2026-04): aionrs-v0.1.7-x86_64-pc-windows-msvc.zip
  // We keep it version-aware so both "latest" and pinned versions work reliably.
  const tag = versionOrTag && versionOrTag !== 'latest' ? versionOrTag : '';
  if (!tag) return null;
  const normalizedTag = tag.startsWith('v') ? tag : `v${tag}`;
  return `aionrs-${normalizedTag}-${normalizedArch}-${normalizedPlatform}${ext}`;
}

function getDownloadUrl(assetName, version) {
  if (version === 'latest') {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${assetName}`;
  }
  const tag = version.startsWith('v') ? version : `v${version}`;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${assetName}`;
}

function downloadFile(url, outputPath) {
  console.log(`  Downloading aionrs from ${url}`);
  if (process.platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 120000 });
    return;
  }
  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], { timeout: 120000 });
  } catch {
    execFileSync('wget', ['-q', '-O', outputPath, url], { timeout: 120000 });
  }
}

function extractArchive(archivePath, outputDir, platform) {
  ensureDirectory(outputDir);
  if (platform === 'win32' || archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      const ps = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`;
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', outputDir]);
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', outputDir]);
  }
}

function findBinaryInDir(dir, binaryName) {
  // Search recursively for the binary
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === binaryName) return fullPath;
    if (entry.isDirectory()) {
      const found = findBinaryInDir(fullPath, binaryName);
      if (found) return found;
    }
  }
  return null;
}

function downloadAndExtract(platform, arch, version) {
  const resolvedTag = version === 'latest' ? fetchLatestTagName() : version;
  const assetName = getAssetName(platform, arch, resolvedTag);
  if (!assetName) {
    throw new Error(`Unsupported aionrs target: ${platform}-${arch}`);
  }

  const url = getDownloadUrl(assetName, version);
  const tempDir = path.join(os.tmpdir(), 'aionui-aionrs', version, `${platform}-${arch}`);
  const archivePath = path.join(tempDir, assetName);
  const extractDir = path.join(tempDir, 'extracted');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  downloadFile(url, archivePath);
  extractArchive(archivePath, extractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(extractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in downloaded archive`);
  }

  return { binaryPath, tempDir };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * @param {{ strict?: boolean }} [opts]
 */
function prepareAionrs(opts) {
  const strict = Boolean(opts && opts.strict);
  const projectRoot = path.resolve(__dirname, '..');
  const platform = process.platform;
  // Support cross-compilation: AIONRS_ARCH > npm_config_target_arch > process.arch
  const arch = process.env.AIONRS_ARCH || process.env.npm_config_target_arch || process.arch;
  const runtimeKey = `${platform}-${arch}`;
  const version = getVersion();

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aionrs', runtimeKey);
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(targetDir, binaryName);

  console.log(`Preparing aionrs for ${runtimeKey} (version: ${version})`);

  let sourcePath = null;
  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  // 1) Reuse already-bundled binary (committed in repo for offline packaging)
  if (fs.existsSync(targetBinaryPath)) {
    const sourceTypeLocal = 'bundled-local';
    const sourceDetailLocal = { path: path.relative(projectRoot, targetBinaryPath) };
    console.log(`  Using existing bundled binary: ${sourceDetailLocal.path}`);

    ensureExecutableMode(targetBinaryPath);
    const binaryVersion = readBinaryVersion(targetBinaryPath, version);
    writeJson(path.join(targetDir, 'manifest.json'), {
      platform,
      arch,
      version: binaryVersion,
      generatedAt: new Date().toISOString(),
      sourceType: sourceTypeLocal,
      source: sourceDetailLocal,
      files: [binaryName],
      skipped: false,
    });

    console.log(
      `  Bundled aionrs prepared: resources/bundled-aionrs/${runtimeKey}/${binaryName} [source=${sourceTypeLocal}]`
    );
    return { prepared: true, dir: targetDir, sourceType: sourceTypeLocal };
  }

  // 2) Vendor drop folder (optional): resources/vendor/aionrs/{runtimeKey}/aionrs(.exe)
  if (!sourcePath) {
    const vendorPath = path.join(projectRoot, 'resources', 'vendor', 'aionrs', runtimeKey, binaryName);
    if (fs.existsSync(vendorPath)) {
      removeDirectorySafe(targetDir);
      ensureDirectory(targetDir);
      copyFileSafe(vendorPath, targetBinaryPath);
      ensureExecutableMode(targetBinaryPath);
      const binaryVersion = readBinaryVersion(targetBinaryPath, version);
      writeJson(path.join(targetDir, 'manifest.json'), {
        platform,
        arch,
        version: binaryVersion,
        generatedAt: new Date().toISOString(),
        sourceType: 'vendor',
        source: { path: path.relative(projectRoot, vendorPath) },
        files: [binaryName],
        skipped: false,
      });
      console.log(`  Bundled aionrs from vendor: ${path.relative(projectRoot, vendorPath)}`);
      return { prepared: true, dir: targetDir, sourceType: 'vendor' };
    }
  }

  if (!sourcePath && !allowDownload()) {
    const msg =
      'aionrs binary missing in repo (offline mode). Add resources/bundled-aionrs/<platform-arch>/aionrs(.exe) or set AIONRS_ALLOW_DOWNLOAD=1 on the build machine only.';
    if (strict) throw new Error(msg);
    console.warn(`  ${msg}`);
    return { prepared: false, reason: 'missing_offline' };
  }

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  // 3) Download from GitHub releases (maintainer/build machine only)
  if (!sourcePath) {
    try {
      const result = downloadAndExtract(platform, arch, version);
      sourcePath = result.binaryPath;
      tempDir = result.tempDir;
      sourceType = 'download';
      const tagForDetail = version === 'latest' ? fetchLatestTagName() : version;
      sourceDetail = { url: getDownloadUrl(getAssetName(platform, arch, tagForDetail), version) };
      console.log(`  Downloaded from GitHub releases`);
    } catch (error) {
      console.warn(`  Download failed: ${error.message}`);
    }
  }

  // Write result
  if (sourcePath) {
    if (sourceType !== 'bundled-local') {
      copyFileSafe(sourcePath, targetBinaryPath);
    }
    ensureExecutableMode(targetBinaryPath);

    // Get version info from binary
    const binaryVersion = readBinaryVersion(targetBinaryPath, version);

    const manifest = {
      platform,
      arch,
      version: binaryVersion,
      generatedAt: new Date().toISOString(),
      sourceType,
      source: sourceDetail,
      files: [binaryName],
      skipped: false,
    };

    writeJson(path.join(targetDir, 'manifest.json'), manifest);
    console.log(
      `  Bundled aionrs prepared: resources/bundled-aionrs/${runtimeKey}/${binaryName} [source=${sourceType}]`
    );

    if (tempDir) removeDirectorySafe(tempDir);
    return { prepared: true, dir: targetDir, sourceType };
  }

  // Not found — write skip manifest (non-fatal, like bundled-bun)
  const manifest = {
    platform,
    arch,
    version,
    generatedAt: new Date().toISOString(),
    sourceType: 'none',
    source: {},
    files: [],
    skipped: true,
    reason: 'aionrs binary not found (ensure GitHub release exists)',
  };

  writeJson(path.join(targetDir, 'manifest.json'), manifest);
  const msg = 'aionrs not found — skipping bundle (agent will not be available in packaged app)';
  if (strict) {
    throw new Error(msg);
  }
  console.warn(`  ${msg}`);
  return { prepared: false, reason: 'not_found' };
}

module.exports = prepareAionrs;
