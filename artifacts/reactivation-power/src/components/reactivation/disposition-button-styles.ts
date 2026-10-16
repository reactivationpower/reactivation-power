/**
 * Shared styling for the call-outcome ("disposition") buttons.
 *
 * The scripts' coaching notes tell the caller to "add your notes and press the
 * green Scheduled button below", so the `primary` (Scheduled) button must read
 * as green even before it is tapped. Both the live call screen and the
 * practice-mode preview pull their classes from here so the two never drift.
 */
export type DispositionTone = 'primary' | 'danger'

export const DISPOSITION_BUTTON_BASE =
  'inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-medium'

export function dispositionButtonClasses(
  tone: DispositionTone | undefined,
  active: boolean,
): string {
  if (tone === 'danger') {
    return active
      ? 'border-destructive bg-destructive text-destructive-foreground'
      : 'border-transparent bg-transparent text-destructive hover:bg-destructive/10'
  }
  if (tone === 'primary') {
    // Green at rest (outline + text), solid green once chosen.
    return active
      ? 'border-success bg-success text-white shadow-sm'
      : 'border-success bg-success/10 text-success hover:bg-success/20'
  }
  return active
    ? 'border-accent bg-accent text-accent-foreground shadow-sm'
    : 'border-input bg-background text-foreground hover:bg-muted'
}
