#!/usr/bin/env node
/**
 * Vendor @colbymchenry/codegraph and agent-browser into resources/bundled-agent-toolkit/
 * for offline-first MCP / CLI usage. Packaging reads from here; runtime falls back to npx if missing.
 *
 * Env:
 *   SKIP_BUNDLED_AGENT_TOOLKIT=1 — skip
 *   AGENT_TOOLKIT_CODEGRAPH_VERSION — default 0.7.9
 *   AGENT_TOOLKIT_AGENT_BROWSER_VERSION — default 0.27.0
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CODEGRAPH_VERSION = process.env.AGENT_TOOLKIT_CODEGRAPH_VERSION || '0.7.9';
const AGENT_BROWSER_VERSION = process.env.AGENT_TOOLKIT_AGENT_BROWSER_VERSION || '0.27.0';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function prepareForRuntime(projectRoot, platform, arch) {
  const runtimeKey = `${platform}-${arch}`;
  const targetDir = path.join(projectRoot, 'resources', 'bundled-agent-toolkit', runtimeKey);

  rmDir(targetDir);
  ensureDir(targetDir);

  const packageJson = {
    name: '1one-bundled-agent-toolkit',
    private: true,
    dependencies: {
      '@colbymchenry/codegraph': CODEGRAPH_VERSION,
      'agent-browser': AGENT_BROWSER_VERSION,
    },
  };

  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');

  console.log(`[prepareBundledAgentToolkit] Installing npm packages for ${runtimeKey}...`);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCmd, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: targetDir,
    stdio: 'inherit',
    env: { ...process.env, npm_config_update_notifier: 'false' },
    shell: process.platform === 'win32',
  });

  const codegraphCli = path.join(
    targetDir,
    'node_modules',
    '@colbymchenry',
    'codegraph',
    'dist',
    'bin',
    'codegraph.js'
  );
  const agentBrowserCli = path.join(targetDir, 'node_modules', 'agent-browser', 'bin', 'agent-browser.js');

  if (!fs.existsSync(codegraphCli)) {
    throw new Error(`codegraph CLI missing after install: ${codegraphCli}`);
  }
  if (!fs.existsSync(agentBrowserCli)) {
    throw new Error(`agent-browser CLI missing after install: ${agentBrowserCli}`);
  }

  const manifest = {
    platform,
    arch,
    generatedAt: new Date().toISOString(),
    packages: {
      codegraph: {
        version: CODEGRAPH_VERSION,
        cli: 'node_modules/@colbymchenry/codegraph/dist/bin/codegraph.js',
      },
      'agent-browser': {
        version: AGENT_BROWSER_VERSION,
        cli: 'node_modules/agent-browser/bin/agent-browser.js',
      },
    },
  };

  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`[prepareBundledAgentToolkit] Ready: resources/bundled-agent-toolkit/${runtimeKey}`);
}

function main() {
  if (process.env.SKIP_BUNDLED_AGENT_TOOLKIT === '1') {
    console.log('[prepareBundledAgentToolkit] SKIP_BUNDLED_AGENT_TOOLKIT=1, skipping');
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  const platform = process.platform;
  const arch = process.arch;

  prepareForRuntime(projectRoot, platform, arch);
}

main();
