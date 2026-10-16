import { put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import Busboy from "busboy";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";
import { getAdminSessionFromRequest } from "@/lib/auth/admin-session";
import { readIdleSession } from '@/lib/auth/idle-session';
import { describeMegabytes, MAX_SERVER_UPLOAD_BYTES } from "@/lib/request-limits";
export { MAX_SERVER_UPLOAD_BYTES } from "@/lib/request-limits";

/** Uploads (course media) are only performed by super admins from the admin UI. */
async function isAdmin(req: Request): Promise<boolean> {
  const session = await getAdminSessionFromRequest(req);
  return session?.role === "super_admin";
}

const router: IRouter = Router();

interface MultipartUpload {
  bytes: Buffer;
  fileName: string;
  fileType: string;
  kind?: string;
}

/**
 * The admin UI uploads every file straight from the browser to Vercel Blob
 * with a token from `/upload/token`; that path has no practical size limit.
 * This server-side fallback buffers the whole body inside one request, which
 * a Vercel function caps at 4.5 MB, so it only accepts small files.
 */
export const UPLOAD_TOO_LARGE_MESSAGE =
  `Files larger than ${describeMegabytes(MAX_SERVER_UPLOAD_BYTES)} cannot be sent through the server. ` +
  "Upload from the admin page, which sends the file directly to storage.";

class UploadTooLargeError extends Error {
  constructor() {
    super(UPLOAD_TOO_LARGE_MESSAGE);
  }
}

/** Reject an oversized upload from its declared length before reading any of it. */
function declaredTooLarge(req: Request): boolean {
  const declared = Number(req.get("content-length"));
  return Number.isFinite(declared) && declared > MAX_SERVER_UPLOAD_BYTES;
}

function readBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_SERVER_UPLOAD_BYTES) {
        // Stop buffering but keep the connection so the 413 reaches the sender.
        chunks.length = 0;
        req.pause();
        reject(new UploadTooLargeError());
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readMultipart(req: Request): Promise<MultipartUpload | null> {
  return new Promise((resolve, reject) => {
    const parser = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_SERVER_UPLOAD_BYTES, fields: 5 },
    });
    let file: MultipartUpload | null = null;
    let kind: string | undefined;
    const pending: Promise<void>[] = [];

    parser.on("field", (name, value) => {
      if (name === "kind") kind = value;
    });
    parser.on("file", (name, stream, info) => {
      if (name !== "file") {
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      pending.push(new Promise((done, fail) => {
        stream.on("limit", () => {
          // Stop parsing but keep the connection so the 413 reaches the sender.
          chunks.length = 0;
          req.unpipe(parser);
          req.pause();
          reject(new UploadTooLargeError());
          done(); // settles the part so a later "close" cannot leave a dangling rejection
        });
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          file = {
            bytes: Buffer.concat(chunks),
            fileName: info.filename,
            fileType: info.mimeType,
          };
          done();
        });
        stream.on("error", fail);
      }));
    });
    parser.on("close", () => {
      void Promise.all(pending).then(() => {
        if (file) file.kind = kind;
        resolve(file);
      }, reject);
    });
    parser.on("error", reject);
    req.pipe(parser);
  });
}

router.post("/upload/token", async (req: Request, res: Response) => {
  if (!(await isAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await runWithRequestContext(req, res, async () => {
    try {
      const jsonResponse = await handleUpload({
        request: req,
        body: req.body as HandleUploadBody,
        onBeforeGenerateToken: async (pathname) => {
          const session = await getAdminSessionFromRequest(req);
          const idle = session && await readIdleSession(session.sessionId, 'admin', session.userId);
          if (!idle || session?.role !== 'super_admin') throw new Error('Session expired');
          const allowedPrefixes = ["videos/", "attachments/", "thumbnails/"];
          if (!allowedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
            throw new Error("Invalid upload folder");
          }
          return {
            addRandomSuffix: true,
            maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
            // A retained direct-upload token must not outlive the issuing
            // session's acknowledged idle or absolute deadline.
            validUntil: idle.deadline,
          };
        },
      });
      res.json(jsonResponse);
    } catch (err) {
      logger.error({ err }, "upload token error");
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  });
});

router.post("/upload", async (req: Request, res: Response) => {
  if (!(await isAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await runWithRequestContext(req, res, async () => {
    try {
      if (declaredTooLarge(req)) throw new UploadTooLargeError();
      const queryKind = typeof req.query.kind === "string" ? req.query.kind : "video";
      const queryName = typeof req.query.name === "string" ? req.query.name : "";
      const contentType = req.get("content-type") ?? "application/octet-stream";

      if (contentType.startsWith("multipart/form-data")) {
        const file = await readMultipart(req);
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }
        const safeName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        if (!await isAdmin(req)) { res.status(401).json({ error: 'Session expired' }); return; }
        const blob = await put(`${file.kind ?? queryKind}s/${safeName}`, file.bytes, {
          access: "private",
          addRandomSuffix: true,
        });
        res.json({
          pathname: blob.pathname,
          fileName: file.fileName,
          fileSize: file.bytes.length,
          fileType: file.fileType,
        });
        return;
      }

      if (!queryName) {
        res.status(400).json({ error: "Missing file name" });
        return;
      }
      const body = await readBody(req);
      if (body.length === 0) {
        res.status(400).json({ error: "Empty file" });
        return;
      }
      const safeName = queryName.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!await isAdmin(req)) { res.status(401).json({ error: 'Session expired' }); return; }
      const blob = await put(`${queryKind}s/${safeName}`, body, {
        access: "private",
        addRandomSuffix: true,
        contentType,
      });
      res.json({
        pathname: blob.pathname,
        fileName: queryName,
        fileSize: body.length,
        fileType: contentType,
      });
    } catch (err) {
      if (err instanceof UploadTooLargeError) {
        res.status(413).set("Cache-Control", "no-store").json({
          error: err.message,
          code: "UPLOAD_TOO_LARGE",
          maxBytes: MAX_SERVER_UPLOAD_BYTES,
        });
        return;
      }
      logger.error({ err }, "upload error");
      res.status(500).json({ error: "Upload failed" });
    }
  });
});

export default router;