import { Activity, Scale, Smile, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SERVICE_GROUPS, type ServiceGroupId } from '@/lib/service-catalog'

// TEMPORARY preview for the "weight loss on two cards" proposal. Delete after review.

const GROUP_ICONS: Record<ServiceGroupId, LucideIcon> = {
  chiropractic: Activity,
  dental: Smile,
  medspa: Sparkles,
  weight: Scale,
}

type Variant = Partial<Record<ServiceGroupId, string>>

const VARIANT_A: Variant = {
  chiropractic: 'ChiroThin & Weight Loss Programs',
  medspa: 'GLP-1 & Weight Loss Programs',
}

const VARIANT_B: Variant = {
  chiropractic: 'Weight Loss Programs',
  medspa: 'Weight Loss Programs',
}

function Cards({ extra, only }: { extra: Variant; only?: ServiceGroupId[] }) {
  const groups = only
    ? SERVICE_GROUPS.filter((g) => only.includes(g.id))
    : SERVICE_GROUPS
  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map((group) => {
        const Icon = GROUP_ICONS[group.id]
        const extraLine = extra[group.id]
        return (
          <li
            key={group.id}
            className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6"
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
              {extraLine && (
                <li className="flex items-start gap-2.5 text-sm leading-snug text-foreground">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                  {extraLine}
                </li>
              )}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

export default function TmpCardsPreview() {
  return (
    <main className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-12 md:px-6">
        <section id="variant-a" className="flex flex-col gap-6">
          <h2 className="text-xl font-bold text-foreground">
            Option A: buyer-specific wording (all four cards)
          </h2>
          <Cards extra={VARIANT_A} />
        </section>

        <section id="variant-b" className="flex flex-col gap-6">
          <h2 className="text-xl font-bold text-foreground">
            Option B: plain wording (the two cards that change)
          </h2>
          <Cards extra={VARIANT_B} only={['chiropractic', 'medspa']} />
        </section>
      </div>
    </main>
  )
}
