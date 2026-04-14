/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

function hasCommand(cmd) {
  try {
    // Cross-platform: `where` (Windows) / `command -v` (macOS/Linux)
    if (process.platform === 'win32') {
      execSync(`where ${cmd}`, { stdio: 'ignore' });
      return true;
    }
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runPostInstall() {
  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');

    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // In local environment, use electron-builder to install dependencies
      console.log('Local environment, installing app deps');
      const runner = hasCommand('bunx') ? 'bunx' : 'npx';
      if (runner !== 'bunx') {
        console.log('bunx not found, falling back to npx for electron-builder');
      }

      execSync(`${runner} electron-builder install-app-deps`, {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_build_from_source: 'true',
        },
      });

      // Prepare bundled aionrs binary for local dev/runtime (non-fatal).
      // Default is offline: the binary should be vendored under resources/bundled-aionrs/... in the repo.
      // Maintainers may set AIONRS_ALLOW_DOWNLOAD=1 to fetch during install on dev machines only.
      try {
        const platform = process.platform;
        const arch = process.env.AIONRS_ARCH || process.env.npm_config_target_arch || process.arch;
        const runtimeKey = `${platform}-${arch}`;
        const binaryName = platform === 'win32' ? 'aionrs.exe' : 'aionrs';
        const targetBinary = path.join(process.cwd(), 'resources', 'bundled-aionrs', runtimeKey, binaryName);
        if (!fs.existsSync(targetBinary)) {
          console.log(`Bundled aionrs not found at ${targetBinary}, running prepare (offline-first)...`);
          execSync('node -e "require(\'./scripts/prepareAionrs\')()"', {
            stdio: 'inherit',
            env: { ...process.env },
          });
        }
      } catch (e) {
        console.warn('Prepare aionrs skipped/failed (non-fatal):', e && e.message ? e.message : String(e));
      }
    }
  } catch (e) {
    console.error('Postinstall failed:', e.message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;
