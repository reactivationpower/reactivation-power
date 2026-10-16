import { Scene, CallFrame, Cursor, TypedNote, useBeats } from '../Motion'

export function Workflow() {
  const beat = useBeats([7200, 7550, 9250, 12700])
  const src = beat === 0 ? 'queue-refined.png?v=readable-rows' : 'logging.png'
  return <Scene name="workflow" tone="ivory">
    <div className="screen-heading"><span className="product-indicator teal" />A repeatable process
      <span className="screen-context">{beat === 0 ? 'Know who needs attention' : beat < 4 ? 'Record what happened' : 'Keep follow-up moving'}</span>
    </div>
    <CallFrame src={src} alt={beat === 0 ? 'Actual lead follow-up queue' : 'Actual call outcome and notes fields'} zoom={beat >= 1 ? 1.035 : 1} focus="50% 76%">
      {beat === 2 && <Cursor x={25} y={80.7} />}
      {beat >= 3 && <TypedNote />}
    </CallFrame>
  </Scene>
}