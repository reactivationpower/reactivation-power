import { esc, layout } from '../mail/layout'
import type { MessageKind } from './schedule'
export type AppointmentCopy = {
  firstName: string; host: string; start: string; timezone: string; meetingUrl: string; walkthroughUrl: string;
  kind: MessageKind; emailAccepted?: boolean; hostId?: string;
}
export function renderAppointmentMessage(d: AppointmentCopy) {
  if (d.kind !== 'cancelled' && !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(d.meetingUrl))
    throw new Error('A verified Google Meet link is required')
  if (!/^https:\/\/patientpipeline\.app\/walkthrough\/?$/.test(d.walkthroughUrl))
    throw new Error('The Patient Pipeline walkthrough link is required')
  const when = new Intl.DateTimeFormat('en-US', { timeZone: d.timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(d.start))
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: d.timezone, timeZoneName: 'short' }).formatToParts(new Date(d.start)).find(p => p.type === 'timeZoneName')?.value ?? d.timezone
  const time = `${when} ${zone}`
  const title = d.kind === 'cancelled' ? 'Your Patient Pipeline strategy call has been canceled' :
    d.kind === 'rescheduled' ? 'Your Patient Pipeline strategy call has been updated' :
    d.kind === 'day_before' ? 'A reminder about our Patient Pipeline strategy call' :
    d.kind === 'twelve_hours' ? 'Reminder: our Patient Pipeline strategy call is coming up' :
    d.kind === 'two_hours' ? 'Our Patient Pipeline strategy call is in 2 hours' :
    d.kind === 'starting' || d.kind === 'final' ? 'Our Patient Pipeline strategy call is starting soon' : 'Your Patient Pipeline strategy call is confirmed'
  const soon = d.kind === 'starting' || d.kind === 'final' || d.kind === 'two_hours'
  const emailNote = d.emailAccepted ? 'You should also have received a confirmation email—please check spam or junk if you don’t see it.\n\n' : ''
  const sms = d.kind === 'cancelled'
    ? `Hi ${d.firstName}, this is ${d.host} with Patient Pipeline. Our strategy call for ${time} has been canceled. Reply if you would like help scheduling another time. Reply STOP to opt out.`
    : d.kind === 'starting'
      ? `Hi ${d.firstName}, it’s ${d.host} with Patient Pipeline. Our call starts in 5 minutes. Please join from your computer: ${d.meetingUrl}\nReply STOP to opt out.`
    : d.kind === 'two_hours'
      ? `Hi ${d.firstName}, it’s ${d.host} with Patient Pipeline. Our call is in 2 hours, at ${time}. Please be at your computer for Google Meet: ${d.meetingUrl}\nReply STOP to opt out.`
    : d.kind === 'final'
      ? `Hi ${d.firstName}, it’s ${d.host} with Patient Pipeline. Our call starts at ${time}. Please be at your computer for Google Meet: ${d.meetingUrl}\nReply STOP to opt out.`
      : `Hi ${d.firstName}, this is ${d.host} with Patient Pipeline. ${d.kind === 'rescheduled' ? 'Our updated call time is' : d.kind === 'day_before' || d.kind === 'twelve_hours' ? 'A reminder: our strategy call is' : 'Our strategy call is confirmed for'} ${time}.\n\n${d.kind === 'confirmation' ? emailNote : ''}Please watch this 4-minute walkthrough before we meet: ${d.walkthroughUrl}. It covers the basics, and I’m happy to answer questions and explain more on our call.\n\nPlease be in front of a computer for Google Meet: ${d.meetingUrl}\nReply STOP to opt out.`
  const body = d.kind === 'cancelled'
    ? `<p>Our strategy call scheduled for <strong>${esc(time)}</strong> has been canceled.</p><p>If you would like help scheduling another time, please reply to this email.</p>`
    : soon
    ? `<p>${d.kind === 'two_hours' ? 'Our strategy call is in about 2 hours.' : 'Our strategy call is starting in a few minutes.'}</p>
      <p><strong>Your appointment:</strong> ${esc(time)}<br/><strong>Location:</strong> Google Meet</p>
      <p><strong>Please join from a computer</strong> using this link:</p>
      <p><a href="${esc(d.meetingUrl)}">Join our Google Meet</a></p>${d.kind === 'two_hours' ? `<p>If you haven’t yet, our <a href="${esc(d.walkthroughUrl)}">4-minute walkthrough</a> is a great way to get ready.</p>` : ''}<p>See you soon!</p>`
    : `<p>${d.kind === 'confirmation' ? 'Your strategy call is confirmed! I’m looking forward to learning about your practice and discussing how Patient Pipeline can help you turn more new leads into booked appointments, reconnect with past patients, and grow your practice’s revenue.' : d.kind === 'rescheduled' ? 'Here are the updated details for our strategy call.' : 'I’m looking forward to our upcoming strategy call. Here are your appointment details.'}</p>
      <p><strong>Your appointment:</strong> ${esc(time)}<br/><strong>Location:</strong> Google Meet</p>
      <h2>Before we meet</h2><p>Please watch our <strong>4-minute walkthrough video</strong>. It will give you a basic understanding of how Patient Pipeline works so we can spend our time discussing your practice and answering your questions.</p>
      <p><a href="${esc(d.walkthroughUrl)}">Watch the walkthrough</a></p>
      <p>I’ll be happy to answer any additional questions and explain anything you’d like to understand better.</p>
      <h2>Joining our call</h2><p><strong>Please be in front of a computer at your scheduled appointment time.</strong> We’ll meet on Google Meet using this link:</p>
      <p><a href="${esc(d.meetingUrl)}">Join our Google Meet</a></p><p>If you need to change your appointment, reply to this email.</p><p>Looking forward to speaking with you!</p>`
  return { subject: title, previewText: title, sms,
    html: layout([`<p>Hi ${esc(d.firstName)},</p>`, body, `<p>${esc(d.host)}<br/>Patient Pipeline</p>`], {
      previewText: title, transactionalContext: 'strategy call',
    }) }
}
