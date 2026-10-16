/**
 * Client-safe helpers for contact notes, which are stored as a small HTML
 * subset (from the rich-text editor) or legacy plain text.
 * No DOM / no server-only deps so this can ship in client bundles.
 */

/** Strip tags for search + previews. Block boundaries become spaces. */
export function notesToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|div|ul|ol)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the stored value contains markup (vs legacy plain text). */
export function notesAreHtml(v: string | null | undefined): boolean {
  return !!v && /<[a-z][\s\S]*>/i.test(v)
}
