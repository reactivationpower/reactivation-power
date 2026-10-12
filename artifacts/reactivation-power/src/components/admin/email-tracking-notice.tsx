/** Configuration is not evidence of a successful provider event or inbox receipt. */
export function EmailTrackingNotice({ configured }: { configured: boolean | null }) {
  if (configured === null) return null
  return (
    <div role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
      <p className="font-medium">
        {configured ? 'App-email tracking setup still needs a delivery check.' : 'App-email delivery updates are not connected.'}
      </p>
      <p className="mt-1">
        {configured
          ? 'A signing secret is saved, but that alone does not confirm tracking works. Send a sample only to an approved test inbox, check for a matching delivery event in the log, and ask the recipient to confirm receipt.'
          : 'Patient Pipeline cannot show delivery updates for the account emails it sends through Resend. This does not mean sending is broken. “Accepted” means Resend accepted the email, not that it reached the inbox. Send failures are still shown below.'}
      </p>
      <p className="mt-1">
        This does not cover marketing campaigns sent from GoHighLevel. All marketing templates can still be previewed, copied, downloaded, and imported into GoHighLevel. General system health is separate from email delivery.
      </p>
      {!configured && (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium">How to connect delivery updates</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>In the sending Resend account, add or check the webhook at https://patientpipeline.app/api/webhooks/resend.</li>
            <li>Enable sent, delivered, bounced, suppressed, failed, complained, delivery delayed, opened, and clicked events.</li>
            <li>Save its signing secret securely as RESEND_WEBHOOK_SECRET in the published server’s secrets, then republish with the owner’s approval. Do not paste the secret into chat.</li>
            <li>Send one sample to an approved inbox. Confirm Resend reports a successful webhook response and the matching email shows delivery evidence here. Ask the recipient to check the inbox and spam folder.</li>
          </ol>
        </details>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        A “delivered” event means the recipient’s mail server accepted the email; it does not guarantee inbox placement or that a person read it.
      </p>
    </div>
  )
}
