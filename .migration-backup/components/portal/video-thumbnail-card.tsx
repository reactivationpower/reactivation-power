import { CheckCircle2, Lock, Play } from 'lucide-react'
import { mediaUrl } from '@/lib/media'
import { formatDuration } from '@/lib/format'

/**
 * Video card for the participant side: thumbnail frame in the background,
 * dark overlay for contrast, module + video title in white, and a big
 * centered play button.
 */
export function VideoThumbnailCard({
  moduleTitle,
  videoTitle,
  thumbnailPathname,
  durationSeconds,
  completed = false,
  locked = false,
}: {
  moduleTitle: string
  videoTitle: string
  thumbnailPathname: string | null
  durationSeconds: number | null
  completed?: boolean
  locked?: boolean
}) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-900">
      {thumbnailPathname && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(thumbnailPathname) || '/placeholder.svg'}
          alt=""
          className={`absolute inset-0 size-full object-cover ${locked ? 'opacity-40' : ''}`}
        />
      )}

      {/* Dark overlay so white text stays readable over any frame */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30" />

      {/* Big play button (or lock) in the middle */}
      <div className="absolute inset-0 flex items-center justify-center">
        {locked ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
            <Lock className="size-6 text-white/80" aria-hidden />
          </span>
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
            <span className="flex size-12 items-center justify-center rounded-full bg-white">
              <Play
                className="ml-0.5 size-5 fill-zinc-900 text-zinc-900"
                aria-hidden
              />
            </span>
          </span>
        )}
      </div>

      {/* Module + video title */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
          {moduleTitle}
        </p>
        <p className="mt-0.5 line-clamp-2 text-lg font-bold text-white text-balance">
          {videoTitle}
        </p>
      </div>

      {/* Status badges */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {completed && (
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <CheckCircle2 className="size-3.5 text-green-400" />
            Watched
          </span>
        )}
        {durationSeconds ? (
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {formatDuration(durationSeconds)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
