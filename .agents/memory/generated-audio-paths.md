---
name: Generated audio paths
description: A non-obvious media-generation filename behavior that can leave old narration in a video mix.
---

An audio-generation request to replace an existing filename may save a suffixed sibling instead, even when overwrite is requested. The callback's returned `filePath` is authoritative, not the requested output path.

**Why:** A replacement voiceover arrived at a suffixed path while the previous file remained in place. Remixing by the originally requested filename would silently retain the old spoken wording.

**How to apply:** After generating replacement narration, check the returned path and audio duration, then use that actual file in the mix (or explicitly copy it over the intended source). Give the rebuilt composite a new served URL so a preview cannot replay cached narration.