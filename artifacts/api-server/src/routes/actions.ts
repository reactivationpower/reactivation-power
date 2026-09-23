import { Router, type IRouter, type Request, type Response } from "express";
import { runWithRequestContext } from "../lib/request-context";
import { isNotFoundSignal, isRedirectSignal } from "../shims/next-navigation";
import { participantIfBillingAllows } from "../lib/data/participants";
import { logger } from "../lib/logger";
import * as adminAuth from "../actions/admin-auth";
import * as adminTeam from "../actions/admin-team";
import * as adminViewAs from "../actions/admin-view-as";
import * as admin from "../actions/admin";
import * as auth from "../actions/auth";
import * as billing from "../actions/billing";
import * as booking from "../actions/booking";
import * as demo from "../actions/demo";
import * as leads from "../actions/leads";
import * as leadFollowUp from "../actions/lead-followup";
import * as mail from "../actions/mail";
import * as payments from "../actions/payments";
import * as reactivation from "../actions/reactivation";
import * as subscriptions from "../actions/subscriptions";
import { getAdminSessionFromRequest, satisfies } from "../lib/auth/admin-session";
import { SESSION_COOKIE_NAME, decodeSession } from "../lib/auth/token";
import * as agreements from "../actions/agreements";
import * as commissions from "../actions/commissions";
import * as customerBilling from "../actions/customer-billing";
import * as cron from "../actions/cron";

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
 * requirement ("public" | "portal" | "admin" | "super_admin") enforced before
 * the action runs. "admin" is any active admin (super admin or sales rep);
 * "super_admin" is super admins only.
 * In Next.js these functions were only reachable from proxy-protected pages;
 * over HTTP every action must be gated explicitly. Actions additionally keep
 * their own finer-grained checks (participant ownership, demo account, ...).
 */
type ActionFn = (...args: unknown[]) => Promise<unknown>;
type ActionModule = Record<string, unknown>;

const MODULES: Record<string, ActionModule> = {
  "admin-auth": adminAuth,
  "admin-team": adminTeam,
  "admin-view-as": adminViewAs,
  admin,
  auth,
  billing,
  booking,
  commissions,
  cron,
  "customer-billing": customerBilling,
  demo,
  leads,
  "lead-followup": leadFollowUp,
  mail,
  payments,
  reactivation,
  subscriptions,
  agreements,
};

type Auth = "public" | "portal" | "admin" | "super_admin";

/** Allow-list: module -> action -> required auth. Anything else is 404. */
const ACTIONS: Record<string, Record<string, Auth>> = {
  "admin-auth": {
    adminLogin: "public", completeAdminInvite: "public", adminLogout: "public",
    getCurrentAdmin: "admin",
  },
  "admin-team": {
    listTeam: "super_admin", inviteTeamMember: "super_admin", updateTeamMember: "super_admin",
    setTeamMemberActive: "super_admin", getTeamInviteLink: "super_admin", resendTeamInvite: "super_admin",
  },
  mail: { listTransactionalTemplates: "super_admin", sendTestEmail: "super_admin", listEmailLog: "super_admin" },
  "admin-view-as": { viewAsParticipant: "super_admin" },
  cron: { listCronJobs: "super_admin", runCronJobNow: "super_admin" },
  auth: { login: "public", logout: "public" },
  billing: {
    // Admin billing actions on a customer record (each stamps the acting admin).
    refundPayment: "admin", cancelSubscription: "admin", resumeSubscription: "admin",
    changeBillingDate: "admin", retryCustomerPayment: "admin",
  },
  booking: { getAvailability: "public", bookStrategyCall: "public" },
  "customer-billing": {
    // Public, emailed-token billing page (works while access is paused).
    requestBillingLink: "public", getBillingByToken: "public",
    startCardUpdateByToken: "public", recordCardByToken: "public", payBalanceByToken: "public",
    // Signed-in owner on /portal/billing.
    getMyBilling: "portal", startMyCardUpdate: "portal", recordMyCard: "portal",
    payMyBalance: "portal", cancelMyAgreement: "portal",
    // Admin: email the customer an "add a new card" link.
    sendCardUpdateLink: "admin",
  },
  commissions: {
    // Reps are scoped to their own entries inside listCommissions.
    listCommissions: "admin",
    overrideCommission: "super_admin", setCommissionsPaid: "super_admin", generateMissingCommissions: "super_admin",
  },
  leads: { lookupZip: "public", submitHealthcareLead: "public" },
  "lead-followup": {
    // Each action also checks the account holds the Lead Follow-Up product.
    createCampaign: "portal", updateCampaign: "portal", setCampaignStatus: "portal", importLeads: "portal",
  },
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
  subscriptions: {
    // Token-based public two-card subscription checkout.
    getSubscriptionCheckoutState: "public",
    recordPrimaryCard: "public",
    recordSecondaryCard: "public",
  },
  agreements: {
    // Public signing page (agreement token in the URL is the credential).
    getAgreementPublic: "public",
    getAgreementVersion: "public",
    recordAgreementInitials: "public",
    signAgreement: "public",
    getAgreementCheckout: "public",
    recordAgreementPrimaryCard: "public",
    recordAgreementSecondaryCard: "public",
    recordAgreementPaymentFailure: "public",
    // Admin (each also calls requireAdmin()).
    getAgreementSendForm: "admin",
    previewAgreement: "admin",
    sendAgreement: "admin",
    updateAgreement: "admin",
    resendAgreement: "admin",
    listAgreements: "admin",
    getAgreementDetail: "admin",
    getAgreementForLink: "admin",
  },
  admin: {
    createCourse: "super_admin", updateCourse: "super_admin", deleteCourse: "super_admin",
    createModule: "super_admin", updateModule: "super_admin", deleteModule: "super_admin", moveModule: "super_admin",
    createVideo: "super_admin", updateVideo: "super_admin", deleteVideo: "super_admin", moveVideo: "super_admin",
    addAttachment: "super_admin", deleteAttachment: "super_admin",
    createParticipant: "super_admin", updateParticipant: "super_admin", deleteParticipant: "super_admin",
    setCourseAccess: "super_admin", setNicheAccess: "super_admin", setProductAccess: "super_admin",
  },
  reactivation: {
    // Global niche / script management (admin area).
    createNiche: "super_admin", updateNiche: "super_admin", deleteNiche: "super_admin",
    updateMasterScript: "super_admin", saveScriptSection: "super_admin",
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

async function isAuthorized(req: Request, auth: Auth): Promise<boolean> {
  if (auth === "public") return true;
  if (auth === "admin" || auth === "super_admin") {
    const session = await getAdminSessionFromRequest(req);
    return Boolean(session && satisfies(session.role, auth));
  }
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const session = token ? decodeSession(token) : null;
  if (!session) return false;
  // Portal RPC is also closed to accounts shut off for billing.
  const participant = await participantIfBillingAllows(session);
  return Boolean(participant && participant !== "blocked");
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
  if (!(await isAuthorized(req, auth))) {
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
