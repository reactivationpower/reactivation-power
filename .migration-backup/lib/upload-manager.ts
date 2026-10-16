'use client'

import { useSyncExternalStore } from 'react'

export type ManagedUploadPhase = 'uploading' | 'saving' | 'done' | 'error'

export interface ManagedUpload {
  id: string
  label: string
  progress: number
  phase: ManagedUploadPhase
  error?: string
}

type UploadsMap = Record<string, ManagedUpload>

let uploads: UploadsMap = {}
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setUpload(id: string, patch: Partial<ManagedUpload>) {
  const current = uploads[id]
  if (!current) return
  uploads = { ...uploads, [id]: { ...current, ...patch } }
  emit()
}

function removeUpload(id: string) {
  if (!uploads[id]) return
  const next = { ...uploads }
  delete next[id]
  uploads = next
  emit()
}

/** Warn before leaving the page while uploads are in flight */
function hasActiveUploads() {
  return Object.values(uploads).some(
    (u) => u.phase === 'uploading' || u.phase === 'saving',
  )
}

let unloadGuardInstalled = false
function installUnloadGuard() {
  if (unloadGuardInstalled || typeof window === 'undefined') return
  unloadGuardInstalled = true
  window.addEventListener('beforeunload', (event) => {
    if (hasActiveUploads()) {
      event.preventDefault()
    }
  })
}

/**
 * Browser messages for transient fetch/network failures
 * (same set @vercel/blob uses internally to decide when to retry).
 */
const NETWORK_ERROR_MESSAGES = new Set([
  'network error', // Chrome (streaming request body failure)
  'Failed to fetch', // Chrome
  'NetworkError when attempting to fetch resource.', // Firefox
  'The Internet connection appears to be offline.', // Safari 16
  'Load failed', // Safari 17+
  'Network request failed', // cross-fetch / XHR path
])

function isTransientNetworkError(reason: unknown): boolean {
  return (
    reason instanceof TypeError &&
    typeof reason.message === 'string' &&
    NETWORK_ERROR_MESSAGES.has(reason.message)
  )
}

/**
 * @vercel/blob's multipart uploader streams each part's body through a
 * ReadableStream pipe. When a part's fetch fails transiently, the library
 * retries the part (and the upload succeeds), but the abandoned body stream
 * leaks the network TypeError as an unhandled promise rejection, which
 * surfaces as a scary "Uncaught TypeError: network error" in the console.
 *
 * While one of OUR uploads is actively in flight, absorb exactly those
 * leaked transient network rejections. Genuine upload failures are NOT
 * affected: they reject the awaited upload promise, which is caught and
 * shown in the upload tray/dialog error UI.
 */
let rejectionGuardInstalled = false
function installRejectionGuard() {
  if (rejectionGuardInstalled || typeof window === 'undefined') return
  rejectionGuardInstalled = true
  window.addEventListener('unhandledrejection', (event) => {
    if (hasActiveUploads() && isTransientNetworkError(event.reason)) {
      event.preventDefault()
      console.warn(
        '[uploads] transient network hiccup during upload (auto-retried):',
        event.reason?.message,
      )
    }
  })
}

/**
 * Start an upload that survives closing the dialog that launched it.
 * The task runs to completion regardless of what UI is open, and its
 * progress is readable anywhere via useUpload/useUploads.
 */
export function startManagedUpload(
  id: string,
  label: string,
  task: (onProgress: (percent: number) => void) => Promise<void>,
): Promise<void> {
  installUnloadGuard()
  installRejectionGuard()
  uploads = {
    ...uploads,
    [id]: { id, label, progress: 0, phase: 'uploading' },
  }
  emit()

  const promise = task((percent) => {
    setUpload(id, {
      progress: percent,
      phase: percent >= 100 ? 'saving' : 'uploading',
    })
  })

  promise
    .then(() => {
      setUpload(id, { progress: 100, phase: 'done' })
      // Auto-clear the finished entry after a short confirmation window
      setTimeout(() => removeUpload(id), 5000)
    })
    .catch((err) => {
      setUpload(id, {
        phase: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    })

  return promise
}

export function dismissUpload(id: string) {
  removeUpload(id)
}

export function isUploadActive(id: string) {
  const u = uploads[id]
  return u ? u.phase === 'uploading' || u.phase === 'saving' : false
}

const getServerSnapshot = () => undefined
/** Must be a stable reference — a new object each call makes React loop */
const EMPTY_UPLOADS: UploadsMap = {}
const getServerUploads = (): UploadsMap => EMPTY_UPLOADS

/** Subscribe to a single upload's state (undefined when not uploading) */
export function useUpload(id: string): ManagedUpload | undefined {
  return useSyncExternalStore(
    subscribe,
    () => uploads[id],
    getServerSnapshot,
  )
}

/** Subscribe to all uploads (for the floating tray) */
export function useUploads(): UploadsMap {
  return useSyncExternalStore(subscribe, () => uploads, getServerUploads)
}
