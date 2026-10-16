/**
 * Shared width classes for the client portal. The portal is table-heavy
 * (contacts, call queues, analytics) so it runs wide by default; content
 * pages that read better narrow (the call screen, a single contact) opt
 * into PORTAL_NARROW.
 */
export const PORTAL_WIDTH = 'mx-auto w-full max-w-[1440px] px-6'
export const PORTAL_NARROW = 'mx-auto w-full max-w-4xl px-6'
