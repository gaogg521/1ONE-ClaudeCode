#!/usr/bin/env bash
# Fix openclaw skills symlink-escape: replace symlinks with real copies.
# Run once to unblock OpenClaw's symlink-escape security check.

OPENCLAW_SKILLS_DIR="$HOME/.openclaw/skills"

if [ ! -d "$OPENCLAW_SKILLS_DIR" ]; then
  echo "Directory not found: $OPENCLAW_SKILLS_DIR"
  exit 1
fi

fixed=0
skipped=0
errors=0

for entry in "$OPENCLAW_SKILLS_DIR"/*; do
  name=$(basename "$entry")
  if [ -L "$entry" ]; then
    real=$(realpath "$entry" 2>/dev/null)
    if [ -z "$real" ] || [ ! -d "$real" ]; then
      echo "[SKIP] $name — broken symlink (target not found)"
      ((skipped++))
      continue
    fi
    echo "[FIX]  $name — replacing symlink -> $real"
    rm "$entry"
    if cp -r "$real" "$entry"; then
      ((fixed++))
    else
      echo "[ERR]  $name — cp failed"
      ((errors++))
    fi
  fi
done

echo ""
echo "Done: fixed=$fixed skipped=$skipped errors=$errors"
