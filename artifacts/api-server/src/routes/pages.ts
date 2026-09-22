import { Router, type IRouter, type Request, type Response } from "express";
import { runWithRequestContext } from "../lib/request-context";
import { isNotFoundSignal, isRedirectSignal, notFound, redirect } from "../shims/next-navigation";
import { logger } from "../lib/logger";
import { adminHomeFor, getAdminSessionFromRequest, satisfies } from "../lib/auth/admin-session";
import { listAdminUsers } from "../lib/data/admin-users";
import { SESSION_COOKIE_NAME, decodeSession } from "../lib/auth/token";
import { clearSessionCookie, getSession } from "../lib/auth/session";
import { billingBlockForOwner } from "../lib/billing/dunning";
import { UPCOMING_WINDOW_DAYS, getBillingDashboard, parseDateRange } from "../lib/billing/dashboard";
import { getBillingByToken, getMyBilling } from "../actions/customer-billing";
import {
  accessOwnerId, getAliases, getCurrentParticipant, getParticipantById,
  getSessions, getStaffMembers,
} from "../lib/data/participants";
import {
  getAccessibleCourseIds, getAccessibleCourses, getAttachmentsForVideos,
  getCourseBySlug, getCourses, getCourseTree, getOwnerSectors,
} from "../lib/data/courses";
import { computeCourseState, getProgressForParticipant } from "../lib/data/progress";
import {
  formatDuration, getActivityEvents, getAllProgress, getDashboardStats,
  getMostWatchedVideos, getViewerRows,
} from "../lib/data/analytics";
import {
  getCallAnalytics, getNicheLeaders, getTrainingAudit, sameAccount,
} from "../lib/data/caller-analytics";
import {
  extractSlots, getAccessibleNicheIds, getAccountReactivationStats, getCallHistory,
  getCallQueue, getCallQueueState, getContact, getContacts, getMasterScript,
  getNiches, getOwnerNiches, getPipelineStages, getScriptFlow, getScriptSections,
  getServiceMappings, getTeamStats,
} from "../lib/data/reactivation";
import { getAdminClient } from "../lib/supabase/admin";
import { getStripeMode } from "../lib/stripe";
import { DEFAULT_CALL_BATCH_SIZE } from "../lib/types";
import { demoIsStale } from "../lib/demo/seed";
import { parseInactiveCount, parsePatientValue } from "../lib/opportunity";
import { publicServiceName } from "@workspace/niche-catalog";
import { DEFAULT_TIMEZONE, isUsTimezone, timezoneLabel } from "../lib/us-timezones";
import {
  confirmPayment, getPaymentDetail, getPaymentLinkPublic, listPaymentLinks,
} from "../actions/payments";
import {
  agreementTokenForLink, getAgreementDetail, getAgreementForLink, getAgreementPublic, listAgreements,
} from "../actions/agreements";
import { listCommissions } from "../actions/commissions";

type Loader = (req: Request) => Promise<Record<string, unknown>>;
type AuthKind = "portal" | "admin" | "super_admin" | undefined;
const router: IRouter = Router();

/**
 * The SPA page the loader is serving. The client sends its current location
 * as ?_path= (layout loaders like /admin/_layout otherwise have no page path);
 * fall back to the loader path.
 */
function originalPath(req: Request): string {
  const hinted = req.query._path;
  if (typeof hinted === "string" && /^\/(?![\/\\])/.test(hinted)) {
    return hinted;
  }
  return req.path.replace(/^\/pages/, "").replace(/\/_layout$/, "") || "/";
}

function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function add(path: string, auth: AuthKind, loader: Loader): void {
  router.get(`/pages${path}`, async (req, res) => {
    try {
      const result = await runWithRequestContext(req, res, async () => {
        if (auth === "portal") {
          const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
          if (!token || !decodeSession(token)) {
            redirect(`/login?next=${encodeURIComponent(originalPath(req))}`);
          }
        } else if (auth === "admin" || auth === "super_admin") {
          const session = await getAdminSessionFromRequest(req);
          if (!session) {
            redirect(`/admin-login?next=${encodeURIComponent(originalPath(req))}`);
          }
          // Sales reps only get the pages marked "admin"; everything else is
          // super-admin only and sends them to their landing page.
          if (!satisfies(session.role, auth)) redirect(adminHomeFor(session.role));
        }
        return loader(req);
      });
      res.json({ data: result });
    } catch (err) {
      if (isRedirectSignal(err)) {
        res.json({ redirect: err.location });
      } else if (isNotFoundSignal(err)) {
        res.status(404).json({ notFound: true });
      } else {
        logger.error({ err, page: originalPath(req) }, "page loader failed");
        res.status(500).json({ error: err instanceof Error ? err.message : "Page loader failed" });
      }
    }
  });
}

add("/portal/_layout", "portal", async () => {
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  const viewingAs = (await getSession())?.impersonatedBy ?? null;
  if (!participant.is_demo) return { participant, demo: null, viewingAs };
  const ownerId = accessOwnerId(participant);
  const supabase = getAdminClient();
  const [ownerRes, peopleRes] = await Promise.all([
    supabase.from("participants").select("id, demo_seeded_at").eq("id", ownerId).maybeSingle(),
    supabase.from("participants").select("id, first_name, last_name, role")
      .eq("is_demo", true).eq("is_active", true)
      .or(`id.eq.${ownerId},parent_id.eq.${ownerId}`)
      .order("role", { ascending: true }).order("first_name", { ascending: true }),
  ]);
  const seededAt = ownerRes.data?.demo_seeded_at ?? null;
  const identities = (peopleRes.data ?? []).map((x) => ({
    id: x.id, label: `${x.first_name} ${x.last_name}`, role: x.role === "owner" ? "owner" : "staff",
  }));
  const seededLabel = seededAt
    ? `Data refreshed ${new Date(seededAt).toLocaleString("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    })} ET`
    : "";
  return { participant, viewingAs, demo: { currentId: participant.id, identities, seededLabel, stale: !ownerRes.error && demoIsStale(seededAt) } };
});

add("/admin/_layout", "admin", async (req) => {
  const session = await getAdminSessionFromRequest(req);
  if (!session) redirect("/admin-login");
  return { admin: { userId: session.userId, email: session.email, name: session.name, role: session.role } };
});
add("/admin/emails", "super_admin", async (req) => {
  const session = await getAdminSessionFromRequest(req);
  return { adminEmail: session?.email ?? null };
});
add("/admin/landing", "super_admin", async () => ({}));
add("/admin/team", "super_admin", async (req) => {
  const session = await getAdminSessionFromRequest(req);
  return { members: await listAdminUsers(), currentUserId: session?.userId ?? null };
});

add("/login", undefined, async (req) => {
  const session = await getSession();
  if (session) {
    // A signed-in account that is shut off for billing lands here from the
    // portal; clear its cookie so it does not bounce back and forth.
    const participant = await getParticipantById(session.participantId);
    const block = participant && !participant.is_demo ? await billingBlockForOwner(accessOwnerId(participant)) : null;
    if (!block) redirect("/portal");
    await clearSessionCookie();
    return { next: queryString(req, "next"), billing: { reason: block.reason, status: block.status, email: block.email } };
  }
  return { next: queryString(req, "next"), billing: null };
});
add("/admin-login", undefined, async (req) => {
  const session = await getAdminSessionFromRequest(req);
  if (session && !queryString(req, "token_hash")) redirect(adminHomeFor(session.role));
  return { next: queryString(req, "next") };
});

add("/portal", "portal", async () => {
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  const ownerId = accessOwnerId(participant);
  const isOwner = participant.role === "owner";
  const [courses, staff, sectors] = await Promise.all([
    getAccessibleCourses(ownerId), isOwner ? getStaffMembers(ownerId) : Promise.resolve([]), getOwnerSectors(ownerId),
  ]);
  const entityLabel = sectors.includes("healthcare") ? "practice" : "business";
  const activeStaff = staff.filter((s) => s.is_active).length;
  const withProgress = await Promise.all(courses.map(async (course) => {
    const tree = await getCourseTree(course.id, true);
    if (!tree) return { course, completed: 0, total: 0, percent: 0 };
    const videoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id));
    const progress = await getProgressForParticipant(participant.id, videoIds);
    const state = computeCourseState(tree, progress);
    return { course, completed: state.completedVideos, total: state.totalVideos, percent: state.percentComplete };
  }));
  return { participant, ownerId, isOwner, courses, staff, sectors, entityLabel, activeStaff, withProgress };
});

add("/portal/course/:slug", "portal", async (req) => {
  const slug = String(req.params.slug);
  const participant = await getCurrentParticipant();
  if (!participant) redirect(`/login?next=/portal/course/${slug}`);
  const course = await getCourseBySlug(slug);
  if (!course || course.status !== "live") notFound();
  const accessibleIds = await getAccessibleCourseIds(accessOwnerId(participant));
  if (!accessibleIds.includes(course.id)) redirect("/portal");
  const tree = await getCourseTree(course.id, true);
  if (!tree) notFound();
  const videoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id));
  const progress = await getProgressForParticipant(participant.id, videoIds);
  const state = computeCourseState(tree, progress);
  const stateByModule = Object.fromEntries(state.modules.map((m) => [m.moduleId, m]));
  return { slug, participant, course, accessibleIds, tree, videoIds, progress, state, stateByModule };
});

add("/portal/course/:slug/video/:videoId", "portal", async (req) => {
  const slug = String(req.params.slug);
  const videoId = String(req.params.videoId);
  const participant = await getCurrentParticipant();
  if (!participant) redirect(`/login?next=/portal/course/${slug}`);
  const course = await getCourseBySlug(slug);
  if (!course || course.status !== "live") notFound();
  const accessibleIds = await getAccessibleCourseIds(accessOwnerId(participant));
  if (!accessibleIds.includes(course.id)) redirect("/portal");
  const tree = await getCourseTree(course.id, true);
  if (!tree) notFound();
  const flat = tree.modules.flatMap((module) => module.videos.map((video) => ({ video, module })));
  const currentIndex = flat.findIndex((f) => f.video.id === videoId);
  if (currentIndex === -1) notFound();
  const { video, module } = flat[currentIndex]!;
  const videoIds = flat.map((f) => f.video.id);
  const progress = await getProgressForParticipant(participant.id, videoIds);
  const state = computeCourseState(tree, progress);
  const videoStates = Object.fromEntries(state.modules.flatMap((m) => m.videos.map((v) => [v.videoId, v])));
  const currentState = videoStates[videoId];
  if (currentState?.locked) redirect(`/portal/course/${slug}`);
  const attachments = await getAttachmentsForVideos([videoId]);
  const prev = currentIndex > 0 ? flat[currentIndex - 1] : null;
  const next = currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null;
  const nextState = next ? videoStates[next.video.id] : null;
  const upNext = flat.slice(currentIndex + 1, currentIndex + 6);
  return { slug, videoId, participant, course, accessibleIds, tree, flat, currentIndex, video, module, videoIds, progress, state, videoStates, currentState, attachments, prev, next, nextState, upNext };
});

add("/portal/contacts", "portal", async () => {
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  const ownerId = accessOwnerId(participant);
  const isOwner = participant.role === "owner";
  const owner = isOwner ? participant : await getParticipantById(ownerId);
  if (!owner) redirect("/login");
  const sectors = await getOwnerSectors(ownerId);
  const [contacts, stages, niches, allSectorNiches, serviceMappings] = await Promise.all([
    getContacts(ownerId), getPipelineStages(ownerId), getOwnerNiches(ownerId, sectors),
    getNiches(true, sectors), getServiceMappings(ownerId),
  ]);
  const defaultNiche = niches.find((n) => n.id === owner.default_niche_id) ?? null;
  const healthcare = sectors.includes("healthcare");
  return { participant, ownerId, isOwner, owner, sectors, contacts, stages, niches, allSectorNiches, serviceMappings, defaultNiche, healthcare };
});

add("/portal/contacts/:id", "portal", async (req) => {
  const id = String(req.params.id);
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  const ownerId = accessOwnerId(participant);
  const contact = await getContact(id);
  if (!contact || contact.owner_id !== ownerId) notFound();
  const [history, stages, niches] = await Promise.all([
    getCallHistory(id), getPipelineStages(ownerId), getOwnerNiches(ownerId),
  ]);
  return { id, participant, ownerId, contact, history, stages, niches };
});

add("/portal/dialer", "portal", async () => {
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  const ownerId = accessOwnerId(participant);
  const isOwner = participant.role === "owner";
  const owner = isOwner ? participant : await getParticipantById(ownerId);
  if (!owner) redirect("/login");
  const sectors = await getOwnerSectors(ownerId);
  const batchSize = owner.call_batch_size ?? DEFAULT_CALL_BATCH_SIZE;
  const [queueState, niches, staff] = await Promise.all([
    getCallQueueState(ownerId, batchSize), getOwnerNiches(ownerId, sectors),
    isOwner ? getStaffMembers(ownerId) : Promise.resolve([]),
  ]);
  const teamStats = isOwner ? await getTeamStats(owner, staff) : [];
  const { followUps, newCalls, waiting } = queueState;
  const healthcare = sectors.includes("healthcare");
  return { participant, ownerId, isOwner, owner, sectors, batchSize, queueState, niches, staff, teamStats, followUps, newCalls, waiting, healthcare };
});

add("/portal/dialer/call/:contactId", "portal", async (req) => {
  const contactId = String(req.params.contactId);
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login?next=/portal/dialer");
  const ownerId = accessOwnerId(participant);
  const contact = await getContact(contactId);
  if (!contact || contact.owner_id !== ownerId) notFound();
  const sectors = await getOwnerSectors(ownerId);
  const [niches, script, sections, queue, owner, callHistory, flow] = await Promise.all([
    getOwnerNiches(ownerId, sectors), getMasterScript(), getScriptSections(), getCallQueue(ownerId),
    participant.role === "owner" ? Promise.resolve(participant) : getParticipantById(ownerId),
    getCallHistory(contactId), getScriptFlow(),
  ]);
  const remaining = queue.filter((q) => q.contact.id !== contactId);
  const nextContactId = remaining[0]?.contact.id ?? null;
  const nicheInactive = Boolean(contact.niche && !contact.niche_active);
  return { contactId, participant, ownerId, contact, sectors, niches, script, sections, queue, owner, callHistory, flow, remaining, nextContactId, nicheInactive };
});

add("/portal/dialer/script", "portal", async (req) => {
  const screen = queryString(req, "screen");
  const from = queryString(req, "from");
  const course = queryString(req, "course");
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login?next=/portal/dialer");
  const courseSlug = from === "course" && course && /^[a-z0-9-]+$/i.test(course) ? course : null;
  const backHref = courseSlug ? `/portal/course/${courseSlug}` : "/portal/dialer";
  const backLabel = courseSlug ? "Back to Training" : "Back to Dialer";
  const ownerId = accessOwnerId(participant);
  const sectors = await getOwnerSectors(ownerId);
  const [niches, flow, owner] = await Promise.all([
    getOwnerNiches(ownerId, sectors), getScriptFlow(),
    participant.role === "owner" ? Promise.resolve(participant) : getParticipantById(ownerId),
  ]);
  return { screen, from, course, participant, courseSlug, backHref, backLabel, ownerId, sectors, niches, flow, owner };
});

add("/portal/settings", "portal", async () => {
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  const ownerId = accessOwnerId(participant);
  const isOwner = participant.role === "owner";
  const owner = isOwner ? participant : await getParticipantById(ownerId);
  if (!owner) redirect("/login");
  const sectors = await getOwnerSectors(ownerId);
  const healthcare = sectors.includes("healthcare");
  const entityLabel = healthcare ? "practice" : "business";
  const [niches, staff, stages] = await Promise.all([
    getOwnerNiches(ownerId, sectors), isOwner ? getStaffMembers(ownerId) : Promise.resolve([]), getPipelineStages(ownerId),
  ]);
  const batchSize = owner.call_batch_size ?? DEFAULT_CALL_BATCH_SIZE;
  return { participant, ownerId, isOwner, owner, sectors, healthcare, entityLabel, niches, staff, stages, batchSize };
});

add("/portal/analytics", "portal", async () => {
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  const ownerId = accessOwnerId(participant);
  const owner = participant.role === "owner" ? participant : await getParticipantById(ownerId);
  if (!owner) redirect("/login");
  const staff = await getStaffMembers(ownerId);
  const members = [owner, ...staff];
  const memberIds = members.map((m) => m.id);
  const [teamStats, team, leaders] = await Promise.all([
    getTeamStats(owner, staff), getCallAnalytics(memberIds), getNicheLeaders(members),
  ]);
  return { participant, ownerId, owner, staff, members, memberIds, teamStats, team, leaders };
});

add("/portal/analytics/:callerId", "portal", async (req) => {
  const callerId = String(req.params.callerId);
  const viewer = await getCurrentParticipant();
  if (!viewer) redirect("/login");
  const ownerId = accessOwnerId(viewer);
  const caller = await getParticipantById(callerId);
  if (!caller || !sameAccount(caller, ownerId)) notFound();
  const [analytics, courseIds] = await Promise.all([
    getCallAnalytics([caller.id]), getAccessibleCourseIds(ownerId),
  ]);
  const audit = await getTrainingAudit(caller.id, courseIds);
  const s = analytics.summary;
  const hasCalls = s.calls > 0;
  return { callerId, viewer, ownerId, caller, analytics, courseIds, audit, s, hasCalls };
});

add("/portal/reactivation", "portal", async () => redirect("/portal/dialer"));

add("/admin", "super_admin", async () => {
  const [stats, mostWatched, viewers] = await Promise.all([
    getDashboardStats(), getMostWatchedVideos(), getViewerRows(),
  ]);
  const recentViewers = viewers.filter((v) => v.lastSeen)
    .sort((a, b) => (b.lastSeen! > a.lastSeen! ? 1 : -1)).slice(0, 6);
  const cards = [
    { label: "Total Viewers", value: String(stats.totalViewers), sub: `${stats.newViewers7d} new in last 7 days` },
    { label: "Total Watch Time", value: formatDuration(stats.totalWatchSeconds), sub: `${stats.totalSessions} sessions`, accent: true },
    { label: "Video Completions", value: String(stats.videoCompletions), sub: "across all courses" },
    { label: "Content Library", value: `${stats.totalVideos} videos`, sub: `${formatDuration(stats.totalDurationSeconds)} total · ${stats.liveCourses}/${stats.totalCourses} live` },
  ];
  return { stats, mostWatched, viewers, recentViewers, cards };
});

add("/admin/courses", "super_admin", async () => {
  const courses = await getCourses();
  const supabase = getAdminClient();
  const counts = await Promise.all(courses.map(async (course) => {
    const { data: modules } = await supabase.from("modules").select("id").eq("course_id", course.id);
    const moduleIds = (modules ?? []).map((m) => m.id);
    let videoCount = 0;
    if (moduleIds.length) {
      const { count } = await supabase.from("videos").select("id", { count: "exact", head: true }).in("module_id", moduleIds);
      videoCount = count ?? 0;
    }
    return { courseId: course.id, modules: moduleIds.length, videos: videoCount };
  }));
  return { courses, counts, countMap: Object.fromEntries(counts.map((c) => [c.courseId, c])) };
});

add("/admin/courses/:id", "super_admin", async (req) => {
  const id = String(req.params.id);
  const tree = await getCourseTree(id);
  if (!tree) notFound();
  const videoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id));
  const attachments = await getAttachmentsForVideos(videoIds);
  return { id, tree, videoIds, attachments };
});

add("/admin/participants", "super_admin", async (req) => {
  const q = queryString(req, "q") ?? "";
  const openNew = queryString(req, "new");
  const status = queryString(req, "status") ?? "active";
  const showDisabled = status === "disabled";
  const [viewers, videoCount] = await Promise.all([
    getViewerRows(),
    (async () => {
      const { count } = await getAdminClient().from("videos").select("id", { count: "exact", head: true });
      return count ?? 0;
    })(),
  ]);
  const query = q.trim().toLowerCase();
  const filtered = query ? viewers.filter((v) =>
    `${v.first_name} ${v.last_name}`.toLowerCase().includes(query) ||
    v.email.toLowerCase().includes(query) || (v.phone ?? "").toLowerCase().includes(query)) : viewers;
  const allOwners = filtered.filter((v) => v.role === "owner");
  const activeCount = allOwners.filter((v) => v.is_active).length;
  const disabledCount = allOwners.length - activeCount;
  const owners = allOwners.filter((v) => showDisabled ? !v.is_active : v.is_active);
  const staffByParent: Record<string, typeof filtered> = {};
  for (const v of viewers.filter((v) => v.role === "staff")) {
    (staffByParent[v.parent_id!] ??= []).push(v);
  }
  return { q, openNew, status, showDisabled, viewers, videoCount, query, filtered, allOwners, activeCount, disabledCount, owners, staffByParent };
});

add("/admin/participants/:id", "super_admin", async (req) => {
  const id = String(req.params.id);
  const participant = await getParticipantById(id);
  if (!participant) notFound();
  const ownerId = accessOwnerId(participant);
  const isOwner = participant.role === "owner";
  const supabase = getAdminClient();
  const [staff, aliases, sessions, courses, accessIds, events, progressRes, niches, nicheAccessIds] = await Promise.all([
    isOwner ? getStaffMembers(participant.id) : Promise.resolve([]), getAliases(participant.id),
    getSessions(participant.id, 20), getCourses(), getAccessibleCourseIds(ownerId),
    getActivityEvents({ participantId: participant.id, limit: 50 }),
    supabase.from("video_progress").select("*").eq("participant_id", id),
    getNiches(true), getAccessibleNicheIds(ownerId),
  ]);
  const nichesBySector: Record<string, typeof niches> = {};
  for (const niche of niches) (nichesBySector[niche.sector] ??= []).push(niche);
  const progress = progressRes.data ?? [];
  const progressByVideo = Object.fromEntries(progress.map((p) => [p.video_id, p]));
  const accessSet = new Set(accessIds);
  const accessSetObject = Object.fromEntries(accessIds.map((courseId) => [courseId, true]));
  const nicheAccessSet = Object.fromEntries(nicheAccessIds.map((nicheId) => [nicheId, true]));
  const accessibleCourses = courses.filter((c) => accessSet.has(c.id));
  const courseTrees = await Promise.all(accessibleCourses.map((c) => getCourseTree(c.id, true)));
  const videoIds = [...new Set(events.map((e) => e.video_id).filter(Boolean))] as string[];
  const { data: eventVideos } = videoIds.length
    ? await supabase.from("videos").select("id, title").in("id", videoIds) : { data: [] };
  const videoTitle = Object.fromEntries((eventVideos ?? []).map((v) => [v.id, v.title]));
  const parent = participant.parent_id ? await getParticipantById(participant.parent_id) : null;
  const reactivationStats = isOwner
    ? await getAccountReactivationStats(participant.id, [participant.id, ...staff.map((s) => s.id)]) : null;
  return { id, participant, ownerId, isOwner, staff, aliases, sessions, courses, accessIds, events,
    progress, niches, nicheAccessIds, nicheAccessSet, nichesBySector, progressByVideo,
    accessSet: accessSetObject, accessibleCourses, courseTrees,
    videoIds, eventVideos: eventVideos ?? [], videoTitle, parent, reactivationStats };
});

add("/admin/reactivation", "super_admin", async () => {
  const [niches, script, sections] = await Promise.all([getNiches(), getMasterScript(), getScriptSections()]);
  const slots = script ? extractSlots(script.body) : [];
  return { niches, script, sections, slots };
});

add("/admin/payments", "admin", async () => ({ links: await listPaymentLinks(), stripeMode: getStripeMode() }));
add("/admin/payments/:id", "admin", async (req) => {
  const id = String(req.params.id);
  const detail = await getPaymentDetail(id);
  if (!detail) notFound();
  const { link, accounts, customer, cards, history } = detail;
  const isPaid = link.status === "paid";
  const owner = accounts.find((a) => a.role === "owner");
  const staffAccounts = accounts.filter((a) => a.role === "staff");
  const agreement = link.type === "subscription" ? await getAgreementForLink(id) : null;
  return { id, detail, link, accounts, customer, cards, history, isPaid, owner: owner ?? null, staffAccounts, agreement };
});

add("/admin/agreements", "admin", async (req) => ({
  agreements: await listAgreements(),
  status: queryString(req, "status"),
  rep: queryString(req, "rep"),
  q: queryString(req, "q"),
}));
add("/admin/agreements/:id", "admin", async (req) => {
  const id = String(req.params.id);
  const detail = await getAgreementDetail(id);
  if (!detail) notFound();
  return { id, detail, stripeMode: getStripeMode() };
});

add("/admin/commissions", "admin", async (req) => {
  const report = await listCommissions({
    repId: queryString(req, "rep"), from: queryString(req, "from"), to: queryString(req, "to"),
    paid: queryString(req, "paid") as "paid" | "unpaid" | undefined,
    saleType: queryString(req, "type") as never,
  });
  return { report };
});

add("/admin/billing", "super_admin", async (req) => {
  const range = parseDateRange({ from: queryString(req, "from"), to: queryString(req, "to") });
  const dashboard = await getBillingDashboard(range);
  return { ...dashboard, range: { from: range.fromDay, to: range.toDay }, upcomingDays: UPCOMING_WINDOW_DAYS, stripeMode: getStripeMode() };
});

add("/admin/analytics", "super_admin", async (req) => {
  const participant = queryString(req, "participant");
  const course = queryString(req, "course");
  const event = queryString(req, "event");
  const [stats, courses, progress, viewers, events] = await Promise.all([
    getDashboardStats(), getCourses(), getAllProgress(), getViewerRows(),
    getActivityEvents({ participantId: participant, courseId: course, eventType: event, limit: 100 }),
  ]);
  const trees = await Promise.all(courses.map((c) => getCourseTree(c.id)));
  const byVideo = new Map<string, { started: number; completed: number; percentSum: number; watch: number }>();
  for (const p of progress) {
    const cur = byVideo.get(p.video_id) ?? { started: 0, completed: 0, percentSum: 0, watch: 0 };
    cur.started++; if (p.completed) cur.completed++;
    cur.percentSum += Number(p.percent_watched ?? 0); cur.watch += Number(p.seconds_watched ?? 0);
    byVideo.set(p.video_id, cur);
  }
  const courseStats = trees.filter((t): t is NonNullable<typeof t> => Boolean(t)).map((tree) => {
    const allVideoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id));
    const idSet = new Set(allVideoIds);
    const starters = new Set(progress.filter((p) => idSet.has(p.video_id)).map((p) => p.participant_id));
    const totalWatch = allVideoIds.reduce((sum, id) => sum + (byVideo.get(id)?.watch ?? 0), 0);
    const completedCount = allVideoIds.reduce((sum, id) => sum + (byVideo.get(id)?.completed ?? 0), 0);
    return { id: tree.id, title: tree.title, status: tree.status, viewersStarted: starters.size, totalWatch,
      avgCompletion: starters.size ? completedCount / (allVideoIds.length * Math.max(starters.size, 1)) * 100 : 0,
      modules: tree.modules.map((m) => ({ id: m.id, title: m.title, videos: m.videos.map((v) => {
        const s = byVideo.get(v.id);
        return { id: v.id, title: v.title, duration: v.duration_seconds ? Number(v.duration_seconds) : null,
          started: s?.started ?? 0, completed: s?.completed ?? 0,
          avgPercent: s && s.started > 0 ? s.percentSum / s.started : 0, totalWatch: s?.watch ?? 0 };
      }) })) };
  });
  const nameOf = Object.fromEntries(viewers.map((v) => [v.id, `${v.first_name} ${v.last_name}`]));
  const videoIds = [...new Set(events.map((e) => e.video_id).filter(Boolean))] as string[];
  const { data: eventVideos } = videoIds.length
    ? await getAdminClient().from("videos").select("id, title").in("id", videoIds) : { data: [] };
  const videoTitle = Object.fromEntries((eventVideos ?? []).map((v) => [v.id, v.title]));
  const courseTitle = Object.fromEntries(courses.map((c) => [c.id, c.title]));
  const activeViewers = viewers.filter((v) => v.sessionCount > 0).length;
  return { participant, course, event, stats, courses, progress, viewers, events, trees,
    byVideo: Object.fromEntries(byVideo), courseStats, nameOf, videoIds, eventVideos: eventVideos ?? [],
    videoTitle, courseTitle, activeViewers };
});

add("/pay/:token", undefined, async (req) => {
  const token = String(req.params.token);
  const link = await getPaymentLinkPublic(token);
  if (!link) notFound();
  if (link.status === "paid") redirect(`/pay/${token}/thank-you`);
  // Subscriptions start with the service agreement; the old link routes there.
  if (link.type === "subscription") {
    const agreementToken = await agreementTokenForLink(token);
    if (agreementToken) redirect(`/agreements/${agreementToken}`);
  }
  return { token, link, stripeMode: getStripeMode() };
});
add("/agreements/:token", undefined, async (req) => {
  const token = String(req.params.token);
  const agreement = await getAgreementPublic(token);
  if (!agreement) notFound();
  return { token, agreement };
});
// Customer billing. /billing (request a link by email) and /billing/:token
// are public so an account paused for non-payment can still pay or add a
// card; /portal/billing is the signed-in owner's page with the cancel flow.
add("/billing", undefined, async (req) => ({ email: queryString(req, "email") ?? null }));
add("/billing/:token", undefined, async (req) => {
  const token = String(req.params.token);
  const state = await getBillingByToken(token);
  if (!state) notFound();
  return { token, ...state, stripeMode: getStripeMode() };
});
add("/portal/billing", "portal", async () => {
  const participant = await getCurrentParticipant();
  if (!participant) redirect("/login");
  return { ...(await getMyBilling()), stripeMode: getStripeMode() };
});

add("/pay/:token/thank-you", undefined, async (req) => {
  const token = String(req.params.token);
  const link = await getPaymentLinkPublic(token);
  if (!link) notFound();
  let confirmation: Awaited<ReturnType<typeof confirmPayment>> | null = null;
  if (link.status !== "paid" && link.type === "subscription") redirect(`/pay/${token}`);
  if (link.status !== "paid") {
    confirmation = await confirmPayment(token);
    if (!confirmation.paid) redirect(`/pay/${token}`);
  }
  return { token, link, confirmation };
});

add("/healthcare/book-a-call", undefined, async (req) => {
  const contactId = (queryString(req, "cid") ?? "").slice(0, 64);
  const firstName = (queryString(req, "name") ?? "").slice(0, 40);
  const carried = new URLSearchParams();
  for (const key of ["name", "cid", "inactive", "value", "services"]) {
    const value = queryString(req, key);
    if (value) carried.set(key, value.slice(0, 600));
  }
  const thankYouHref = `/healthcare/thank-you?${carried.toString()}`;
  return { params: req.query, contactId, firstName, carried: Object.fromEntries(carried), thankYouHref };
});

add("/healthcare/thank-you", undefined, async (req) => {
  const str = (key: string, max: number) => (queryString(req, key) ?? "").slice(0, max);
  const firstName = str("name", 40);
  const services = str("services", 600).split("|").filter(Boolean).slice(0, 30).map(publicServiceName);
  const inactiveCount = parseInactiveCount(str("inactive", 12) || undefined);
  const patientValue = parsePatientValue(str("value", 12) || undefined);
  const tzParam = str("tz", 40);
  const timezone = isUsTimezone(tzParam) ? tzParam : DEFAULT_TIMEZONE;
  const slotMs = Date.parse(str("slot", 40));
  const bookedFor = Number.isNaN(slotMs) ? null : new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, dateStyle: "full", timeStyle: "short",
  }).format(new Date(slotMs));
  const serviceLabel = services.length === 0 ? "" : services.length === 1 ? services[0]
    : services.length === 2 ? `${services[0]} and ${services[1]}` : `${services[0]}, ${services[1]}, and more`;
  return { params: req.query, firstName, services, inactiveCount, patientValue, tzParam, timezone,
    timezoneLabel: timezoneLabel(timezone), slotMs: Number.isNaN(slotMs) ? null : slotMs, bookedFor, servicesLabel: serviceLabel };
});

add("/healthcare/your-opportunity", undefined, async (req) => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) if (typeof value === "string") qs.set(key, value);
  const query = qs.toString();
  redirect(`/healthcare/book-a-call${query ? `?${query}` : ""}`);
});

export default router;