import { configureNativeWake } from '../src/lib/sales-leads/wake'
import { pool } from '@workspace/db'

// Called only after explicit approval; argument comes from getDeploymentInfo.
try {
  const result = await configureNativeWake(process.argv[2] ?? '')
  console.log('Internal sales scheduler configured',result)
} finally {
  await pool.end()
}
