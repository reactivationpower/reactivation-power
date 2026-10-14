// @ts-nocheck
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  HBOT_CONCERN_OPTIONS,
  HBOT_DRAFT_NICHE_ID,
  HBOT_DRAFT_SCREENS,
  HBOT_REVIEW_ONLY_SCREEN_KEYS,
  hbotDraftChoices,
  hbotDraftSteps,
  withHbotDraft,
} from './hbot-draft'

const setSelectedNiche = vi.fn()
vi.mock('@/app/actions/reactivation', () => ({ setSelectedNiche: (...a) => setSelectedNiche(...a) }))
vi.mock('@/components/reactivation/practice-log-preview', () => ({ PracticeLogPreview: () => null }))
vi.mock('@/components/reactivation/niche-select', () => ({
  NicheSelect: ({ value, onValueChange, items }) => (
    <select aria-label="Select niche" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {items.map((i) => (
        <option key={i.value} value={i.value}>{i.label}</option>
      ))}
    </select>
  ),
}))

import { ScriptViewer } from '@/components/reactivation/script-viewer'

const real = [
  { id: 'n1', name: 'Chiropractic', sort_order: 1, is_active: true, sector: 'healthcare', created_at: '' },
  { id: 'n2', name: 'Dental', sort_order: 2, is_active: true, sector: 'healthcare', created_at: '' },
]
const gen = (k, c) => ({ id: k, niche_id: null, step_key: k, title: 'Live ' + k, content: c, sort_order: 0, updated_at: '' })

beforeEach(() => setSelectedNiche.mockClear())
afterEach(cleanup)

const view = (flag) =>
  render(
    <ScriptViewer niches={real} steps={[gen('s', 'LIVE TEXT')]} choices={[]} initialNicheId="n1" hbotDraftAvailable={flag} />,
  )

it('has no missing destinations', () => {
  const keys = new Set(hbotDraftSteps.map((s) => s.step_key))
  for (const c of hbotDraftChoices) {
    expect(keys.has(c.from_step_key)).toBe(true)
    expect(keys.has(c.to_step_key)).toBe(true)
  }
})

it('reaches all ordinary steps from the opening and retains separate review screens', () => {
  const seen = new Set([hbotDraftSteps[0].step_key])
  const q = [...seen]
  while (q.length) {
    const k = q.pop()
    for (const c of hbotDraftChoices.filter((x) => x.from_step_key === k)) {
      if (!seen.has(c.to_step_key)) { seen.add(c.to_step_key); q.push(c.to_step_key) }
    }
  }
  expect([...seen].sort()).toEqual(hbotDraftSteps
    .filter(s => !HBOT_REVIEW_ONLY_SCREEN_KEYS.includes(s.step_key))
    .map((s) => s.step_key).sort())
  for (const key of HBOT_REVIEW_ONLY_SCREEN_KEYS) {
    expect(HBOT_DRAFT_SCREENS.some(s => s.key === key)).toBe(true)
  }
})

it('keeps eight chips in approved order, matching eight questions', () => {
  expect(HBOT_CONCERN_OPTIONS.map((c) => c.label)).toEqual([
    'Fatigue / low energy', 'Brain fog / concentration', 'Ongoing pain / discomfort', 'Sleep problems',
    'Slow healing / lingering injury', 'Headaches / migraines', 'Numbness / tingling', 'Recovery after activity',
  ])
  const dig = hbotDraftSteps.find((s) => s.step_key === 'digging_in_well').content
  expect(dig.indexOf('fatigue or low energy')).toBeLessThan(dig.indexOf('brain fog'))
  expect(dig.indexOf('recovering after physical activity')).toBeLessThan(dig.indexOf('Of those'))
})

it('only flag=true adds the draft', () => {
  expect(withHbotDraft(real, true)).toHaveLength(3)
  for (const f of [false, undefined, null]) expect(withHbotDraft(real, f)).toHaveLength(2)
})

it('regular viewer is unchanged and shows no draft', () => {
  view(false)
  expect(screen.queryByText(/HBOT/)).toBeNull()
  fireEvent.change(screen.getByLabelText('Select niche'), { target: { value: 'n2' } })
  expect(setSelectedNiche).toHaveBeenCalledWith('n2')
})

it('draft selection is local only, shows warning, and has no live text', () => {
  view(true)
  expect(screen.queryByTestId('hbot-draft-warning')).toBeNull()
  fireEvent.change(screen.getByLabelText('Select niche'), { target: { value: HBOT_DRAFT_NICHE_ID } })
  expect(setSelectedNiche).not.toHaveBeenCalled()
  expect(screen.getByTestId('hbot-draft-warning').textContent).toMatch(/not clinically approved/)
  expect(screen.queryByText(/LIVE TEXT/)).toBeNull()
  expect(screen.getByText(/We're updating files for patients we haven't seen in a while/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Patient is on the line: continue' }))
  expect(screen.getByText(/how have you felt since your hyperbaric care with us/)).toBeTruthy()
  fireEvent.change(screen.getByTestId('select-hbot-draft-screen'), { target: { value: 'digging_in_well' } })
  expect(screen.getByText('Fatigue / low energy')).toBeTruthy()
})

it('matches the approved opener and three-answer opening structure', () => {
  expect(hbotDraftSteps[0].step_key).toBe('open')
  expect(hbotDraftSteps[0].title).toBe('The Open')
  const opening = hbotDraftSteps.find(s => s.step_key === 'open_status')
  expect(opening.title).toBe('Opening Question')
  expect(opening.content).toContain('I usually hear one of three things.')
  expect(opening.content).toContain('(Only three answers. Tap the one you hear.)')
  const choices = hbotDraftChoices.filter(c => c.from_step_key === 'open_status')
  expect(choices).toHaveLength(3)
  expect(choices.map(c => c.variant)).toEqual(['positive', 'caution', 'negative'])
})

it('keeps supplemental historical review screens outside the ordinary button flow', () => {
  const choices = hbotDraftChoices.filter(c => c.from_step_key === 'resp_still_present')
  expect(choices).toHaveLength(1)
  expect(choices[0].label).toBe('They explained what changed')
  const review = hbotDraftSteps.find(s => s.step_key === 'review')
  expect(review.content).toContain('Use only what they said.')
  expect(review.content).not.toContain('feeling the way you did when you finished')
})

it('has no generic decline, emergency, or clinical-reaction response buttons anywhere', () => {
  for (const c of hbotDraftChoices) {
    expect(c.label).not.toMatch(/^They decline$|emergency|sudden change|reaction to past treatment/i)
    expect(HBOT_REVIEW_ONLY_SCREEN_KEYS).not.toContain(c.to_step_key)
  }
})

it('matches approved Chiro-family labels and colors through the main caller path', () => {
  const choicesFor = key => hbotDraftChoices.filter(c => c.from_step_key === key)
    .map(({ label, variant }) => ({ label, variant }))
  for (const key of ['permission_well', 'permission_returning', 'permission']) {
    expect(choicesFor(key)).toEqual([{ label: '“Yes, that’s okay”', variant: 'default' }])
  }
  expect(choicesFor('digging_in_well')).toEqual([
    { label: 'They named their biggest concern', variant: 'caution' },
    { label: 'Nothing is bothering them', variant: 'positive' },
  ])
  expect(choicesFor('digging_in_returning')).toEqual([
    { label: 'They named their biggest concern', variant: 'caution' },
  ])
  expect(choicesFor('making_it_real')).toEqual([
    { label: 'Continue to the review', variant: 'default' },
  ])
  expect(choicesFor('review')).toEqual([
    { label: 'They agreed with the recap', variant: 'positive' },
    { label: 'Not quite / they hesitate', variant: 'negative' },
  ])
})

it('renders the approved permission and question buttons without the extra actions', () => {
  view(true)
  fireEvent.change(screen.getByLabelText('Select niche'), { target: { value: HBOT_DRAFT_NICHE_ID } })
  fireEvent.change(screen.getByTestId('select-hbot-draft-screen'), { target: { value: 'permission_well' } })
  expect(screen.getByText('While I have you, can I ask you a few quick questions so I can complete your file update?')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '“Yes, that’s okay”' }))
  expect(screen.getByRole('button', { name: 'They named their biggest concern' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Nothing is bothering them' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /They decline|emergency|reaction to past treatment/i })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'They named their biggest concern' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to the review' }))
  fireEvent.click(screen.getByRole('button', { name: 'They agreed with the recap' }))
  fireEvent.click(screen.getByRole('button', { name: '“I need to think about it”' }))
  expect(screen.getByRole('heading', { name: 'Objection: Need to Think' })).toBeTruthy()
})
