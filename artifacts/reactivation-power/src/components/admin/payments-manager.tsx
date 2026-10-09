// @ts-nocheck

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js'
import QRCode from 'qrcode'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  QrCode,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react'

import {
  confirmPayment,
  deletePaymentLink,
  listPaymentLinks,
  provisionAccountsNow,
  startPaymentCheckout,
  type PaymentLink,
} from '@/app/actions/payments'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NewCustomerLinkDialog } from '@/components/admin/new-customer-link-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { notifyDone, notifyError } from '@/lib/notify'
import { useRouter } from '@/hooks/use-router'

import { stripePromise } from '@/lib/stripe-client'

type StatusFilter = 'all' | 'pending' | 'paid'
type SortKey = 'name' | 'amount_cents' | 'status' | 'created_at' | 'paid_at' | 'type' | 'rep_name' | 'next_payment_at'
type SortDir = 'asc' | 'desc'

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function payUrl(token: string): string {
  return `${window.location.origin}/pay/${token}`
}

/** Status of a link: paid, pending, or (subscription) setup paid but second card still missing. */
export function linkStatus(link: PaymentLink): 'paid' | 'pending' | 'setup_paid' {
  if (link.status === 'paid') return 'paid'
  if (link.type === 'subscription' && link.stage === 'secondary') return 'setup_paid'
  return 'pending'
}

export function StatusPill({ status }: { status: 'paid' | 'pending' | 'setup_paid' }) {
  const paid = status === 'paid'
  const partial = status === 'setup_paid'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        paid
          ? 'bg-success/15 text-success'
          : partial
            ? 'bg-amber-500/15 text-amber-700'
            : 'bg-muted text-muted-foreground'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          paid ? 'bg-success' : partial ? 'bg-amber-500' : 'bg-muted-foreground/60'
        }`}
      />
      {paid ? 'Paid' : partial ? 'Setup paid · 2nd card' : 'Pending'}
    </span>
  )
}

export function TypePill({ type }: { type: 'one_time' | 'subscription' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        type === 'subscription'
          ? 'border-primary/30 bg-primary/5 text-primary'
          : 'border-border bg-card text-muted-foreground'
      }`}
    >
      {type === 'subscription' ? 'Subscription' : 'One-time'}
    </span>
  )
}

/** Amount line for the table: setup + monthly for subscriptions. */
export function amountLabel(link: PaymentLink): string {
  if (link.type !== 'subscription') return formatUsd(link.amount_cents)
  const setup = link.setup_fee_cents > 0 ? `${formatUsd(link.setup_fee_cents)} setup` : 'No setup fee'
  return `${setup} · ${formatUsd(link.monthly_cents)}/mo`
}

export function PaymentsManager({
  initialLinks,
}: {
  initialLinks: PaymentLink[]
}) {
  const [, setLocation] = useLocation()
  const router = useRouter()
  const [links, setLinks] = useState(initialLinks)
  useEffect(() => setLinks(initialLinks), [initialLinks])

  // Table controls
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [createOpen, setCreateOpen] = useState(() => Boolean(new URLSearchParams(window.location.search).get('lead')))

  // Per-link UI state
  const [qrFor, setQrFor] = useState<PaymentLink | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [chargeFor, setChargeFor] = useState<PaymentLink | null>(null)
  const [provisioningId, setProvisioningId] = useState<string | null>(null)

  /** Re-read the list from the server after a status change. */
  async function refreshLinks() {
    try {
      setLinks(await listPaymentLinks())
    } catch {
      // Non-fatal — the router refresh will catch up on next navigation
    }
  }

  /**
   * Poll while the tab is visible so a payment made on the customer's own
   * device still announces itself here with a toast and a chime.
   */
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      let fresh: PaymentLink[]
      try {
        fresh = await listPaymentLinks()
      } catch {
        return
      }
      setLinks((prev) => {
        const wasPending = new Set(
          prev.filter((l) => l.status === 'pending').map((l) => l.id),
        )
        for (const l of fresh) {
          if (l.status === 'paid' && wasPending.has(l.id)) {
            notifyDone(
              l.type === 'subscription'
                ? `Subscription started — ${formatUsd(l.monthly_cents)}/mo`
                : `Payment received — ${formatUsd(l.amount_cents)}`,
              `${l.name} just paid. Portal accounts are ready.`,
            )
          }
        }
        return fresh
      })
    }, 20000)
    return () => window.clearInterval(id)
  }, [])

  async function handleCopy(link: PaymentLink) {
    try {
      await navigator.clipboard.writeText(payUrl(link.token))
      notifyDone('Payment link copied', `${link.name} — ready to paste`)
    } catch {
      notifyError('Could not copy the link')
    }
  }

  async function handleQr(link: PaymentLink) {
    try {
      const dataUrl = await QRCode.toDataURL(payUrl(link.token), {
        width: 320,
        margin: 2,
        color: { dark: '#1d3d47', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl)
      setQrFor(link)
    } catch {
      notifyError('Could not generate the QR code')
    }
  }

  async function handleDelete(link: PaymentLink) {
    if (!window.confirm(`Delete the pending link for ${link.name}?`)) return
    const res = await deletePaymentLink(link.id)
    if (!res.ok) {
      notifyError(res.error ?? 'Could not delete the link')
      return
    }
    setLinks((prev) => prev.filter((l) => l.id !== link.id))
    notifyDone('Payment link deleted', link.name)
  }

  async function handleProvision(link: PaymentLink) {
    setProvisioningId(link.id)
    const res = await provisionAccountsNow(link.id)
    setProvisioningId(null)
    if (!res.ok) {
      notifyError(res.error ?? 'Could not create the accounts')
      return
    }
    notifyDone('Portal accounts created', `${link.name} can now log in`)
    void refreshLinks()
  }

  const startChargeSession = useCallback(() => {
    if (!chargeFor) return Promise.resolve(null as unknown as string)
    return startPaymentCheckout(chargeFor.token).then((secret) => {
      if (!secret) throw new Error('Could not start checkout')
      return secret
    })
  }, [chargeFor])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = links.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (!q) return true
      const hay = [
        l.name,
        l.email,
        l.phone ?? '',
        l.business_name ?? '',
        l.rep_name ?? '',
        ...(l.staff ?? []).flatMap((s) => [s.name ?? '', s.email ?? '']),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'name':
          av = a.name.toLowerCase()
          bv = b.name.toLowerCase()
          break
        case 'amount_cents':
          av = a.type === 'subscription' ? a.monthly_cents : a.amount_cents
          bv = b.type === 'subscription' ? b.monthly_cents : b.amount_cents
          break
        case 'status':
          av = a.status
          bv = b.status
          break
        case 'created_at':
          av = new Date(a.created_at).getTime()
          bv = new Date(b.created_at).getTime()
          break
        case 'paid_at':
          av = a.paid_at ? new Date(a.paid_at).getTime() : 0
          bv = b.paid_at ? new Date(b.paid_at).getTime() : 0
          break
        case 'type':
          av = a.type
          bv = b.type
          break
        case 'rep_name':
          av = (a.rep_name ?? '').toLowerCase()
          bv = (b.rep_name ?? '').toLowerCase()
          break
        case 'next_payment_at':
          av = a.next_payment_at ? new Date(a.next_payment_at).getTime() : 0
          bv = b.next_payment_at ? new Date(b.next_payment_at).getTime() : 0
          break
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [links, query, statusFilter, sortKey, sortDir])

  const counts = useMemo(
    () => ({
      all: links.length,
      pending: links.filter((l) => l.status === 'pending').length,
      paid: links.filter((l) => l.status === 'paid').length,
    }),
    [links],
  )

  function sortHead(label: string, column: SortKey, className = '') {
    const active = sortKey === column
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground ${
            active ? 'text-foreground' : ''
          }`}
          aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          {label}
          <Icon className={`size-3.5 ${active ? '' : 'opacity-50'}`} />
        </button>
      </TableHead>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or phone…"
            className="pl-9"
            aria-label="Search payments"
          />
        </div>
        <div
          role="tablist"
          aria-label="Filter by status"
          className="inline-flex rounded-md border border-border bg-card p-0.5 text-sm"
        >
          {(
            [
              ['all', 'All'],
              ['pending', 'Pending'],
              ['paid', 'Paid'],
            ] as [StatusFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={statusFilter === value}
              onClick={() => setStatusFilter(value)}
              className={`rounded-[5px] px-3 py-1.5 font-medium transition-colors ${
                statusFilter === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
              <span
                className={`ml-1.5 tabular-nums ${
                  statusFilter === value
                    ? 'text-primary-foreground/80'
                    : 'text-muted-foreground/70'
                }`}
              >
                {counts[value]}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New customer
          </Button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {links.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <CreditCard className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                No payment links yet
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Create your first link to start collecting payments.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New customer
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {sortHead('Customer', 'name', 'pl-4')}
                <TableHead>Email / phone</TableHead>
                {sortHead('Type', 'type')}
                {sortHead('Amount', 'amount_cents', 'text-right [&>button]:justify-end [&>button]:w-full')}
                {sortHead('Status', 'status')}
                {sortHead('Rep', 'rep_name')}
                {sortHead('Created', 'created_at')}
                {sortHead('Paid', 'paid_at')}
                {sortHead('Next payment', 'next_payment_at')}
                <TableHead className="w-12 pr-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={10}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No payments match{query.trim() ? ` “${query.trim()}”` : ''}
                    {statusFilter !== 'all' ? ` in ${statusFilter}` : ''}.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((link) => {
                  const isPaid = link.status === 'paid'
                  const needsProvision = isPaid && !link.participant_id
                  const href = `/admin/payments/${link.id}`
                  return (
                    <TableRow
                      key={link.id}
                      tabIndex={0}
                      onClick={() => setLocation(href)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setLocation(href)
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="pl-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {link.name}
                          </span>
                          {link.business_name ? (
                            <span className="text-xs text-muted-foreground">
                              {link.business_name}
                            </span>
                          ) : null}
                          {link.staff.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              +{link.staff.length} staff
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[260px] flex-col">
                          <span className="truncate text-sm">{link.email}</span>
                          {link.phone ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {link.phone}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TypePill type={link.type} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                        {amountLabel(link)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <StatusPill status={linkStatus(link)} />
                          {needsProvision ? (
                            <span className="text-[11px] text-amber-600">
                              Accounts not created
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                        {link.rep_name ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(link.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(link.paid_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {link.type === 'subscription' ? formatDate(link.next_payment_at) : '—'}
                      </TableCell>
                      <TableCell
                        className="pr-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Actions for ${link.name}`}
                              />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setLocation(href)}>
                              <FileText />
                              Open detail
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopy(link)}>
                              <Copy />
                              Copy payment link
                            </DropdownMenuItem>
                            {!isPaid ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() =>
                                    window.open(
                                      payUrl(link.token),
                                      '_blank',
                                      'noopener',
                                    )
                                  }
                                >
                                  <ExternalLink />
                                  Open public link
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleQr(link)}>
                                  <QrCode />
                                  Show QR code
                                </DropdownMenuItem>
                                {link.type !== 'subscription' ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setChargeFor(link)}
                                    >
                                      <CreditCard />
                                      Charge card now
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </>
                            ) : null}
                            {needsProvision ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={provisioningId === link.id}
                                  onClick={() => handleProvision(link)}
                                >
                                  {provisioningId === link.id ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <UserPlus />
                                  )}
                                  Provision accounts now
                                </DropdownMenuItem>
                              </>
                            ) : null}
                            {!isPaid && linkStatus(link) === 'pending' ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => handleDelete(link)}
                                >
                                  <Trash2 />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>
      {links.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {links.length}
          {links.length === 1 ? ' payment' : ' payments'}
        </p>
      ) : null}

      <NewCustomerLinkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(link) => setLinks((prev) => [link, ...prev.filter(p => p.id !== link.id)])}
      />

      {/* ── QR dialog ───────────────────────────────────────── */}
      <Dialog
        open={qrFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQrFor(null)
            setQrDataUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to pay</DialogTitle>
            <DialogDescription>
              {qrFor
                ? `${qrFor.name} — ${formatUsd(qrFor.amount_cents)} for Reactivation Power Access`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl && (
            <div className="flex justify-center rounded-lg bg-white p-4">
              <img
                src={qrDataUrl}
                alt={`QR code for the payment link${qrFor ? ` for ${qrFor.name}` : ''}`}
                width={320}
                height={320}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Charge-now dialog (embedded Stripe Checkout) ────── */}
      <Dialog
        open={chargeFor !== null}
        onOpenChange={(open) => {
          if (!open) setChargeFor(null)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Charge card</DialogTitle>
            <DialogDescription>
              {chargeFor
                ? `${chargeFor.name} — ${formatUsd(chargeFor.amount_cents)} for Reactivation Power Access`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {chargeFor && (
            <EmbeddedCheckoutProvider
              key={chargeFor.token}
              stripe={stripePromise}
              options={{
                fetchClientSecret: startChargeSession,
                onComplete: () => {
                  // Verify with Stripe, mark paid, provision accounts
                  const paidLink = chargeFor
                  void confirmPayment(paidLink.token).then((res) => {
                    setChargeFor(null)
                    if (!res.paid) {
                      notifyError('Payment could not be verified')
                      return
                    }
                    notifyDone(
                      `Payment completed — ${formatUsd(paidLink.amount_cents)}`,
                      `${paidLink.name} is paid and their portal accounts are ready`,
                    )
                    router.refresh()
                    void refreshLinks()
                  })
                },
              }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
