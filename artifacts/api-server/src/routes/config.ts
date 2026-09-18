import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Public, non-secret configuration the SPA needs at runtime. */
router.get("/config", (_req, res) => {
  res.json({
    stripePublishableKey:
      process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      null,
  });
});

export default router;
