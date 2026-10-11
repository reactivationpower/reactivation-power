---
name: Embedded video start hold
description: Why the 8 Replit Animation videos start paused when embedded, and how a still first frame is held without breaking exports.
---

All 8 video artifacts start paused and silent when embedded (Design tab canvas, workspace preview); the top-level page (export/recording scripts) still autoplays with sound.
**Why:** the user saw all 8 videos autoplay with sound at once in the Design tab.

**How to apply:**
- Pausing the scene clock is not enough for "nothing moves": framer-motion's independent-transform tweens are JS-driven, so `document.getAnimations()` never sees them. The hold sets `MotionGlobalConfig.skipAnimations` (entrance animations jump to their final frame), then the first Play releases it and remounts the player so the scene replays from its first frame.
- Any new video artifact or new player wrapper must keep the hold gated on `window.self !== window.top`, or exports stop playing on their own.
- The `src/lib/video` folder is identical in all 8 artifacts; edit one and copy it to the rest.
- Verify with headless Chromium over CDP: host page on `localhost:80/api/healthz` with `document.write` of a same-origin iframe, so the iframe's audio/DOM can be inspected directly.
