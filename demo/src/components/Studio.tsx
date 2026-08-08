import { ITERATIONS } from '../state/script'
import { TweetCard } from './TweetCard'

export function Studio({
  visibleVersion,
  generating,
}: {
  visibleVersion: 0 | 1 | 2 | 3
  generating: boolean
}) {
  const iter = visibleVersion > 0 ? ITERATIONS[visibleVersion - 1] : null
  const genTarget = ITERATIONS[Math.min(visibleVersion, 2)] // prompt shown while generating next
  return (
    <aside className="panel studio">
      <header className="panel-head">
        <div>
          <h2>Creation Studio</h2>
          <span className="panel-sub">Students &amp; EdTech · tailored variant</span>
        </div>
        <div className="iter-chips">
          {[1, 2, 3].map((v) => (
            <span
              key={v}
              className={`iter-chip ${visibleVersion === v ? 'active' : ''} ${visibleVersion > v ? 'done' : ''}`}
            >
              v{v}
            </span>
          ))}
        </div>
      </header>

      {generating ? (
        <div className="gen-box">
          <div className="gen-shimmer" />
          <div className="gen-meta">
            <span className="gen-badge">
              <span className="gen-spark">✦</span> Grok Imagine — rendering
            </span>
            <p className="gen-prompt">“{genTarget.imaginePrompt}”</p>
            <div className="gen-bar">
              <div className="gen-bar-fill" />
            </div>
          </div>
        </div>
      ) : iter ? (
        <div className="studio-body" key={iter.version}>
          <TweetCard text={iter.tweet} version={iter.version} />
          <div className="change-note">
            <span className="change-dot" /> {iter.changeNote}
          </div>
        </div>
      ) : null}
    </aside>
  )
}
