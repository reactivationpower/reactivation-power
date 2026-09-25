import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getCurrentParticipant } from '@/lib/data/participants'

// Practice-mode listening assist: given the screen the caller is on, the chips
// they could tap next, and what the mic heard since landing on this screen,
// pick the chip that matches the patient's answer. The caller always confirms
// with a tap; this route only suggests.

const MODEL = 'google/gemini-3.5-flash-lite'

const requestSchema = z.object({
  stepTitle: z.string().max(200),
  stepText: z.string().max(6000),
  choices: z
    .array(z.object({ id: z.string().max(100), label: z.string().max(300) }))
    .max(30),
  concerns: z.array(z.string().max(120)).max(30).default([]),
  transcript: z.string().max(2000),
})

export async function POST(req: Request) {
  const participant = await getCurrentParticipant()
  if (!participant) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { stepTitle, stepText, choices, concerns, transcript } = parsed.data
  if (!transcript.trim() || (choices.length === 0 && concerns.length === 0)) {
    return Response.json({ choiceId: null, concern: null })
  }

  const choiceIds = choices.map((c) => c.id)
  const schema = z.object({
    choiceId: z
      .enum(['none', ...choiceIds] as [string, ...string[]])
      .describe('The id of the chip that matches the patient, or none'),
    concern: z
      .enum(['none', ...concerns] as [string, ...string[]])
      .describe('The concern the patient named, or none'),
  })

  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema }),
      system: [
        'You help a front-desk caller practicing a patient reactivation phone script.',
        'One microphone hears both people: the caller reading the script aloud, and a coworker playing the patient.',
        'Ignore anything that is the caller reading the script text. Judge only what the patient says in reply.',
        'Pick the chip that best describes the patient reply. Chips are written from the caller\u2019s point of view (e.g. "They said yes", "I need to think about it").',
        'If the patient has not clearly replied yet, or nothing fits, answer none. A wrong suggestion is worse than none.',
        'If concern options are given and the patient named one of them (same meaning, different words is fine), return it; otherwise none.',
      ].join(' '),
      prompt: [
        `SCREEN: ${stepTitle}`,
        `SCRIPT THE CALLER READS:\n${stepText}`,
        `CHIPS:\n${choices.map((c) => `- id=${c.id}: ${c.label}`).join('\n') || '(none)'}`,
        concerns.length ? `CONCERN OPTIONS:\n${concerns.map((c) => `- ${c}`).join('\n')}` : '',
        `HEARD ON THE CALL SO FAR (oldest first):\n${transcript}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    })

    return Response.json({
      choiceId: output.choiceId === 'none' ? null : output.choiceId,
      concern: output.concern === 'none' ? null : output.concern,
    })
  } catch (error) {
    console.error('[script-assist] model call failed', error)
    return Response.json({ error: 'Assist unavailable' }, { status: 502 })
  }
}
