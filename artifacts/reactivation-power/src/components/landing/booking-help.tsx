import { useState } from 'react'
import { requestSavedInquiryHelp, checkSavedBooking } from '@/app/actions/booking'
import { useLocation } from 'wouter'
import { bookingDestination } from '@/lib/booking-destination'
export function BookingHelp({ bookingRef, funnelSource, thankYouHref }: { bookingRef?: string; funnelSource?: string; thankYouHref: string }) {
  const [, navigate] = useLocation()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (!bookingRef) return null
  return <div className="mt-4 text-center text-sm">
    <button disabled={busy} className="mr-3 rounded-md border px-4 py-2 font-semibold disabled:opacity-50" onClick={async () => {
      setBusy(true)
      try {
        const result = await checkSavedBooking(bookingRef)
        if (result.ok) navigate(bookingDestination({ funnelSource, thankYouHref,
          confirmationToken: result.confirmationToken, slot: result.bookedSlot, timezone: result.bookedTimezone }))
        else setMessage(result.error)
      } catch { setMessage('Unable to check your booking right now. Please retry shortly; we will not create another appointment.') }
      finally { setBusy(false) }
    }}>Check booking status</button>
    <button disabled={busy} className="rounded-md border px-4 py-2 font-semibold disabled:opacity-50" onClick={async () => {
      setBusy(true)
      try {
        const result = await requestSavedInquiryHelp(bookingRef)
        setMessage(result.message ?? result.error)
      } catch { setMessage('Unable to save your help request right now. Please retry shortly.') }
      finally { setBusy(false) }
    }}>{busy ? 'Saving request…' : 'Request scheduling help'}</button>
    {message && <p role="status" className="mt-3">{message}</p>}
  </div>
}
