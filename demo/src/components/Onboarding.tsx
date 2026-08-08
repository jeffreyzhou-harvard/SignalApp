import { useEffect, useState } from 'react'
import { CLUSTERS, TOTAL_FOLLOWERS } from '../data/clusters'
import { FOUNDER } from '../state/script'

const SYNC_LINES = [
  { t: 'mcp: dialing chroma-cloud (us-east-1)…', d: 500 },
  { t: 'mcp: auth ok · tenant grokathon-2026 · collection agentsim-followers', d: 700 },
  { t: 'x-api: followers 18,442 · timelines 812,304 posts · follow graph 1.2M edges', d: 1100 },
  { t: 'grok: persona cards 18,442 / 18,442 ✓', d: 1000 },
  { t: 'embed: bge-large-en-v1.5 · 18,442 vectors → agentsim-followers', d: 900 },
  { t: 'cluster: umap(n=15) → hdbscan · 6 stable tribes · silhouette 0.71', d: 1000 },
  { t: 'grok: tribe labels written ✓', d: 600 },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [authing, setAuthing] = useState(false)
  const [lines, setLines] = useState(0)

  useEffect(() => {
    if (step !== 2) return
    if (lines >= SYNC_LINES.length) {
      const t = setTimeout(() => setStep(3), 700)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setLines((l) => l + 1), SYNC_LINES[lines].d)
    return () => clearTimeout(t)
  }, [step, lines])

  return (
    <div className="onboard">
      <div className="onboard-card">
        {step === 0 && (
          <div className="ob-hero">
            <img className="ob-logo" src="/agentsim.png" alt="AgentSim" />
            <h1>AgentSim</h1>
            <p className="ob-tag">A wind tunnel for product launches on&nbsp;X.</p>
            <p className="ob-sub">
              We map your real followers into interest tribes, tailor a post + Grok&nbsp;Imagine poster to the tribe
              you target, then pre-test it on a simulated twin of your audience — before it ever hits your feed.
            </p>
            <button className="btn-primary" onClick={() => setStep(1)}>
              Connect your X account
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="ob-auth">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="#e7e9ea">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <h2>Authorize AgentSim</h2>
            <div className="ob-scopes">
              <span>✓ Read your followers &amp; their public posts</span>
              <span>✓ Read engagement on your account</span>
              <span>✓ Post on your behalf (only when you say ship)</span>
            </div>
            <button
              className="btn-primary"
              disabled={authing}
              onClick={() => {
                setAuthing(true)
                setTimeout(() => setStep(2), 900)
              }}
            >
              {authing ? <span className="spinner" /> : <>Authorize {FOUNDER.handle}</>}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="ob-sync">
            <h2>Indexing your audience</h2>
            <div className="terminal">
              {SYNC_LINES.slice(0, lines).map((l, i) => (
                <div key={i} className="term-line">
                  <span className="term-check">✓</span> {l.t}
                </div>
              ))}
              {lines < SYNC_LINES.length && <div className="term-line pending">▋</div>}
            </div>
            <div className="sim-progress">
              <div className="sim-progress-fill" style={{ width: `${(lines / SYNC_LINES.length) * 100}%` }} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ob-tribes">
            <h2>
              {TOTAL_FOLLOWERS.toLocaleString()} followers. <em>Six tribes.</em>
            </h2>
            <div className="tribe-grid">
              {CLUSTERS.map((c) => (
                <div key={c.id} className="tribe-chip" style={{ ['--c' as any]: c.color }}>
                  <span className="tribe-dot" />
                  <span className="tribe-name">{c.label}</span>
                  <span className="tribe-n">{c.members.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={onDone}>
              Enter the audience map
            </button>
            <p className="ob-hint">headphones on — the copilot speaks</p>
          </div>
        )}
      </div>
    </div>
  )
}
