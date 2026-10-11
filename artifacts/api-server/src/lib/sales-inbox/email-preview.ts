import sanitizeHtml from 'sanitize-html'

/** Frozen content only, never a live email document. No links, remote images,
 * URL-bearing CSS, forms, or executable markup leave the server. */
export function safeEmailPreview(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ['html','body','div','span','p','br','hr','table','thead','tbody','tr','td','th','h1','h2','h3','h4','strong','b','em','i','ul','ol','li','blockquote','a'],
    allowedAttributes: {
      '*': ['style'],
      table: ['width','cellpadding','cellspacing','role'],
      td: ['colspan','rowspan','align'], th: ['colspan','rowspan','align'],
    },
    transformTags: {
      img: (_tag, attrs) => ({ tagName: 'span', attribs: {}, text: attrs.alt ?? '' }),
    },
    allowedStyles: { '*': {
      color: [/^#[\da-f]{3,8}$/i, /^[a-z]+$/i],
      'background-color': [/^#[\da-f]{3,8}$/i, /^[a-z]+$/i],
      'font-family': [/^[\w\s,'"-]+$/],
      'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
      'font-weight': [/^(?:normal|bold|[1-9]00)$/],
      'text-align': [/^(?:left|right|center)$/],
      display: [/^(?:none|block|inline|inline-block)$/],
      overflow: [/^hidden$/],
      'max-height': [/^\d+(?:px)?$/],
      'text-decoration': [/^(?:none|underline)$/],
      'border-bottom': [/^\d+px solid #[\da-f]{3,8}$/i],
      'border-left': [/^\d+px solid #[\da-f]{3,8}$/i],
      'line-height': [/^\d+(?:\.\d+)?(?:px|em|%)?$/],
      padding: [/^[\d.\s]+(?:px|em|rem|%)?(?:\s+[\d.]+(?:px|em|rem|%)?)*$/],
      margin: [/^[\d.\s]+(?:px|em|rem|%)?(?:\s+[\d.]+(?:px|em|rem|%)?)*$/],
      'border-radius': [/^\d+px$/],
      width: [/^\d+(?:px|%)$/],
      'max-width': [/^\d+(?:px|%)$/],
    } },
    textFilter: text => text.replace(/https?:\/\/[^\s<]+/gi, '[link hidden]'),
  })
}
