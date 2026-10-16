import { Router, type IRouter, type Request, type Response } from "express";
import { getAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/auth/session";
import { getAllowedSession } from "@/lib/data/participants";
import { logEvent } from "@/lib/data/activity";
import { COMPLETION_THRESHOLD } from '@workspace/shared/types';
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";

const router: IRouter = Router();

router.post("/progress", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    const session = await getAllowedSession();
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const body = req.body as Record<string, unknown> | null;
    if (!body?.videoId) {
      res.status(400).json({ error: "Missing videoId" });
      return;
    }
    const videoId = body.videoId as string;
    const courseId = (body.courseId as string | null | undefined) ?? null;
    const moduleId = (body.moduleId as string | null | undefined) ?? null;
    const position = (body.position as number | undefined) ?? 0;
    const duration = (body.duration as number | undefined) ?? 0;
    const secondsDelta = (body.secondsDelta as number | undefined) ?? 0;
    const event = (body.event as "heartbeat" | "start" | "ended" | undefined) ?? "heartbeat";
    const supabase = getAdminClient();
    const ip = await getClientIp();
    const { data: existing } = await supabase
      .from("video_progress").select("*")
      .eq("participant_id", session.participantId).eq("video_id", videoId).maybeSingle();
    const furthest = Math.max(Number(existing?.furthest_position ?? 0), position);
    const secondsWatched = Number(existing?.seconds_watched ?? 0) + Math.max(0, Math.min(secondsDelta, 60));
    const percent = duration > 0
      ? Math.min(100, Math.round((furthest / duration) * 100))
      : Number(existing?.percent_watched ?? 0);
    const wasCompleted = existing?.completed ?? false;
    const nowCompleted = wasCompleted || event === "ended" || percent >= COMPLETION_THRESHOLD;
    const now = new Date().toISOString();
    const { error } = await supabase.from("video_progress").upsert({
      participant_id: session.participantId,
      video_id: videoId,
      seconds_watched: secondsWatched,
      furthest_position: furthest,
      percent_watched: percent,
      completed: nowCompleted,
      completed_at: nowCompleted ? (existing?.completed_at ?? now) : null,
      updated_at: now,
    }, { onConflict: "participant_id,video_id" });
    if (error) {
      logger.error({ err: error }, "progress upsert error");
      res.status(500).json({ error: "Failed to save" });
      return;
    }
    if (event === "start" && !existing) {
      await logEvent({
        participantId: session.participantId, sessionId: session.sessionId,
        courseId, moduleId, videoId, eventType: "video_start", ipAddress: ip,
      });
    }
    if (nowCompleted && !wasCompleted) {
      await logEvent({
        participantId: session.participantId, sessionId: session.sessionId,
        courseId, moduleId, videoId, eventType: "video_complete", ipAddress: ip,
        metadata: { percent, position: furthest },
      });
    }
    res.json({ completed: nowCompleted, percent, justCompleted: nowCompleted && !wasCompleted });
  });
});

export default router;