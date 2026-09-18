'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Bold, Italic, Link2, Link2Off, List } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Initial HTML (or plain text — newlines become paragraphs) */
  initialValue?: string | null
  onChange: (html: string) => void
  placeholder?: string
  id?: string
  minRows?: number
}

/** Legacy plain-text notes → paragraphs so they render properly */
function toHtml(v: string | null | undefined): string {
  if (!v) return ''
  if (/<[a-z][\s\S]*>/i.test(v)) return v
  return v
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('')
}

export function RichTextEditor({
  initialValue,
  onChange,
  placeholder,
  id,
  minRows = 4,
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: toHtml(initialValue),
    editorProps: {
      attributes: {
        id: id ?? '',
        class: cn(
          'prose prose-sm max-w-none px-3 py-2 text-base leading-relaxed text-foreground outline-none',
          '[&_a]:text-accent [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1',
        ),
        style: `min-height: ${minRows * 1.6}rem`,
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? '' : editor.getHTML())
    },
  })

  function setLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.trim() })
      .run()
  }

  const btn = (
    active: boolean,
    onClick: () => void,
    label: string,
    Icon: typeof Bold,
    disabled = false,
  ) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
        active && 'bg-muted text-foreground',
      )}
    >
      <Icon className="size-4" />
    </button>
  )

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
      <div
        className="flex items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1"
        role="toolbar"
        aria-label="Formatting"
      >
        {btn(
          !!editor?.isActive('bold'),
          () => editor?.chain().focus().toggleBold().run(),
          'Bold',
          Bold,
          !editor,
        )}
        {btn(
          !!editor?.isActive('italic'),
          () => editor?.chain().focus().toggleItalic().run(),
          'Italic',
          Italic,
          !editor,
        )}
        {btn(
          !!editor?.isActive('bulletList'),
          () => editor?.chain().focus().toggleBulletList().run(),
          'Bulleted list',
          List,
          !editor,
        )}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {btn(!!editor?.isActive('link'), setLink, 'Add link', Link2, !editor)}
        {editor?.isActive('link') &&
          btn(
            false,
            () => editor.chain().focus().unsetLink().run(),
            'Remove link',
            Link2Off,
          )}
      </div>
      <div className="relative">
        {editor?.isEmpty && placeholder && (
          <p
            className="pointer-events-none absolute left-3 top-2 text-base text-muted-foreground"
            aria-hidden="true"
          >
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
