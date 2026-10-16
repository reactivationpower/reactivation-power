#!/usr/bin/env bash
set -euo pipefail

# Privacy-only derivatives of actual seeded chiro-demo screenshots generated
# by capture-demo.mjs. Never cover the application's Patient Pipeline logo.
images="$(cd "$(dirname "$0")/../public/images" && pwd)"
font="$(fc-match -f '%{file}' 'DejaVu Sans:style=Bold')"
regular="$(fc-match -f '%{file}' 'DejaVu Sans')"

# Hide the recording-specific demo account chrome, not product branding.
# Source campaign titles are reflowed by the capture browser (genuine UI text).
magick "$images/rev-campaigns-source.png" \
  -fill '#e3edf1' -stroke none -draw 'rectangle 0,0 1279,53' \
  -font "$font" -pointsize 17 -fill '#273849' \
  -annotate +27+35 'Ridgeline Chiropractic & Wellness' \
  -font "$regular" -pointsize 14 -fill '#547181' \
  -annotate +1000+35 'Demo campaigns' \
  "$images/patient-campaigns.png"

# Queue and caller names and 555-01xx phones are staged in the live browser
# DOM before capture, with no mutation of persisted demo or customer records.
for name in queue live-open live-question live-still-good fine-choice fine-result live-back-result; do
  cp "$images/rev-$name.png" "$images/patient-$name.png"
done

# The genuine modal has the sample-file panels hidden in-browser for the
# film, its real niche list expanded, and an authentic locally parsed CSV
# preview. Do not paint synthetic drop zones, tags, or matching controls.
for pair in \
  'rev-contacts.png:patient-contacts.png' \
  'rev-upload-dialog.png:patient-upload-drop.png' \
  'rev-upload-preview.png:patient-upload-preview.png'; do
  source="${pair%%:*}"
  target="${pair#*:}"
  magick "$images/$source" \
    -fill '#e3edf1' -stroke none -draw 'rectangle 0,0 1279,53' \
    -font "$font" -pointsize 14 -fill '#314859' \
    -annotate +72+29 'Ridgeline Chiropractic & Wellness' \
    -font "$regular" -pointsize 13 -fill '#547181' \
    -annotate +1035+29 'Illustrative contacts' \
    "$images/$target"
done