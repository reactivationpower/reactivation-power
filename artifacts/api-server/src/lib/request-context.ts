import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response } from "express";

export interface RequestContext {
  req: Request;
  res: Response;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run fn with req/res available to the Next-style shims (cookies(), headers(), redirect()). */
export function runWithRequestContext<T>(req: Request, res: Response, fn: () => Promise<T>): Promise<T> {
  return storage.run({ req, res }, fn);
}

export function getRequestContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("No request context: call runWithRequestContext() in the route handler");
  }
  return ctx;
}

export function tryGetRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
