/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getBundledFfmpegPath, getBundledFfprobePath, getFfmpegToolsDir } from '@process/utils/shellEnv';
import { mainError, mainLog } from '@process/utils/mainLogger';
import type { FfmpegDownloadProgress, FfmpegStatus, FfmpegToolInfo, FfmpegToolSource } from '@/common/types/mediaTools';

function exeName(base: 'ffmpeg' | 'ffprobe'): string {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

/** Probe whether a bare command on the system PATH responds to `-version`. */
function existsOnPath(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command, ['-version'], { windowsHide: true, stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

/** Best-effort absolute path of a command on PATH (where/which). */
function resolveOnPath(command: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    let out = '';
    const proc = spawn(finder, [command], { windowsHide: true });
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    proc.on('error', () => resolve(undefined));
    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve(undefined);
        return;
      }
      const first = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      resolve(first || undefined);
    });
  });
}

async function resolveTool(base: 'ffmpeg' | 'ffprobe'): Promise<FfmpegToolInfo> {
  // bundled / downloaded — getBundled*Path() checks resources then the download dir.
  const local = base === 'ffmpeg' ? getBundledFfmpegPath() : getBundledFfprobePath();
  if (local) {
    const source: FfmpegToolSource = local.includes(getFfmpegToolsDir()) ? 'downloaded' : 'bundled';
    return { available: true, source, path: local };
  }
  // system PATH
  if (await existsOnPath(base)) {
    return { available: true, source: 'path', path: await resolveOnPath(base) };
  }
  return { available: false, source: 'none' };
}

export async function getFfmpegStatus(): Promise<FfmpegStatus> {
  const [ffmpeg, ffprobe] = await Promise.all([resolveTool('ffmpeg'), resolveTool('ffprobe')]);
  return {
    ffmpeg,
    ffprobe,
    ready: ffmpeg.available && ffprobe.available,
    toolsDir: getFfmpegToolsDir(),
  };
}

type DownloadEntry = { url: string; archive: string };

/** Official static-build archives per platform (each archive contains both binaries,
 *  except macOS which downloads ffmpeg and ffprobe separately). */
function resolveDownloadEntries(): DownloadEntry[] {
  const arch = process.arch;
  if (process.platform === 'win32') {
    return [
      {
        url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
        archive: 'ffmpeg-win64.zip',
      },
    ];
  }
  if (process.platform === 'linux') {
    const slug = arch === 'arm64' ? 'linuxarm64' : 'linux64';
    return [
      {
        url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-${slug}-gpl.tar.xz`,
        archive: 'ffmpeg-linux.tar.xz',
      },
    ];
  }
  if (process.platform === 'darwin') {
    // evermeet provides x86_64 builds (run under Rosetta on Apple Silicon).
    return [
      { url: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip', archive: 'ffmpeg-mac.zip' },
      { url: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip', archive: 'ffprobe-mac.zip' },
    ];
  }
  return [];
}

async function downloadToFile(
  url: string,
  destFile: string,
  onProgress?: (p: FfmpegDownloadProgress) => void
): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const totalBytes = Number(res.headers.get('content-length') || 0) || undefined;
  let received = 0;
  const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length;
    onProgress?.({ phase: 'downloading', receivedBytes: received, totalBytes });
  });
  await pipeline(nodeStream, fs.createWriteStream(destFile));
}

/** Extract an archive using the system `tar` (bsdtar on Win10+/macOS handles zip;
 *  GNU tar on Linux handles tar.xz). Zero extra npm dependencies. */
function extractArchive(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xf', archivePath, '-C', destDir], { windowsHide: true, stdio: 'ignore' });
    proc.on('error', (err) => reject(new Error(`extract failed (system "tar" unavailable): ${err.message}`)));
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`extract failed: tar exit ${code}`))));
  });
}

async function findBinary(dir: string, target: string): Promise<string | null> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findBinary(full, target);
      if (found) return found;
    } else if (entry.name === target) {
      return full;
    }
  }
  return null;
}

/**
 * Download ffmpeg + ffprobe static builds and install them into the in-app tools dir.
 * Returns the refreshed status. Throws with an actionable message on failure
 * (caller surfaces it; user can still install ffmpeg manually onto PATH).
 */
export async function downloadFfmpegTools(onProgress?: (p: FfmpegDownloadProgress) => void): Promise<FfmpegStatus> {
  const entries = resolveDownloadEntries();
  if (entries.length === 0) {
    throw new Error(`unsupported platform for auto-download: ${process.platform}/${process.arch}`);
  }

  const toolsDir = getFfmpegToolsDir();
  await fs.promises.mkdir(toolsDir, { recursive: true });
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'one-ffmpeg-dl-'));

  try {
    for (const entry of entries) {
      const archivePath = path.join(tmpDir, entry.archive);
      mainLog('[ffmpegInstaller]', 'downloading', entry.url);
      await downloadToFile(entry.url, archivePath, onProgress);
      onProgress?.({ phase: 'extracting' });
      await extractArchive(archivePath, tmpDir);
    }

    onProgress?.({ phase: 'installing' });
    for (const base of ['ffmpeg', 'ffprobe'] as const) {
      const wanted = exeName(base);
      const found = await findBinary(tmpDir, wanted);
      if (!found) {
        throw new Error(`extracted archive did not contain ${wanted}`);
      }
      const dest = path.join(toolsDir, wanted);
      await fs.promises.copyFile(found, dest);
      if (process.platform !== 'win32') {
        await fs.promises.chmod(dest, 0o755).catch(() => {});
      }
    }

    return await getFfmpegStatus();
  } catch (error) {
    mainError('[ffmpegInstaller]', 'download/install failed', error);
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
