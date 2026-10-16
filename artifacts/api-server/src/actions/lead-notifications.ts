import { getCurrentParticipant } from '@/lib/data/participants'
import { readLeadEmailSettings, writeLeadEmailSettings, validateLeadEmailSettings, SETTINGS_UNAVAILABLE } from '@/lib/lead-followup/notifications'

async function owner() {
  const participant = await getCurrentParticipant()
  return participant?.role === 'owner' && !participant.is_demo ? participant : null
}

export async function getLeadEmailSettings() {
  const participant = await owner()
  if (!participant) return { error: 'Only a non-demo account owner can manage lead email notifications.' }
  try {
    return { settings: await readLeadEmailSettings(participant.id) }
  } catch {
    return { error: SETTINGS_UNAVAILABLE }
  }
}

export async function saveLeadEmailSettings(input: unknown) {
  const participant = await owner()
  if (!participant) return { error: 'Only a non-demo account owner can manage lead email notifications.' }
  const settings = validateLeadEmailSettings(input)
  if (!settings) return { error: 'Enter one valid notification email address.' }
  try {
    await writeLeadEmailSettings(participant.id, settings)
    return { settings }
  } catch {
    return { error: SETTINGS_UNAVAILABLE }
  }
}