import { put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import Busboy from "busboy";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";
import { getAdminSessionFromRequest } from "@/lib/auth/admin-session";
import { readIdleSession } from '@/lib/auth/idle-session';

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

/** Server-side fallback uploads are buffered; large videos go direct-to-Blob. */
const MAX_SERVER_UPLOAD_BYTES = 100 * 1024 * 1024;

class UploadTooLargeError extends Error {
  constructor() {
    super(`Upload exceeds ${MAX_SERVER_UPLOAD_BYTES / (1024 * 1024)} MB; use the direct upload path.`);
  }
}

function readBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_SERVER_UPLOAD_BYTES) {
        req.destroy();
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
        stream.on("limit", () => fail(new UploadTooLargeError()));
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
        res.status(413).json({ error: err.message });
        return;
      }
      logger.error({ err }, "upload error");
      res.status(500).json({ error: "Upload failed" });
    }
  });
});

export default router;