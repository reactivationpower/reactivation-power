---
name: Generated audio paths
description: Generated audio filename behavior, playback cache safety, and large timestamped-response batching limits.
---

An audio-generation request to replace an existing filename may save a suffixed sibling instead, even when overwrite is requested. The callback's returned `filePath` is authoritative, not the requested output path.

**Why:** A replacement voiceover arrived at a suffixed path while the previous file remained in place. Remixing by the originally requested filename would silently retain the old spoken wording.

**How to apply:** After generating replacement narration, check the returned path and audio duration, then use that actual file in the mix (or explicitly copy it over the intended source). Give the rebuilt composite a new served URL so a preview cannot replay cached narration.

Keep timestamped ElevenLabs requests to at most three audio responses in each CodeExecution block, and persist a manifest after each small batch.

**Why:** Six responses exceeded the notebook's 32 MiB snapshot limit; a longer loop did so even after clearing response bodies. Generated audio and alignment files were still saved, but notebook variables and pending jobs were reset. Three-response blocks completed reliably.

**How to apply:** Use a file-backed manifest instead of retaining base64 responses or callback closures across blocks. After a notebook reset, inspect the saved manifest before retrying; do not charge for regenerating already-saved takes. Explain the distinction between a local processing failure and a provider failure when asked.