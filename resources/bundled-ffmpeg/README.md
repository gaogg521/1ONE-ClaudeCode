# Bundled FFmpeg

This directory holds the ffmpeg **and ffprobe** binaries bundled into the
installer so users don't need to install ffmpeg separately.

- `ffmpeg` — audio-track extraction (video → mp3 for STT) and video keyframe extraction.
- `ffprobe` — video metadata (duration / resolution / recorder), used to drive
  duration-aware keyframe sampling for video understanding.

Both come from the same static build (`bin/` folder of the BtbN/gyan archives),
so populate them together.

## Layout

```
bundled-ffmpeg/
  win32-x64/
    ffmpeg.exe
    ffprobe.exe
  darwin-arm64/
    ffmpeg
    ffprobe
  darwin-x64/
    ffmpeg
    ffprobe
  linux-x64/
    ffmpeg
    ffprobe
```

## How to populate

### Windows (win32-x64)

Download a static build from https://www.gyan.dev/ffmpeg/builds/ (or
https://github.com/BtbN/FFmpeg-Builds/releases). Copy `ffmpeg.exe` into
`win32-x64/`.

```powershell
# Example using BtbN build (copy BOTH ffmpeg.exe and ffprobe.exe)
Invoke-WebRequest -Uri "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" -OutFile ffmpeg.zip
Expand-Archive ffmpeg.zip -DestinationPath ffmpeg-tmp
Copy-Item ffmpeg-tmp\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe resources\bundled-ffmpeg\win32-x64\
Copy-Item ffmpeg-tmp\ffmpeg-master-latest-win64-gpl\bin\ffprobe.exe resources\bundled-ffmpeg\win32-x64\
```

### macOS

```bash
# arm64 (ffmpeg + ffprobe are separate downloads on evermeet.cx)
curl -L https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip -o ffmpeg.zip
unzip ffmpeg.zip -d resources/bundled-ffmpeg/darwin-arm64/
curl -L https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip -o ffprobe.zip
unzip ffprobe.zip -d resources/bundled-ffmpeg/darwin-arm64/
chmod +x resources/bundled-ffmpeg/darwin-arm64/ffmpeg resources/bundled-ffmpeg/darwin-arm64/ffprobe
```

### Linux

```bash
# Static build from johnvansickle.com (archive includes ffmpeg + ffprobe)
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar xJ
cp ffmpeg-*-amd64-static/ffmpeg ffmpeg-*-amd64-static/ffprobe resources/bundled-ffmpeg/linux-x64/
chmod +x resources/bundled-ffmpeg/linux-x64/ffmpeg resources/bundled-ffmpeg/linux-x64/ffprobe
```

## Fallback

When the bundled binaries are missing (e.g. dev mode), `getBundledFfmpegPath()` /
`getBundledFfprobePath()` return null and callers fall back to `ffmpeg` / `ffprobe`
on the system PATH. This means developers can run without populating this directory
as long as ffmpeg (with ffprobe) is installed system-wide.

## Size note

A full ffmpeg build is ~80MB. For the installer, consider using a minimal
build (just libmp3lame + core codecs) to reduce size. The BtbN `gpl` builds
include everything; `lgpl` builds are smaller.
