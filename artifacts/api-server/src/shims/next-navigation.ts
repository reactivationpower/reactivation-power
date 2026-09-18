/**
 * Express-backed replacement for next/navigation. redirect()/notFound()
 * throw signals that the RPC/loader route handlers translate into a JSON
 * response the SPA acts on.
 */
export class RedirectSignal extends Error {
  constructor(public readonly location: string) {
    super("NEXT_REDIRECT:" + location);
  }
}

export class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

export function redirect(location: string): never {
  throw new RedirectSignal(location);
}

export function notFound(): never {
  throw new NotFoundSignal();
}

export function isRedirectSignal(e: unknown): e is RedirectSignal {
  return e instanceof RedirectSignal;
}

export function isNotFoundSignal(e: unknown): e is NotFoundSignal {
  return e instanceof NotFoundSignal;
}
