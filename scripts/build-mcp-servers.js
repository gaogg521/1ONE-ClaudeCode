#!/usr/bin/env node
/**
 * Build builtin MCP server scripts as fully self-contained CJS bundles.
 *
 * electron-vite's externalizeDepsPlugin leaves all npm packages as require()
 * calls, which works for Electron's main process (ASAR virtual FS patches
 * require()) but fails when an external `node` process runs the script from
 * app.asar.unpacked — there is no ASAR support there.
 *
 * This script uses esbuild's programmatic API (instead of CLI flags) to avoid
 * shell-quoting issues with special characters in --define values.
 */

const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const MCP_BUILDS = [
  {
    entry: 'src/process/resources/builtinMcp/imageGenServer.ts',
    outfile: 'out/main/builtin-mcp-image-gen.js',
  },
  {
    entry: 'src/process/resources/builtinMcp/webToolsServer.ts',
    outfile: 'out/main/builtin-mcp-web-tools.js',
  },
  {
    entry: 'src/process/resources/builtinMcp/exportToPdfServer.ts',
    outfile: 'out/main/builtin-mcp-export-pdf.js',
  },
];

async function main() {
  for (const { entry, outfile } of MCP_BUILDS) {
    await esbuild.build({
      entryPoints: [path.join(ROOT, entry)],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: path.join(ROOT, outfile),
      external: ['electron'],
      tsconfig: path.join(ROOT, 'tsconfig.json'),
      loader: { '.wasm': 'empty' },
      define: {
        'import.meta.url': JSON.stringify('file:///C:/placeholder'),
      },
    });
  }
}

main().catch((err) => {
  console.error('MCP server build failed:', err);
  process.exit(1);
});
