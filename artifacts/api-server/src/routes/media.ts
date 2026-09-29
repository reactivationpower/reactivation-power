import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BlobNotFoundError, get, head } from "@vercel/blob";
import { Router, type IRouter, type Request, type Response } from "express";
import { getAllowedSession } from "@/lib/data/participants";
import { getAdminSessionFromRequest } from "@/lib/auth/admin-session";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";

const router: IRouter = Router();

type ByteRange = { start: number; end: number };

/** Only single byte ranges are supported by the private Blob proxy. A bad or
 * unsatisfiable range gets a 416, rather than accidentally downloading a whole
 * video or returning a partial body with a full-response header. */
export function parseMediaRange(header: string, size: number): ByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const startPart = match[1] ? Number(match[1]) : null;
  const endPart = match[2] ? Number(match[2]) : null;
  if ((startPart !== null && !Number.isSafeInteger(startPart)) ||
      (endPart !== null && !Number.isSafeInteger(endPart))) return null;
  if (startPart === null) {
    if (!endPart) return null;
    return { start: Math.max(0, size - endPart), end: size - 1 };
  }
  if (startPart >= size || (endPart !== null && endPart < startPart)) return null;
  return { start: startPart, end: Math.min(endPart ?? size - 1, size - 1) };
}

function matchesIfRange(value: string | undefined, etag: string, uploadedAt: Date): boolean {
  if (!value) return true;
  // Weak ETags must never match If-Range.
  if (value.startsWith('W/')) return false;
  if (value.startsWith('"')) return value === etag;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && uploadedAt.getTime() <= date.getTime() + 999;
}

/** Vercel's private GET can report /2 (the chunk length) instead of /150MB
 * (the file length) on Safari's bytes=0-1 probe. Validate the *actual*
 * returned slice against an authoritative HEAD, then build our own 206
 * headers. Never "fix" an incorrect offset or a short body by relabeling it. */
function validUpstreamRange(headers: Headers, requested: ByteRange): boolean {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(headers.get("content-range") ?? "");
  const expectedLength = requested.end - requested.start + 1;
  return Boolean(match &&
    Number(match[1]) === requested.start && Number(match[2]) === requested.end &&
    Number(headers.get("content-length")) === expectedLength);
}

router.get("/media", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    const pathname = typeof req.query.pathname === "string" ? req.query.pathname : "";
    // Admin UI passes ?admin=1 for cache separation only; access is decided by the cookie.
    const isAdmin = Boolean(await getAdminSessionFromRequest(req));

    if (!pathname) {
      res.status(400).json({ error: "Missing pathname" });
      return;
    }
    // Portal viewers must be active and not shut off for billing — a paused
    // account keeps its cookie but must not keep streaming paid content.
    if (!isAdmin && !(await getAllowedSession())) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rawRange = req.get("range");
    const abort = new AbortController();
    const onClose = () => abort.abort();
    res.once("close", onClose);
    try {
      let requested: ByteRange | null = null;
      let metadata: Awaited<ReturnType<typeof head>> | null = null;
      if (rawRange) {
        metadata = await head(pathname, { abortSignal: abort.signal });
        if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) {
          throw new Error("Blob returned an invalid file size");
        }
        if (matchesIfRange(req.get("if-range"), metadata.etag, metadata.uploadedAt)) {
          requested = parseMediaRange(rawRange, metadata.size);
          if (!requested) {
            res.status(416).set({
              "Content-Range": `bytes */${metadata.size}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "private, no-cache",
            }).end();
            return;
          }
        }
      }

      let result: Awaited<ReturnType<typeof get>> = null;
      // Retry a wrong slice once without the private Blob cache. Correct
      // offsets/length are essential; correcting only the total is safe.
      for (let attempt = 0; attempt < (requested ? 2 : 1); attempt++) {
        result = await get(pathname, {
          access: "private",
          ifNoneMatch: rawRange ? undefined : req.get("if-none-match"),
          headers: requested ? { Range: `bytes=${requested.start}-${requested.end}` } : undefined,
          useCache: attempt === 1 ? false : undefined,
          abortSignal: abort.signal,
        });
        if (!result || result.statusCode === 304 || !requested) break;
        if (validUpstreamRange(result.headers, requested) &&
            (!metadata?.etag || !result.blob.etag || result.blob.etag === metadata.etag)) break;
        await result.stream.cancel();
        result = null;
      }
      if (!result) {
        if (!requested) {
          res.status(404).send("Not found");
        } else {
          logger.error({ pathname, range: rawRange }, "private blob returned a wrong media slice");
          res.status(502).json({ error: "Video stream returned an invalid range. Please retry." });
        }
        return;
      }
      if (result.statusCode === 304) {
        res.status(304).set({
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        }).end();
        return;
      }

      const contentLength = requested
        ? requested.end - requested.start + 1
        : result.blob.size;
      const responseHeaders: Record<string, string> = {
        "Content-Type": metadata?.contentType || result.blob.contentType || "application/octet-stream",
        ETag: metadata?.etag || result.blob.etag,
        "Cache-Control": "private, no-cache",
        "Accept-Ranges": "bytes",
        "Content-Length": String(contentLength),
      };
      if (requested && metadata) {
        responseHeaders["Content-Range"] = `bytes ${requested.start}-${requested.end}/${metadata.size}`;
      }
      res.status(requested ? 206 : 200).set(responseHeaders);
      const download = typeof req.query.download === "string" ? req.query.download : "";
      if (download) {
        res.set("Content-Disposition", `attachment; filename="${download.replace(/"/g, "")}"`);
      }
      let delivered = 0;
      const countBytes = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          delivered += chunk.length;
          if (delivered > contentLength) {
            callback(new Error("Media stream exceeded its declared length"));
          } else {
            callback(null, chunk);
          }
        },
        flush(callback) {
          callback(delivered === contentLength ? null : new Error("Media stream ended before its declared length"));
        },
      });
      // pipeline closes the private upstream on client disconnect. Never
      // buffer a whole training video in server memory.
      await pipeline(Readable.fromWeb(result.stream), countBytes, res);
    } catch (err) {
      if (!res.destroyed && !abort.signal.aborted) {
        logger.error({ err, pathname }, "error serving media");
        if (!res.headersSent) res.status(err instanceof BlobNotFoundError ? 404 : 500)
          .json({ error: err instanceof BlobNotFoundError ? "Not found" : "Failed to serve file" });
        else res.destroy(err instanceof Error ? err : undefined);
      }
    } finally {
      res.off("close", onClose);
    }
  });
});

export default router;