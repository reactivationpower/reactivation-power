import { Router, type IRouter } from "express";
import { getStripeMode, getStripePublishableKey } from "../lib/stripe";

const router: IRouter = Router();

/** Public, non-secret configuration the SPA needs at runtime. */
router.get("/config", (_req, res) => {
  const stripeMode = getStripeMode();
  res.json({
    stripePublishableKey: getStripePublishableKey(),
    stripeMode,
    stripeTestMode: stripeMode === "test",
  });
});

export default router;
