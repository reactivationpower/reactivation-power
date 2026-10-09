import express, { type ErrorRequestHandler, type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import webhooksLeadsRouter from "./routes/webhooks-leads";
import marketingRouter from "./routes/marketing";
import { logger } from "./lib/logger";
import { redactSecretPath } from "./lib/redact-path";
import { respondDatabaseUnavailable } from "./lib/database-unavailable";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: redactSecretPath(req.url?.split("?")[0] ?? ""),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", true);
// The SPA is served from the same origin through the shared proxy, so no CORS
// is needed; credentialed cross-origin access is deliberately not allowed.
app.use(cookieParser());
// Lead intake URLs carry their own bounded body parser and must see the raw
// bytes: mounted ahead of the global parsers so a malformed or oversized body
// is still attributed to its campaign and shown on the Lead sources tab.
app.use("/api", webhooksLeadsRouter);
app.use("/api", marketingRouter);
app.use(
  express.json({
    limit: "10mb",
    // Webhook signature checks (Stripe, Resend/Svix) need the exact bytes received.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    res.end();
    return;
  }
  // body-parser rejections (malformed JSON, oversized body) carry a 4xx status:
  if (respondDatabaseUnavailable(err, res)) return;
  // the sender's fault, not ours.
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), method: req.method, path: redactSecretPath(req.path) }, "request rejected");
    res.status(status).json({ error: status === 400 ? "The request body could not be parsed." : err instanceof Error ? err.message : "Bad request" });
    return;
  }
  logger.error({ err, method: req.method, path: redactSecretPath(req.path) }, "unhandled request error");
  res.status(500).json({
    error: err instanceof Error ? err.message : "Internal server error",
  });
};
app.use(errorHandler);

export default app;
