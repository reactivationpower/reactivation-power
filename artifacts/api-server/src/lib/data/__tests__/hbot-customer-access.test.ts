import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pool } from '@workspace/db'

const migration = readFileSync(new URL('../../../../../../lib/db/migrations/0041_hbot_reactivation.sql', import.meta.url), 'utf8')
const published = JSON.parse(readFileSync(new URL('../../../../content/flows/hbot.json', import.meta.url), 'utf8'))

describe.skipIf(!process.env.SUPABASE_DB_URL)('HBOT customer access in an isolated rollback-only schema', () => {
  it('grants Chiro owners the existing live niche without duplicating it or changing selections and office copy', async () => {
    const client = await pool.connect()
    const schema = `hbot_access_test_${randomUUID().replaceAll('-', '')}`
    try {
      await client.query('BEGIN')
      await client.query(`CREATE SCHEMA "${schema}"`)
      await client.query(`SET LOCAL search_path TO "${schema}"`)
      await client.query('CREATE TABLE participants (id uuid PRIMARY KEY, role text, selected_niche_id uuid)')
      for (const table of ['niches', 'niche_access', 'script_flow_steps', 'script_flow_choices']) {
        await client.query(`CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`)
      }
      const chiroOwner = randomUUID(), spaOwner = randomUUID(), caller = randomUUID(), weightOwner = randomUUID()
      const chiro = randomUUID(), botox = randomUUID(), hbot = randomUUID(), weightLoss = randomUUID(), chiroThin = randomUUID()
      await client.query(`INSERT INTO niches(id,name,sector,is_active) VALUES
        ($1,'Chiropractic','healthcare',true),($2,'Botox','healthcare',true),($3,'HBOT','healthcare',true)`, [chiro, botox, hbot])
      await client.query(`INSERT INTO niches(id,name,sector,is_active) VALUES
        ($1,'Weight Loss (Not ChiroThin)','healthcare',true),($2,'ChiroThin','healthcare',true)`, [weightLoss, chiroThin])
      await client.query('INSERT INTO participants VALUES ($1,$4,$6),($2,$4,$7),($3,$5,$6)',
        [chiroOwner, spaOwner, caller, 'owner', 'staff', chiro, botox])
      await client.query(`INSERT INTO participants VALUES ($1,'owner',$2)`, [weightOwner, weightLoss])
      await client.query('INSERT INTO niche_access(participant_id,niche_id) VALUES ($1,$4),($2,$5),($3,$4)',
        [chiroOwner, spaOwner, caller, chiro, botox])
      await client.query(`INSERT INTO niche_access(participant_id,niche_id) VALUES ($1,$2),($1,$3),($4,$2)`,
        [weightOwner, weightLoss, chiroThin, spaOwner])
      await client.query('SAVEPOINT missing_flow')
      await expect(client.query(migration)).rejects.toThrow('complete HBOT caller flow')
      await client.query('ROLLBACK TO SAVEPOINT missing_flow')
      await client.query(`INSERT INTO script_flow_steps(niche_id,step_key,title,content,sort_order)
        SELECT $1,s.step_key,s.title,s.content,s.sort_order
        FROM jsonb_to_recordset($2::jsonb) AS s(step_key text,title text,content text,sort_order integer)`,
      [hbot, JSON.stringify(published.steps)])
      await client.query(`INSERT INTO script_flow_choices(niche_id,from_step_key,label,to_step_key,variant,sort_order)
        SELECT $1,c.from_step_key,c.label,c.to_step_key,c.variant,c.sort_order
        FROM jsonb_to_recordset($2::jsonb) AS c(from_step_key text,label text,to_step_key text,variant text,sort_order integer)`,
      [hbot, JSON.stringify(published.choices)])
      await client.query(`UPDATE script_flow_steps SET content=replace(content,$2,$3)
        WHERE niche_id=$1 AND step_key IN ('digging_in','digging_in_returning','digging_in_fully_back')`,
      [hbot, "How's your sleep been... good, average, or could be better?", "How's your sleep been?"])
      // Simulate an independent, already-published office wording change.
      await client.query(`UPDATE script_flow_steps SET content='Approved office wording' WHERE niche_id=$1 AND step_key='open'`, [hbot])
      await client.query(migration)
      await client.query(migration) // retry cannot duplicate access rows
      expect((await client.query('SELECT participant_id FROM niche_access WHERE niche_id=$1', [hbot])).rows)
        .toEqual([{ participant_id: chiroOwner }])
      expect((await client.query('SELECT count(*)::int AS n FROM niches')).rows[0].n).toBe(5)
      // Weight-loss and med-spa grants alone never establish Chiro-family access.
      expect((await client.query('SELECT count(*)::int AS n FROM niche_access WHERE niche_id=$1 AND participant_id=ANY($2::uuid[])',
        [hbot, [weightOwner, spaOwner, caller]])).rows[0].n).toBe(0)
      const questions = (await client.query(`SELECT content FROM script_flow_steps WHERE niche_id=$1
        AND step_key IN ('digging_in','digging_in_returning','digging_in_fully_back')`, [hbot])).rows
      expect(questions).toHaveLength(3)
      for (const question of questions) expect(question.content).toContain("How's your sleep been... good, average, or could be better?")
      expect((await client.query('SELECT selected_niche_id FROM participants WHERE id=$1', [chiroOwner])).rows[0].selected_niche_id).toBe(chiro)
      expect((await client.query(`SELECT content FROM script_flow_steps WHERE niche_id=$1 AND step_key='open'`, [hbot])).rows[0].content).toBe('Approved office wording')
      expect((await client.query('SELECT count(*)::int AS n FROM script_flow_steps')).rows[0].n).toBe(published.steps.length)
      expect((await client.query('SELECT count(*)::int AS n FROM script_flow_choices')).rows[0].n).toBe(published.choices.length)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  }, 30000)
})
