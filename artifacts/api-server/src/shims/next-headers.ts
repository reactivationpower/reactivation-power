/**
 * Express-backed replacement for next/headers, so the original server
 * actions/data layer run unchanged. Relies on request-context.ts.
 */
import { getRequestContext } from "../lib/request-context";

interface CookieSetOptions {
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  partitioned?: boolean;
  maxAge?: number; // seconds (Next semantics)
  path?: string;
}

function readCookies(): Record<string, string> {
  const { req } = getRequestContext();
  return (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
}

export async function cookies() {
  const { res } = getRequestContext();
  return {
    get(name: string) {
      const value = readCookies()[name];
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return Object.entries(readCookies()).map(([name, value]) => ({ name, value }));
    },
    has(name: string) {
      return readCookies()[name] !== undefined;
    },
    set(name: string, value: string, options: CookieSetOptions = {}) {
      res.cookie(name, value, {
        httpOnly: options.httpOnly,
        sameSite: options.sameSite,
        secure: options.secure,
        partitioned: options.partitioned,
        maxAge: options.maxAge !== undefined ? options.maxAge * 1000 : undefined,
        path: options.path ?? "/",
      });
    },
    delete(name: string) {
      const { req } = getRequestContext();
      const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
      const secure = proto === "https";
      res.clearCookie(name, {
        path: "/",
        httpOnly: true,
        sameSite: secure ? "none" : "lax",
        secure,
        partitioned: secure,
      });
    },
  };
}

export async function headers() {
  const { req } = getRequestContext();
  return {
    get(name: string): string | null {
      const v = req.headers[name.toLowerCase()];
      if (v === undefined) return null;
      return Array.isArray(v) ? v.join(", ") : v;
    },
  };
}
