// Player control actions behind the workspace control protocol
// (workspaceControls.ts). Everything drives playback through the bridge so
// useVideoPlayer stays the single scene clock.

import { SCENE_DETAILS } from '../../components/video/sceneMeta';
import { setMotionHeld } from './embeddedStart';
import { playerBridge } from './playerBridge';

let heldOnce = false;

/**
 * Starts an embedded player paused and silent on a still frame. Runs once
 * per page load, before the player first renders; the export path never
 * calls it, so exports still play straight through.
 */
export function holdUntilFirstPlay() {
  if (heldOnce) return;
  heldOnce = true;
  setMotionHeld(true);
  playerBridge.setStartHeld(true);
}

/** Ends the first-Play hold. Returns true if the player was held. */
function releaseStartHold(): boolean {
  if (!playerBridge.getState().startHeld) return false;
  setMotionHeld(false);
  playerBridge.setStartHeld(false);
  return true;
}

export function announceSceneSelection(index: number, sceneKeys: string[]) {
  const key = sceneKeys[index];
  const details = SCENE_DETAILS[key];
  // The workspace rejects selections without a source locator.
  if (!details?.filePath) return;
  window.parent.postMessage(
    {
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: sceneKeys.length,
        sceneTitle: details.title || key,
        filePath: details.filePath,
        lineNumber: 1,
      },
    },
    '*',
  );
}

export function jumpToScene(index: number) {
  const { playback } = playerBridge.getState();
  const sceneKeys = playback?.sceneKeys ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= sceneKeys.length) {
    return;
  }
  releaseStartHold();
  playerBridge.setStartIndex(index);
  playerBridge.setPaused(false);
  playerBridge.bumpRemountEpoch();
  announceSceneSelection(index, sceneKeys);
}

export function setSceneLock(locked: boolean) {
  const state = playerBridge.getState();
  if (state.locked === locked) {
    return;
  }
  // Lock and unlock both restart the active scene so the loop boundary is
  // never mid-scene.
  releaseStartHold();
  playerBridge.setLocked(locked);
  playerBridge.setStartIndex(state.currentIndex);
  playerBridge.setPaused(false);
  playerBridge.bumpRemountEpoch();
}

export function setPaused(paused: boolean) {
  // The first Play remounts the held player so its scene, animations and
  // narration start from the first frame.
  if (!paused && releaseStartHold()) {
    playerBridge.setPaused(false);
    playerBridge.bumpRemountEpoch();
    return;
  }
  playerBridge.setPaused(paused);
}

export function setAudioMuted(muted: boolean) {
  playerBridge.setAudioMuted(muted);
}
