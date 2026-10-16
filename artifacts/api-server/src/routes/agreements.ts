import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";
import { getOrCreatePdf, isSigned, loadAgreementByToken, pdfFileName } from "@/lib/agreements/store";

const router: IRouter = Router();

/** Public PDF download for a signed agreement (the token is the credential). */
router.get("/agreements/:token/pdf", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    const token = String(req.params.token);
    try {
      const loaded = await loadAgreementByToken(token);
      if (!loaded) {
        res.status(404).send("Not found");
        return;
      }
      if (!isSigned(loaded.agreement)) {
        res.status(409).send("This agreement has not been signed yet.");
        return;
      }
      const bytes = await getOrCreatePdf(loaded);
      const inline = req.query.inline === "1";
      res
        .status(200)
        .set({
          "Content-Type": "application/pdf",
          "Content-Length": String(bytes.length),
          "Cache-Control": "private, no-store",
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${pdfFileName(loaded)}"`,
        })
        .send(bytes);
    } catch (err) {
      logger.error({ err, token }, "agreement pdf failed");
      if (!res.headersSent) res.status(500).send("Could not generate the PDF");
    }
  });
});

export default router;
