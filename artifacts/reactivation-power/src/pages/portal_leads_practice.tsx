import { Link } from 'wouter'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function LeadPracticeSelectPage() {
  const { data, loading, error } = usePageData<{ campaigns: { id: string; name: string; status: string }[] }>('/portal/leads/practice')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const campaigns = data!.campaigns.filter((campaign) => campaign.status !== 'archived')
  return <div className="mx-auto w-full max-w-3xl px-4 py-12">
    <Link href="/portal/leads/start" className="text-sm font-medium text-accent hover:underline" data-testid="link-practice-home">← Lead Follow-Up Home</Link>
    <h1 className="mt-6 text-3xl font-bold text-foreground">Practice the Script</h1>
    <p className="mt-2 text-muted-foreground">Choose a campaign to rehearse the script for its service and offer.</p>
    {campaigns.length ? <ul className="mt-8 grid gap-3">
      {campaigns.map((campaign) => <li key={campaign.id}>
        <Link href={`/portal/campaigns/${campaign.id}/practice`} data-testid={`link-practice-campaign-${campaign.id}`} className="block rounded-lg border border-border bg-card p-5 font-medium text-foreground transition-colors hover:border-accent">
          {campaign.name} <span className="text-sm text-muted-foreground">({campaign.status})</span> →
        </Link>
      </li>)}
    </ul> : <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-8">
      <p className="font-medium text-foreground" data-testid="text-practice-empty">No campaigns available to practice yet.</p>
      <p className="mt-2 text-sm text-muted-foreground">Set up a campaign first, then come back to rehearse its script.</p>
      <Link href="/portal/campaigns" data-testid="link-practice-campaign-setup" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">Go to Campaigns →</Link>
    </div>}
  </div>
}