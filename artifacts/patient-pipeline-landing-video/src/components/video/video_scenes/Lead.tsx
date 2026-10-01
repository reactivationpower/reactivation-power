import { Scene, CallFrame, Cursor, useBeats } from '../Motion'

export function Lead() {
  const beat = useBeats([4900, 12200, 13900, 16900, 18300])
  return <Scene name="lead" tone="blue">
    <div className="screen-heading"><span className="product-indicator blue" />Lead Follow-Up
      <span className="screen-context">{beat < 3 ? 'The offer they responded to' : 'Context for the next conversation'}</span>
    </div>
    <CallFrame src={beat < 3 ? 'lead-choice.png' : 'lead-result.png'}
      alt={beat < 3 ? 'Actual campaign-aware lead caller screen' : 'Actual lead response screen for a different appointment time'}
      zoom={beat >= 1 && beat < 4 ? 1.035 : 1} focus="40% 61%">
      {beat === 2 && <Cursor x={32} y={90} />}
    </CallFrame>
  </Scene>
}