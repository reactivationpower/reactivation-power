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
  X,
} from 'lucide-react'

import {
  confirmPayment,
  createPaymentLink,
  deletePaymentLink,
  listPaymentLinks,
  provisionAccountsNow,
  startPaymentCheckout,
  type PaymentLink,
  type StaffMember,
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
import { Label } from '@/components/ui/label'
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

const MAX_STAFF = 5

type StatusFilter = 'all' | 'pending' | 'paid'
type SortKey = 'name' | 'amount_cents' | 'status' | 'created_at' | 'paid_at'
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

export function StatusPill({ status }: { status: 'paid' | 'pending' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        status === 'paid'
          ? 'bg-success/15 text-success'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          status === 'paid' ? 'bg-success' : 'bg-muted-foreground/60'
        }`}
      />
      {status === 'paid' ? 'Paid' : 'Pending'}
    </span>
  )
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

  // Create form state
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Per-link UI state
  const [qrFor, setQrFor] = useState<PaymentLink | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [chargeFor, setChargeFor] = useState<PaymentLink | null>(null)
  const [provisioningId, setProvisioningId] = useState<string | null>(null)

  const maskPhone = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 10)
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setCreating(true)
    const res = await createPaymentLink({
      name,
      email,
      phone,
      staff,
      amountDollars: Number(amount),
    })
    setCreating(false)
    if (!res.ok || !res.link) {
      setFormError(res.error ?? 'Something went wrong.')
      notifyError('Could not create the link', res.error)
      return
    }
    setLinks((prev) => [res.link as PaymentLink, ...prev])
    setName('')
    setEmail('')
    setPhone('')
    setAmount('')
    setStaff([])
    setCreateOpen(false)
    notifyDone(
      'Payment link created',
      `${res.link.name} — ${formatUsd(res.link.amount_cents)}`,
    )
  }

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
              `Payment received — ${formatUsd(l.amount_cents)}`,
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
          av = a.amount_cents
          bv = b.amount_cents
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

  const staffCanAdd = staff.length < MAX_STAFF

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
            New payment link
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
              New payment link
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {sortHead('Person', 'name', 'pl-4')}
                <TableHead>Email / phone</TableHead>
                {sortHead('Amount', 'amount_cents', 'text-right [&>button]:justify-end [&>button]:w-full')}
                {sortHead('Status', 'status')}
                {sortHead('Created', 'created_at')}
                {sortHead('Paid', 'paid_at')}
                <TableHead className="w-12 pr-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={7}
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
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatUsd(link.amount_cents)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <StatusPill status={link.status} />
                          {needsProvision ? (
                            <span className="text-[11px] text-amber-600">
                              Accounts not created
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(link.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(link.paid_at)}
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setChargeFor(link)}
                                >
                                  <CreditCard />
                                  Charge card now
                                </DropdownMenuItem>
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
                            {!isPaid ? (
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

      {/* ── Create dialog ───────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New payment link</DialogTitle>
            <DialogDescription>
              Product: Reactivation Power Access
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-name">Customer name</Label>
              <Input
                id="pay-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Jane Smith"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-email">Email</Label>
              <Input
                id="pay-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@practice.com"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-phone">Phone</Label>
              <Input
                id="pay-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(555) 555-1234"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-amount">Amount (USD)</Label>
              <Input
                id="pay-amount"
                type="number"
                min="0.5"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="4997.00"
                required
              />
            </div>

            {/* Staff members */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Staff members</Label>
                <span className="text-xs text-muted-foreground">
                  {staff.length}/{MAX_STAFF}
                </span>
              </div>
              {staff.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2">
                    <Input
                      value={s.name}
                      onChange={(e) =>
                        setStaff((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, name: e.target.value } : p,
                          ),
                        )
                      }
                      placeholder={`Staff ${i + 1} name`}
                      aria-label={`Staff ${i + 1} name`}
                    />
                    <Input
                      type="email"
                      value={s.email}
                      onChange={(e) =>
                        setStaff((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, email: e.target.value } : p,
                          ),
                        )
                      }
                      placeholder={`Staff ${i + 1} email`}
                      aria-label={`Staff ${i + 1} email`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove staff ${i + 1}`}
                    onClick={() =>
                      setStaff((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              {staffCanAdd && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit bg-transparent"
                  onClick={() =>
                    setStaff((prev) => [...prev, { name: '', email: '' }])
                  }
                >
                  <Plus className="size-3.5" />
                  Add staff member
                </Button>
              )}
            </div>

            {formError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create payment link'
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
