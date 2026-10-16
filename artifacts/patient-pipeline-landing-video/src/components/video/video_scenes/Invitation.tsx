import { Brand, Scene, Reveal, useBeats } from '../Motion'

export function Invitation() {
  const beat = useBeats([2500, 6900, 12800, 16400])
  return <Scene name="invitation" tone="ivory">
    <div className="end-brand"><Brand /></div>
    <Reveal className="invitation-title" delay={.45}><h1>Let’s talk about<br /><em>your practice.</em></h1></Reveal>
    {beat >= 2 && <Reveal className="invitation-products">Reactivation <span>+</span> Lead Follow-Up</Reveal>}
    {beat >= 3 && <Reveal className="invitation-action">Request a conversation</Reveal>}
    <div className="end-rule" />
  </Scene>
}