import { Router, type IRouter, type Request, type Response } from "express";
import { runWithRequestContext } from "../lib/request-context";
import { isNotFoundSignal, isRedirectSignal } from "../shims/next-navigation";
import { logger } from "../lib/logger";
import * as adminAuth from "../actions/admin-auth";
import * as admin from "../actions/admin";
import * as auth from "../actions/auth";
import * as booking from "../actions/booking";
import * as demo from "../actions/demo";
import * as leads from "../actions/leads";
import * as payments from "../actions/payments";
import * as reactivation from "../actions/reactivation";
import { ADMIN_COOKIE_NAME, decodeAdminSession } from "../lib/auth/admin-token";
import { SESSION_COOKIE_NAME, decodeSession } from "../lib/auth/token";

/**
 * RPC bridge for the former Next.js server actions.
 *
 *   POST /api/actions/:module/:fn   body: { args: unknown[] }
 *
 * Args are JSON. A FormData argument is encoded by the client as
 * { "__formData": [[name, value], ...] } and rebuilt here so the original
 * action code (formData.get(...)) runs unchanged. Responses:
 *   { ok: true, result }              normal return value
 *   { ok: true, redirect: "/path" }   the action called redirect()
 *   { ok: false, error }              thrown error
 *
 * Only actions listed in ACTIONS are callable, each behind a route-level auth
 * requirement ("public" | "portal" | "admin") enforced before the action runs.
 * In Next.js these functions were only reachable from proxy-protected pages;
 * over HTTP every action must be gated explicitly. Actions additionally keep
 * their own finer-grained checks (participant ownership, demo account, ...).
 */
type ActionFn = (...args: unknown[]) => Promise<unknown>;
type ActionModule = Record<string, unknown>;

const MODULES: Record<string, ActionModule> = {
  "admin-auth": adminAuth,
  admin,
  auth,
  booking,
  demo,
  leads,
  payments,
  reactivation,
};

type Auth = "public" | "portal" | "admin";

/** Allow-list: module -> action -> required auth. Anything else is 404. */
const ACTIONS: Record<string, Record<string, Auth>> = {
  "admin-auth": { adminLogin: "public", adminLogout: "public" },
  auth: { login: "public", logout: "public" },
  booking: { getAvailability: "public", bookStrategyCall: "public" },
  leads: { lookupZip: "public", submitHealthcareLead: "public" },
  demo: {
    enterDemo: "public",
    resetDemo: "portal",
    refreshDemoIfStale: "portal",
    switchDemoView: "portal",
  },
  payments: {
    // Token-based public checkout flow.
    startPaymentCheckout: "public",
    confirmPayment: "public",
    getPaymentLinkPublic: "public",
    // Admin management (these also call requireAdmin() internally).
    createPaymentLink: "admin",
    listPaymentLinks: "admin",
    getPaymentDetail: "admin",
    deletePaymentLink: "admin",
    provisionAccountsNow: "admin",
  },
  admin: {
    createCourse: "admin", updateCourse: "admin", deleteCourse: "admin",
    createModule: "admin", updateModule: "admin", deleteModule: "admin", moveModule: "admin",
    createVideo: "admin", updateVideo: "admin", deleteVideo: "admin", moveVideo: "admin",
    addAttachment: "admin", deleteAttachment: "admin",
    createParticipant: "admin", updateParticipant: "admin", deleteParticipant: "admin",
    setCourseAccess: "admin", setNicheAccess: "admin",
  },
  reactivation: {
    // Global niche / script management (admin area).
    createNiche: "admin", updateNiche: "admin", deleteNiche: "admin",
    updateMasterScript: "admin", saveScriptSection: "admin",
    // Account-scoped (each action resolves the participant from the session).
    createStage: "portal", moveStage: "portal", deleteStage: "portal",
    createContact: "portal", updateContact: "portal", deleteContact: "portal",
    bulkDeleteContacts: "portal", bulkAssignNiche: "portal", setDefaultNiche: "portal",
    importContacts: "portal", setCallBatchSize: "portal", addMoreCalls: "portal",
    setSelectedNiche: "portal", setPracticeName: "portal", setOfficePhone: "portal",
    addTeamMember: "portal", setTeamMemberActive: "portal", updateTeamMember: "portal",
    updateMyProfile: "portal", logCall: "portal",
  },
};

function isAuthorized(req: Request, auth: Auth): boolean {
  if (auth === "public") return true;
  if (auth === "admin") {
    const token = req.cookies?.[ADMIN_COOKIE_NAME] as string | undefined;
    return Boolean(token && decodeAdminSession(token));
  }
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  return Boolean(token && decodeSession(token));
}

function decodeArg(arg: unknown): unknown {
  if (arg && typeof arg === "object" && "__formData" in arg) {
    const fd = new FormData();
    for (const [k, v] of (arg as { __formData: [string, string][] }).__formData) {
      fd.append(k, v);
    }
    return fd;
  }
  return arg;
}

const router: IRouter = Router();

router.post("/actions/:module/:fn", async (req: Request, res: Response) => {
  const moduleName = req.params.module as string;
  const fnName = req.params.fn as string;
  const auth = ACTIONS[moduleName]?.[fnName];
  const fn = auth ? MODULES[moduleName]?.[fnName] : undefined;
  if (!auth || typeof fn !== "function") {
    res.status(404).json({ ok: false, error: "Unknown action" });
    return;
  }
  if (!isAuthorized(req, auth)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const rawArgs = Array.isArray(req.body?.args) ? (req.body.args as unknown[]) : [];
  const args = rawArgs.map(decodeArg);
  try {
    const result = await runWithRequestContext(req, res, () => (fn as ActionFn)(...args));
    res.json({ ok: true, result: result === undefined ? null : result });
  } catch (err) {
    if (isRedirectSignal(err)) {
      res.json({ ok: true, result: null, redirect: err.location });
      return;
    }
    if (isNotFoundSignal(err)) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    logger.error({ err, module: req.params.module, fn: req.params.fn }, "action failed");
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Action failed" });
  }
});

export default router;
