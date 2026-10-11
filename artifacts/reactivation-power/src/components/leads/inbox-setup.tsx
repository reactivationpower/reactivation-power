import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getInboxSettings, saveInboxSettings } from '@/app/actions/sales-inbox'
import { ErrorBox, Skeleton, btn, card, errMsg } from '@/components/leads/ui'

export function InboxSetup() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sales-inbox', 'settings'], queryFn: getInboxSettings })
  const [sms, setSms] = useState<boolean>()
  const save = useMutation({
    mutationFn: saveInboxSettings,
    onSuccess: () => { toast.success('Texting setup saved'); setSms(undefined); qc.invalidateQueries({ queryKey: ['sales-inbox'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })
  if (q.isLoading) return <section className={card}><Skeleton rows={2} /></section>
  if (q.isError || !q.data) return <section className={card}><ErrorBox error={q.error} retry={() => q.refetch()} /></section>
  if (!q.data.superAdmin) return null
  return <section className={card + ' space-y-4 break-words'} data-testid="section-inbox-setup">
    <h2 className="font-semibold">Turn on texting</h2>
    <p className="text-sm">Texts go out from your GoHighLevel number. Replies show up in each lead's text thread. Check the box and save once to turn texting on.</p>
    <p className="text-xs text-muted-foreground">Email replies go to <strong>{q.data.replyTo}</strong>.</p>
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={sms ?? q.data.settings.sms_ready} onChange={e => setSms(e.target.checked)} data-testid="checkbox-sms-ready" />
      <span>Our GoHighLevel number is approved for texting (registration done, opt-outs on).</span>
    </label>
    <button className={btn} disabled={sms === undefined || save.isPending} onClick={() => save.mutate({ smsReady: sms! })} data-testid="button-save-inbox-setup">
      {save.isPending ? 'Saving...' : 'Save texting setup'}
    </button>
  </section>
}
