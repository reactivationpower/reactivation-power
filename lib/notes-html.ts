import 'server-only'
import sanitizeHtml from 'sanitize-html'

/**
 * Server-side sanitizer for contact notes. The editor only emits this
 * subset, but the value crosses a network boundary so we enforce it here.
 * Anything else (scripts, styles, images, iframes, event handlers) is dropped.
 */
export function sanitizeNotes(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
    // Collapse the editor's "empty document" to nothing so it stores NULL
    exclusiveFilter: (frame) =>
      frame.tag === 'p' && !frame.text.trim() && !frame.mediaChildren.length,
  }).trim()
  // Editor returns "<p></p>" for an empty doc; treat as empty
  return clean === '<p></p>' ? '' : clean
}
