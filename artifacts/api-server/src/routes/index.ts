import { Router, type IRouter } from "express";
import healthRouter from "./health";
import actionsRouter from "./actions";
import pagesRouter from "./pages";
import adminEmailsRouter from "./admin-emails";
import cronRouter from "./cron";
import mediaRouter from "./media";
import progressRouter from "./progress";
import templatesRouter from "./templates";
import uploadRouter from "./upload";
import configRouter from "./config";
import webhooksResendRouter from "./webhooks-resend";
import webhooksStripeRouter from "./webhooks-stripe";
import agreementsRouter from "./agreements";

const router: IRouter = Router();

router.use(healthRouter);
router.use(actionsRouter);
router.use(pagesRouter);
router.use(adminEmailsRouter);
router.use(cronRouter);
router.use(mediaRouter);
router.use(agreementsRouter);
router.use(progressRouter);
router.use(templatesRouter);
router.use(uploadRouter);
router.use(configRouter);
router.use(webhooksResendRouter);
router.use(webhooksStripeRouter);

export default router;
