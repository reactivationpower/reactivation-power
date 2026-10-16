import {
  extractSlots,
  getMasterScript,
  getNiches,
  getScriptSections,
} from '@/lib/data/reactivation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NicheManager } from '@/components/admin/niche-manager'
import { MasterScriptEditor } from '@/components/admin/master-script-editor'
import { NicheSectionsEditor } from '@/components/admin/niche-sections-editor'

export default async function AdminReactivationPage() {
  const [niches, script, sections] = await Promise.all([
    getNiches(),
    getMasterScript(),
    getScriptSections(),
  ])

  const slots = script ? extractSlots(script.body) : []

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-accent">Reactivation</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">
          Scripts &amp; Niches
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage the master call script, the services (niches) participants can
          choose, and the niche-specific wording that fills each{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">
            {'{{slot}}'}
          </code>{' '}
          in the script.
        </p>
      </div>

      <Tabs defaultValue="script">
        <TabsList>
          <TabsTrigger value="script" className="px-4">
            Master Script
          </TabsTrigger>
          <TabsTrigger value="sections" className="px-4">
            Niche Sections
          </TabsTrigger>
          <TabsTrigger value="niches" className="px-4">
            Niches
          </TabsTrigger>
        </TabsList>

        <TabsContent value="script" className="mt-4">
          {script ? (
            <MasterScriptEditor script={script} slots={slots} />
          ) : (
            <p className="text-muted-foreground">No master script found.</p>
          )}
        </TabsContent>

        <TabsContent value="sections" className="mt-4">
          <NicheSectionsEditor
            niches={niches}
            slots={slots}
            sections={sections}
            masterBody={script?.body ?? ''}
          />
        </TabsContent>

        <TabsContent value="niches" className="mt-4">
          <NicheManager niches={niches} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
