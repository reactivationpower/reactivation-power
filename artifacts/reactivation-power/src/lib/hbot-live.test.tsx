// @ts-nocheck
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import live from '../../../api-server/content/flows/hbot.json'
import general from '../../../api-server/content/flows/general.json'
import { CONCERN_OPTIONS, suggestNicheForService, SERVICE_GROUPS } from '@workspace/niche-catalog'

const setSelectedNiche = vi.fn()
vi.mock('@/app/actions/reactivation', () => ({ setSelectedNiche: (...a) => setSelectedNiche(...a) }))
vi.mock('@/components/reactivation/practice-log-preview', () => ({ PracticeLogPreview: () => null }))
vi.mock('@/components/reactivation/niche-select', () => ({
  NicheSelect: ({ value, onValueChange, items }) => (
    <select aria-label="Select niche" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
    </select>
  ),
}))
import { ScriptViewer } from '@/components/reactivation/script-viewer'

afterEach(() => { cleanup(); setSelectedNiche.mockClear() })
const niche = { id: 'live-hbot', ...live.niche, created_at: '' }
const steps = [
  ...general.steps.map((s, i) => ({ ...s, id: `g${i}`, niche_id: null })),
  ...live.steps.map((s, i) => ({ ...s, id: `h${i}`, niche_id: niche.id })),
]
const choices = [
  ...general.choices.map((c, i) => ({ ...c, id: `g${i}`, niche_id: null })),
  ...live.choices.map((c, i) => ({ ...c, id: `h${i}`, niche_id: niche.id })),
]
const view = (initialStepKey = null) => render(
  <ScriptViewer niches={[{ ...niche, id: 'chiro', name: 'Chiropractic' }, niche]}
    steps={steps} choices={choices} initialNicheId={niche.id} initialStepKey={initialStepKey} />,
)

it('publishes the approved eight concerns, catalog entry, and import matching', () => {
  expect(CONCERN_OPTIONS.HBOT.map((c) => c.label)).toEqual([
    'Fatigue / low energy', 'Brain fog / concentration', 'Ongoing pain / discomfort',
    'Sleep problems', 'Slow healing / lingering injury', 'Headaches / migraines',
    'Numbness / tingling', 'Recovery after activity',
  ])
  expect(SERVICE_GROUPS.find((g) => g.id === 'chiropractic').services).toContainEqual({ label: 'HBOT', niche: 'HBOT' })
  for (const service of ['HBOT Session 8', 'Hyperbaric Oxygen Therapy', 'Hyper-baric care']) {
    expect(suggestNicheForService(service, [niche])).toEqual(niche)
  }
})

it('preserves the eight topics and exact sleep wording in every live questions variant', () => {
  for (const key of ['digging_in', 'digging_in_returning', 'digging_in_fully_back']) {
    const body = live.steps.find((s) => s.step_key === key).content
    expect(body).toContain("How's your sleep been... good, average, or could be better?")
    expect(body).not.toContain("How's your sleep been?")
    expect(body).toContain('(Tap their answer below.)')
  }
  expect(JSON.stringify(live)).not.toMatch(/This preview|Draft for Review|hbot-draft-review/)
})

it('has no missing destinations and all published screens are reachable', () => {
  const keys = new Set(live.steps.map((s) => s.step_key))
  const reached = new Set(['open'])
  for (const c of live.choices) {
    expect(keys.has(c.from_step_key)).toBe(true)
    if (c.to_step_key) expect(keys.has(c.to_step_key)).toBe(true)
  }
  let size
  do {
    size = reached.size
    for (const c of live.choices) if (reached.has(c.from_step_key) && c.to_step_key) reached.add(c.to_step_key)
  } while (reached.size !== size)
  expect([...keys].filter((k) => !reached.has(k))).toEqual([])
})

it('uses the normal persisted niche selection and exposes guidance without routine safety buttons', () => {
  view()
  expect(screen.queryByTestId('hbot-draft-warning')).toBeNull()
  expect(screen.queryByTestId('select-hbot-draft-screen')).toBeNull()
  expect(screen.getByText('HBOT clinical handoff guidance')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Select niche'), { target: { value: 'chiro' } })
  fireEvent.change(screen.getByLabelText('Select niche'), { target: { value: niche.id } })
  expect(setSelectedNiche).toHaveBeenLastCalledWith(niche.id)
  fireEvent.click(screen.getByRole('button', { name: 'Patient is on the line: continue' }))
  expect(screen.getByText(/how have you felt since your hyperbaric care with us/)).toBeTruthy()
  for (const label of ['“Still feeling great”', '“It’s starting to come back again”', '“Pretty much back to where I was”']) {
    expect(screen.getByRole('button', { name: label })).toBeTruthy()
  }
})

it.each(['lapsed_felt_fine', 'lapsed_cost', 'lapsed_busy', 'lapsed_wait_pain', 'lapsed_moved'])(
  'routes %s to the live review-visit scheduling screen',
  (key) => {
    view('lapsed_commitment')
    const choice = live.choices.find((c) => c.from_step_key === 'lapsed_commitment' && c.to_step_key === key)
    fireEvent.click(screen.getByRole('button', { name: choice.label }))
    fireEvent.click(screen.getByRole('button', { name: '“Yes, that sounds reasonable”' }))
    expect(screen.getByText('Scheduling: Review Visit')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Visit confirmed' }))
    expect(screen.getByText('Review Visit: Closing')).toBeTruthy()
    expect(screen.queryByText(/This preview/)).toBeNull()
  },
)
