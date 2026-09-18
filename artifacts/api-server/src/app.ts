import express, { type ErrorRequestHandler, type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
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
app.use(
  express.json({
    limit: "10mb",
    // Webhook signature checks (Resend/Svix) need the exact bytes received.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error({ err, method: req.method, path: req.path }, "unhandled request error");
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(500).json({
    error: err instanceof Error ? err.message : "Internal server error",
  });
};
app.use(errorHandler);

export default app;
