import { Activity, Scale, Smile, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SERVICE_GROUPS, type ServiceGroupId } from '@/lib/service-catalog'

const GROUP_ICONS: Record<ServiceGroupId, LucideIcon> = {
  chiropractic: Activity,
  dental: Smile,
  medspa: Sparkles,
  weight: Scale,
}

/**
 * The "which services do you have scripts for" section, shared by the
 * homepage and How It Works. Reads the catalog so both pages and the lead
 * form always list the same services under the same names.
 */
export function ServicesWeSupport({
  surface = 'background',
  className = '',
}: {
  /** Match the section to the alternating page background it sits on */
  surface?: 'background' | 'card'
  /** Border classes so the page controls separators against its neighbors */
  className?: string
}) {
  const sectionBg = surface === 'card' ? 'bg-card' : 'bg-background'
  const cardBg = surface === 'card' ? 'bg-background' : 'bg-card'

  return (
    <section
      className={`${sectionBg} ${className}`.trim()}
      aria-labelledby="services-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="services-heading"
            className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Scripts written for the services you actually offer
          </h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
            A lapsed chiropractic patient and a past Botox client need very
            different conversations. Every service below has its own
            word-for-word script, written for that service and that patient.
          </p>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_GROUPS.map((group) => {
            const Icon = GROUP_ICONS[group.id]
            return (
              <li
                key={group.id}
                className={`flex flex-col gap-5 rounded-xl border border-border ${cardBg} p-6`}
              >
                <div className="flex flex-col gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10">
                    <Icon className="size-5 text-accent" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold leading-snug text-foreground">
                      {group.title}
                    </h3>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {group.audience}
                    </p>
                  </div>
                </div>
                <ul className="flex flex-col gap-2 border-t border-border pt-4">
                  {group.services.map((service) => (
                    <li
                      key={service.niche}
                      className="flex items-start gap-2.5 text-sm leading-snug text-foreground"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      {service.label}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {"Don't see your service? Tell us on the call and we'll build the script for you."}
        </p>
      </div>
    </section>
  )
}
