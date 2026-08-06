import { SLIDES, type Slide } from './slides'

interface NarrationScriptProps {
  /** Slide deck to document; defaults to the original walkthrough */
  slides?: Slide[]
  /** Approximate total runtime shown in the intro line */
  runtime?: string
}

/**
 * Full narration script + shot list for whoever records the training video.
 * Rendered below the player; also print-friendly (Cmd/Ctrl+P).
 */
export function NarrationScript({
  slides = SLIDES,
  runtime = '90 seconds',
}: NarrationScriptProps) {
  return (
    <section aria-label="Narration script and shot list" className="mt-12">
      <h2 className="text-xl font-bold text-foreground">
        Full narration script &amp; shot list
      </h2>
      <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
        Hand this to whoever records the video. Each row is one shot: what to
        show on screen and exactly what to say. Total runtime is roughly{' '}
        {runtime}. Print this page for a paper copy.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left">
              <th scope="col" className="w-12 px-4 py-3 font-semibold text-foreground">
                Shot
              </th>
              <th scope="col" className="w-[38%] px-4 py-3 font-semibold text-foreground">
                What to show
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-foreground">
                Narration (read aloud)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {slides.map((slide, i) => (
              <tr key={slide.label} className="align-top">
                <td className="px-4 py-4 font-semibold tabular-nums text-accent">
                  {i + 1}
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium text-foreground">{slide.label}</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    {slide.imageAlt}
                  </p>
                </td>
                <td className="px-4 py-4 leading-relaxed text-foreground">
                  {slide.narration}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-muted/40 p-5">
        <h3 className="font-semibold text-foreground">Recording tips</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            Click <strong className="text-foreground">Recording mode</strong>,
            press play, then start your screen recorder (Loom, QuickTime,
            Zoom, or Windows Game Bar all work) capturing this browser tab.
          </li>
          <li>
            Read each narration block while its step is on screen — the slide
            timing leaves room to speak at a relaxed pace.
          </li>
          <li>
            Prefer live footage instead of screenshots? Use the shot list
            above and record yourself clicking through the real portal — the
            narration works the same either way.
          </li>
          <li>
            When finished, you can upload the video into the course from the
            admin dashboard like any other training video.
          </li>
        </ul>
      </div>
    </section>
  )
}
