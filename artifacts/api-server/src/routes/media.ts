import { Readable } from "node:stream";
import { get } from "@vercel/blob";
import { Router, type IRouter, type Request, type Response } from "express";
import { getSession } from "@/lib/auth/session";
import { ADMIN_COOKIE_NAME, decodeAdminSession } from "@/lib/auth/admin-token";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";

const router: IRouter = Router();

router.get("/media", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    const pathname = typeof req.query.pathname === "string" ? req.query.pathname : "";
    // Admin UI passes ?admin=1 for cache separation only; access is decided by the cookie.
    const adminToken = req.cookies?.[ADMIN_COOKIE_NAME] as string | undefined;
    const isAdmin = Boolean(adminToken && decodeAdminSession(adminToken));

    if (!pathname) {
      res.status(400).json({ error: "Missing pathname" });
      return;
    }
    if (!isAdmin && !(await getSession())) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const range = req.get("range");
    try {
      const result = await get(pathname, {
        access: "private",
        ifNoneMatch: range ? undefined : req.get("if-none-match"),
        headers: range ? { Range: range } : undefined,
      });
      if (!result) {
        res.status(404).send("Not found");
        return;
      }
      if (result.statusCode === 304) {
        res.status(304).set({
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        }).end();
        return;
      }

      const contentRange = result.headers.get("content-range");
      const contentLength = result.headers.get("content-length");
      const isPartial = Boolean(range && contentRange);
      const responseHeaders: Record<string, string> = {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
        "Accept-Ranges": "bytes",
      };
      if (isPartial && contentRange) {
        responseHeaders["Content-Range"] = contentRange;
        if (contentLength) responseHeaders["Content-Length"] = contentLength;
      } else {
        responseHeaders["Content-Length"] = String(result.blob.size);
      }
      res.status(isPartial ? 206 : 200).set(responseHeaders);
      const download = typeof req.query.download === "string" ? req.query.download : "";
      if (download) {
        res.set("Content-Disposition", `attachment; filename="${download.replace(/"/g, "")}"`);
      }
      Readable.fromWeb(result.stream).on("error", (err) => {
        logger.error({ err, pathname }, "media stream failed");
        res.destroy(err instanceof Error ? err : undefined);
      }).pipe(res);
    } catch (err) {
      logger.error({ err, pathname }, "error serving media");
      if (!res.headersSent) res.status(500).json({ error: "Failed to serve file" });
    }
  });
});

export default router;