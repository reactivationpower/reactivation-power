import { Router, type IRouter } from 'express'
import { getAdminSessionFromRequest } from '@/lib/auth/admin-session'
import { runWithRequestContext } from '@/lib/request-context'
import { buildTextHandoff } from '@/lib/marketing/text-handoff'
import { logger } from '@/lib/logger'

const router: IRouter = Router()
router.get('/admin/marketing-texts/export', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    await runWithRequestContext(req, res, async () => {
      const session = await getAdminSessionFromRequest(req)
      if (!session || session.role !== 'super_admin') {
        res.status(401).send('Unauthorized')
        return
      }
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="patient-pipeline-marketing-texts.zip"',
      }).send(Buffer.from(buildTextHandoff()))
    })
  } catch (err) {
    logger.error({ err }, 'marketing text export failed')
    res.status(500).send('Could not download the marketing texts. Please try again.')
  }
})
export default router
