import { redirect } from 'next/navigation'

/**
 * The old /portal/reactivation tree was split into /portal/dialer (calling)
 * and /portal/contacts (list management). Keep old links working.
 */
export default async function LegacyReactivationRedirect({
  params,
}: {
  params: Promise<{ rest?: string[] }>
}) {
  const { rest = [] } = await params
  const [head, ...tail] = rest

  if (head === 'contacts' && tail[0]) redirect(`/portal/contacts/${tail[0]}`)
  if (head === 'call' && tail[0]) redirect(`/portal/dialer/call/${tail[0]}`)
  if (head === 'script') redirect('/portal/dialer/script')
  redirect('/portal/dialer')
}
