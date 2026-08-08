export type OrbState = 'idle' | 'speaking' | 'listening' | 'thinking'

export function VoiceDock({
  orb,
  agentLine,
  userLine,
  autopilot,
  onOrbClick,
}: {
  orb: OrbState
  agentLine: string
  userLine: string
  autopilot: boolean
  onOrbClick: () => void
}) {
  return (
    <div className="voice-dock">
      <div className="captions">
        {agentLine && (
          <div className="caption agent" key={agentLine}>
            {agentLine}
          </div>
        )}
        {userLine && (
          <div className="caption user" key={`u-${userLine}`}>
            {userLine}
          </div>
        )}
      </div>
      <button className={`orb ${orb}`} onClick={onOrbClick} aria-label="voice orb">
        <span className="orb-core" />
        <span className="orb-ring r1" />
        <span className="orb-ring r2" />
        {orb === 'listening' && <span className="orb-rec" />}
      </button>
      <div className="orb-status">
        <span className={`orb-dot ${orb}`} />
        Grok Voice · {orb === 'listening' ? 'listening — your mic is live' : orb === 'speaking' ? 'speaking' : orb === 'thinking' ? 'thinking' : 'idle'}
        {autopilot && <span className="ap-chip">autopilot</span>}
      </div>
    </div>
  )
}
