import { Scene, CallFrame, Cursor, useBeats } from '../Motion'

export function Reactivation() {
  const beat = useBeats([4800, 8900, 10600, 18000, 22200])
  return <Scene name="reactivation" tone="ivory">
    <div className="screen-heading"><span className="product-indicator teal" />Reactivation
      <span className="screen-context">{beat < 3 ? 'Care they received before' : 'The conversation follows their answer'}</span>
    </div>
    <CallFrame src={beat < 3 ? 'reactivation-choice-refined.png' : 'reactivation-result-refined.png'}
      alt={beat < 3 ? 'Actual Reactivation caller screen with patient response options' : 'Actual next screen after the patient’s response'}
      zoom={beat >= 1 && beat < 4 ? 1.05 : 1} focus="38% 63%">
      {beat === 2 && <Cursor x={24.53} y={88.06} />}
    </CallFrame>
  </Scene>
}