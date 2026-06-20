# Bundled FFmpeg

This directory holds the ffmpeg binary bundled into the installer so users
don't need to install ffmpeg separately.

## Layout

```
bundled-ffmpeg/
  win32-x64/
    ffmpeg.exe
  darwin-arm64/
    ffmpeg
  darwin-x64/
    ffmpeg
  linux-x64/
    ffmpeg
```

## How to populate

### Windows (win32-x64)

Download a static build from https://www.gyan.dev/ffmpeg/builds/ (or
https://github.com/BtbN/FFmpeg-Builds/releases). Copy `ffmpeg.exe` into
`win32-x64/`.

```powershell
# Example using BtbN build
Invoke-WebRequest -Uri "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" -OutFile ffmpeg.zip
Expand-Archive ffmpeg.zip -DestinationPath ffmpeg-tmp
Copy-Item ffmpeg-tmp\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe resources\bundled-ffmpeg\win32-x64\
```

### macOS

```bash
# arm64
curl -L https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip -o ffmpeg.zip
unzip ffmpeg.zip -d resources/bundled-ffmpeg/darwin-arm64/
chmod +x resources/bundled-ffmpeg/darwin-arm64/ffmpeg
```

### Linux

```bash
# Static build from johnvansickle.com
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar xJ
cp ffmpeg-*-amd64-static/ffmpeg resources/bundled-ffmpeg/linux-x64/
chmod +x resources/bundled-ffmpeg/linux-x64/ffmpeg
```

## Fallback

When the bundled binary is missing (e.g. dev mode), `getBundledFfmpegPath()`
returns null and the caller falls back to `ffmpeg` on system PATH. This means
developers can run without populating this directory as long as ffmpeg is
installed system-wide.

## Size note

A full ffmpeg build is ~80MB. For the installer, consider using a minimal
build (just libmp3lame + core codecs) to reduce size. The BtbN `gpl` builds
include everything; `lgpl` builds are smaller.
