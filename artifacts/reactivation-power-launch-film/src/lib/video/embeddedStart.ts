// Embedded previews (the Design tab canvas and the workspace preview pane)
// load paused and silent; only the top-level page -- the export and
// recording path -- plays straight through on its own.

import { useCallback, useState } from 'react';
import { MotionGlobalConfig } from 'framer-motion';

export function isEmbedded(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

/**
 * While held, framer-motion entrance animations jump straight to their final
 * frame instead of playing, so the held video shows a still frame.
 */
export function setMotionHeld(held: boolean) {
  MotionGlobalConfig.skipAnimations = held;
}

/**
 * Holds an embedded video on a still frame until the viewer first presses
 * Play (see setMotionHeld), so nothing moves and nothing sounds. Call
 * release() on the first Play (or scene jump) and remount the player so the
 * scene plays from its first frame with its animations and audio.
 *
 * When disabled (top-level page) this changes nothing.
 */
export function useEmbeddedStartHold(enabled: boolean = isEmbedded()) {
  const [held, setHeld] = useState(() => {
    if (enabled) setMotionHeld(true);
    return enabled;
  });
  const release = useCallback(() => {
    setMotionHeld(false);
    setHeld(false);
  }, []);
  return { held, release };
}
