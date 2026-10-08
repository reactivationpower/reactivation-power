/**
 * Disposable fixture for the idle-session browser regression check.
 * Bundle with esbuild (the app aliases are not understood by plain Node).
 * Never touches existing participants or administrators.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { getAdminClient } from '@/lib/supabase/admin'
import { pool } from '@workspace/db'
import { authDigest, hashPortalPassword } from '@/lib/auth/portal-password'
import { createChallenge } from '@/lib/auth/portal-challenges'

const file = '/tmp/patient-pipeline-idle-fixture.json'
const supabase = getAdminClient()
const command = process.argv[2]
if (command === 'create') {
  const suffix = randomUUID()
  const email = `idle-${suffix}@example.invalid`
  const password = randomUUID() + 'Aa1!'
  const admin = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { admin_role: 'super_admin', admin_active: true },
  })
  if (admin.error || !admin.data.user) throw new Error(admin.error?.message ?? 'Create admin failed')
  const participant = await supabase.from('participants').insert({
    email, first_name: 'Idle', last_name: 'Test', role: 'owner',
    is_active: true, is_demo: true, practice_name: 'Disposable idle test',
  }).select('id').single()
  if (participant.error) {
    await supabase.auth.admin.deleteUser(admin.data.user.id)
    throw new Error(participant.error.message)
  }
  writeFileSync(file, JSON.stringify({ email, password, adminId: admin.data.user.id, participantId: participant.data.id }))
  process.stdout.write('Disposable fixture created at ' + file + '\n')
} else {
  const fixture = JSON.parse(readFileSync(file, 'utf8'))
  if (command === 'prepare') {
    if (!fixture.callerId) {
      const caller = await supabase.from('participants').insert({
        email: `idle-caller-${randomUUID()}@example.invalid`, first_name: 'Idle', last_name: 'Caller',
        role: 'staff', parent_id: fixture.participantId, is_active: true, is_demo: true,
      }).select('id,email').single()
      if (caller.error) throw new Error(caller.error.message)
      fixture.callerId = caller.data.id; fixture.callerEmail = caller.data.email
    }
    for (const [id, email] of [[fixture.participantId, fixture.email], [fixture.callerId, fixture.callerEmail]]) {
      await pool.query(`INSERT INTO portal_auth_credentials (participant_id,email,password_hash,version)
        VALUES ($1,$2,$3,$4) ON CONFLICT (participant_id) DO UPDATE
        SET password_hash=EXCLUDED.password_hash,version=EXCLUDED.version`,
      [id, email, await hashPortalPassword(fixture.password), randomUUID()])
    }
    writeFileSync(file, JSON.stringify(fixture))
    process.stdout.write('Fixture passwords prepared\n')
  } else if (command === 'challenge' || command === 'password-link') {
    const caller = process.argv[3] === 'caller'
    const id = caller ? fixture.callerId : fixture.participantId
    const email = caller ? fixture.callerEmail : fixture.email
    const credential = await pool.query('SELECT version FROM portal_auth_credentials WHERE participant_id=$1', [id])
    const challenge = await createChallenge({ id, email }, command === 'challenge' ? 'login' : 'password', credential.rows[0]?.version ?? null)
    if (command === 'challenge') {
      fixture.loginToken = challenge.token; fixture.loginCode = challenge.code
    } else fixture.passwordToken = challenge.token
    writeFileSync(file, JSON.stringify(fixture))
    process.stdout.write('Fixture challenge created (values only in fixture file)\n')
  } else if (command === 'age') {
    const seconds = Number(process.argv[4])
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid age')
    const result = await pool.query(`UPDATE auth_idle_sessions
      SET last_interaction_at = statement_timestamp() - ($2::double precision * interval '1 second')
      WHERE id = $1 AND subject_id IN ($3, $4, $5) RETURNING id`,
    [process.argv[3], seconds, fixture.adminId, fixture.participantId, fixture.callerId ?? fixture.participantId])
    if (!result.rowCount) throw new Error('Not a fixture session')
    process.stdout.write('Fixture session aged\n')
  } else if (command === 'cleanup') {
    const subjectIds = [fixture.adminId, fixture.participantId, fixture.callerId].filter(Boolean)
    await pool.query('DELETE FROM auth_idle_sessions WHERE subject_id = ANY($1::text[])', [subjectIds])
    const keys = []
    for (const email of [fixture.email, fixture.callerEmail].filter(Boolean)) keys.push(authDigest(`password-account:${email}`))
    for (const id of [fixture.participantId, fixture.callerId].filter(Boolean)) {
      keys.push(authDigest(`email-minute:${id}`), authDigest(`email-hour:${id}`))
    }
    await pool.query('DELETE FROM portal_auth_limits WHERE key = ANY($1::text[])', [keys])
    if (fixture.callerId) {
      const caller = await supabase.from('participants').delete().eq('id', fixture.callerId)
      if (caller.error) throw new Error(caller.error.message)
    }
    const deleted = await supabase.from('participants').delete().eq('id', fixture.participantId)
    if (deleted.error) throw new Error(deleted.error.message)
    const removed = await supabase.auth.admin.deleteUser(fixture.adminId)
    if (removed.error) throw new Error(removed.error.message)
    process.stdout.write('Disposable fixture removed\n')
  } else throw new Error('Expected create, prepare, challenge, password-link, age or cleanup')
}
await pool.end()
