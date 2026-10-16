import { Download, FileText } from 'lucide-react'
import type { Attachment } from '@/lib/types'

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a
            href={`/api/media?pathname=${encodeURIComponent(attachment.file_url)}&download=${encodeURIComponent(attachment.file_name)}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-accent"
          >
            <span className="flex min-w-0 items-center gap-3">
              <FileText className="size-5 shrink-0 text-accent" />
              <span className="truncate text-sm font-medium text-foreground">
                {attachment.file_name}
              </span>
            </span>
            <Download className="size-4 shrink-0 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  )
}
