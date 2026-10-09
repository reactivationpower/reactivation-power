import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { MAX_MEDIA_RANGE_BYTES, matchesIfRange, parseMediaRange } from "../lib/media-range";
import { logger } from "../lib/logger";

// Deliberately not a filesystem path supplied by a client.
export const PUBLIC_VIDEOS = [
  "patient-pipeline-introduction.mp4",
  "patient-pipeline-walkthrough.mp4",
  "patient-pipeline-walkthrough-preview.mp4",
] as const;

export function publicMediaRouter(directory = path.resolve(import.meta.dirname, "public-videos")) {
  const router = Router();
  router.get("/public-media/:name", async (req, res) => {
    if (!(PUBLIC_VIDEOS as readonly string[]).includes(req.params.name)) {
      res.sendStatus(404);
      return;
    }
    try {
      const filename = path.join(directory, req.params.name);
      const info = await stat(filename);
      const etag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
      res.set({
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Last-Modified": info.mtime.toUTCString(),
        ETag: etag,
      });
      // HEAD describes the complete representation and never reads its body.
      if (req.method === "HEAD") {
        res.set("Content-Length", String(info.size)).end();
        return;
      }
      if (req.get("if-none-match")?.split(/\s*,\s*/).some(v => v === "*" || v.replace(/^W\//, "") === etag)) {
        res.status(304).end();
        return;
      }
      const rawRange = req.get("range");
      const usableRange = rawRange && matchesIfRange(req.get("if-range"), etag, info.mtime);
      const range = usableRange ? parseMediaRange(rawRange, info.size) : null;
      if (usableRange && !range) {
        res.status(416).set("Content-Range", `bytes */${info.size}`).end();
        return;
      }
      // A full 200 cannot cross the deployment proxy for a large video.
      // Never invent a 206 without Range, or label the first chunk a full file.
      if (!range && info.size > MAX_MEDIA_RANGE_BYTES) {
        res.status(400).set("Cache-Control", "no-store").json({
          error: "This video requires byte-range playback. Retry with Range: bytes=0- and without If-Range.",
          code: "MEDIA_RANGE_REQUIRED",
        });
        return;
      }
      res.status(range ? 206 : 200).set("Content-Length", String(range ? range.end - range.start + 1 : info.size));
      if (range) res.set("Content-Range", `bytes ${range.start}-${range.end}/${info.size}`);
      await pipeline(createReadStream(filename, range ?? undefined), res);
    } catch (error) {
      if (res.destroyed) return;
      logger.error({ error }, "Public video delivery failed");
      if (res.headersSent) res.destroy();
      else res.status(503).set("Cache-Control", "no-store").json({ error: "Video temporarily unavailable. Please retry." });
    }
  });
  return router;
}

export default publicMediaRouter();
