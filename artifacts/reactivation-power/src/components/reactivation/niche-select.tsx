import { useMemo, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronDown, Search } from 'lucide-react'
import { displayNicheName } from '@workspace/niche-catalog'
import { cn } from '@/lib/utils'

export interface NicheSelectItem {
  value: string
  label: string
  disabled?: boolean
}

interface NicheSelectProps {
  items: readonly NicheSelectItem[]
  value: string | null
  onValueChange: (value: string | null) => void
  'aria-label': string
  id?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  'data-testid'?: string
}

/** Presentation only: persisted niche names and IDs always remain unchanged. */
export function nicheDisplayLabel(label: string) {
  return displayNicheName(label)
}

function matchesItem(item: NicheSelectItem, query: string) {
  const displayLabel = nicheDisplayLabel(item.label)
  const searchable = `${item.label} ${displayLabel} softwave shockwave acoustic wave`
  const words = query.toLocaleLowerCase().trim().split(/[\s/_-]+/).filter(Boolean)
  const haystack = searchable.toLocaleLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * A niche-only searchable dropdown. Values passed to callers are the original
 * IDs/sentinels; display aliases never leak into persistence or niche matching.
 */
export function NicheSelect({
  items,
  value,
  onValueChange,
  'aria-label': ariaLabel,
  id,
  placeholder = 'Select niche',
  searchPlaceholder = 'Search niches…',
  emptyMessage = 'No niches found.',
  disabled = false,
  className,
  'data-testid': testId,
}: NicheSelectProps) {
  const [query, setQuery] = useState('')
  const displayItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        displayLabel: nicheDisplayLabel(item.label),
      })),
    [items],
  )
  const selectedItem =
    displayItems.find((item) => item.value === value) ?? null

  return (
    <Combobox.Root
      items={displayItems}
      value={selectedItem}
      onValueChange={(item) => onValueChange(item?.value ?? null)}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (!open) setQuery('')
      }}
      filter={matchesItem}
      itemToStringLabel={(item) => item.displayLabel}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
      disabled={disabled}
    >
      <Combobox.Trigger
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        data-testid={testId}
        className={cn(
          'flex min-h-8 w-full max-w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          className,
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 whitespace-normal break-words leading-5',
            !selectedItem && 'text-muted-foreground',
          )}
        >
          {selectedItem?.displayLabel ?? placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={4}
          align="start"
          className="isolate z-[60] w-(--anchor-width) min-w-56 max-w-[min(24rem,calc(100vw-2rem))]"
        >
          <Combobox.Popup className="max-h-(--available-height) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <div className="relative border-b border-border p-2">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Combobox.Input
                autoFocus
                placeholder={searchPlaceholder}
                aria-label={`Search ${ariaLabel.toLocaleLowerCase()}`}
                className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <Combobox.List className="max-h-72 overflow-y-auto p-1">
              {(item: (typeof displayItems)[number], index: number) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  index={index}
                  disabled={item.disabled}
                  className="relative flex w-full cursor-default items-start gap-2 rounded-md py-2 pl-2 pr-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">
                    {item.displayLabel}
                  </span>
                  <Combobox.ItemIndicator className="absolute right-2 top-2.5">
                    <Check className="size-4" aria-hidden="true" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}