import type { Stage } from '../state/script'
import { FOUNDER } from '../state/script'

const STEPS: Array<{ key: string; label: string; stages: Stage[] }> = [
  { key: 'map', label: 'Map', stages: ['galaxy'] },
  { key: 'target', label: 'Target', stages: ['zoom', 'cameraAsk', 'camera', 'brief'] },
  { key: 'create', label: 'Create', stages: ['gen1', 'gen2', 'gen3'] },
  { key: 'tunnel', label: 'Wind tunnel', stages: ['abtest', 'verdict'] },
  { key: 'ship', label: 'Ship', stages: ['ship'] },
]

export function Hud({ stage }: { stage: Stage }) {
  const activeIdx = STEPS.findIndex((s) => s.stages.includes(stage))
  return (
    <header className="hud">
      <div className="hud-left">
        <img src="/agentsim.png" alt="" className="hud-logo" />
        <span className="hud-word">AgentSim</span>
        <span className="hud-tagchip">wind tunnel</span>
      </div>
      <nav className="hud-steps">
        {STEPS.map((s, i) => (
          <span key={s.key} className={`hud-step ${i === activeIdx ? 'active' : ''} ${i < activeIdx ? 'done' : ''}`}>
            {s.label}
          </span>
        ))}
      </nav>
      <div className="hud-right">
        <span className="mcp-chip">
          <span className="live-dot" /> MCP · chroma-cloud
        </span>
        <span className="acct-chip">
          <img src={FOUNDER.avatar} alt="" />
          {FOUNDER.handle}
        </span>
      </div>
    </header>
  )
}
