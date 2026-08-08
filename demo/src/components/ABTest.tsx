import { useEffect, useRef, useState } from 'react'
import { buildSimEvents, applyEvent, emptyTally, engagementRate, FINAL, type SimEvent, type Tally } from '../data/sim'
import { ITERATIONS } from '../state/script'
import { Poster } from './Poster'

const ACTION_LABEL: Record<string, string> = {
  view: 'viewed',
  like: 'liked ❤️',
  repost: 'reposted 🔁',
  reply: 'replied 💬',
  bookmark: 'bookmarked 🔖',
}

function Meter({ label, a, b }: { label: string; a: number; b: number }) {
  const max = Math.max(a, b, 1)
  return (
    <div className="meter">
      <span className="meter-a">{a}</span>
      <div className="meter-track">
        <div className="meter-fill a" style={{ width: `${(a / max) * 50}%` }} />
        <span className="meter-label">{label}</span>
        <div className="meter-fill b" style={{ width: `${(b / max) * 50}%` }} />
      </div>
      <span className="meter-b">{b}</span>
    </div>
  )
}

export function ABTest({ done, onDone }: { done: boolean; onDone: () => void }) {
  const [tallyA, setTallyA] = useState<Tally>(emptyTally())
  const [tallyB, setTallyB] = useState<Tally>(emptyTally())
  const [feed, setFeed] = useState<SimEvent[]>([])
  const [replies, setReplies] = useState<SimEvent[]>([])
  const [progress, setProgress] = useState(0)
  const fired = useRef(false)

  useEffect(() => {
    if (done) return
    const events = buildSimEvents(170)
    let i = 0
    const timer = setInterval(() => {
      if (i >= events.length) {
        clearInterval(timer)
        if (!fired.current) {
          fired.current = true
          setTimeout(onDone, 600)
        }
        return
      }
      const e = events[i++]
      if (e.variant === 'A') setTallyA((t) => applyEvent(t, e))
      else setTallyB((t) => applyEvent(t, e))
      setFeed((f) => [e, ...f].slice(0, 6))
      if (e.reply) setReplies((r) => [e, ...r].slice(0, 4))
      setProgress(i / events.length)
    }, 78)
    return () => clearInterval(timer)
  }, [done, onDone])

  const A = done ? FINAL.A : tallyA
  const B = done ? FINAL.B : tallyB
  const erA = done ? FINAL.A.er : engagementRate(tallyA)
  const erB = done ? FINAL.B.er : engagementRate(tallyB)

  return (
    <aside className="panel abtest">
      <header className="panel-head">
        <div>
          <h2>Wind Tunnel</h2>
          <span className="panel-sub">400 simulated agents · grounded in Students &amp; EdTech embeddings</span>
        </div>
        {!done && (
          <span className="live-chip">
            <span className="live-dot" /> simulating
          </span>
        )}
      </header>

      {!done && (
        <div className="sim-progress">
          <div className="sim-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="variants">
        {(['A', 'B'] as const).map((v) => {
          const iter = v === 'A' ? ITERATIONS[1] : ITERATIONS[2]
          const t = v === 'A' ? A : B
          const er = v === 'A' ? erA : erB
          const winner = done && v === 'B'
          return (
            <div key={v} className={`variant ${winner ? 'winner' : ''} ${done && !winner ? 'loser' : ''}`}>
              <div className="variant-head">
                <span className="variant-tag">{v}</span>
                <span className="variant-sub">iteration {iter.version}</span>
                {winner && <span className="winner-chip">WINNER</span>}
              </div>
              <div className="variant-poster">
                <Poster version={iter.version} />
              </div>
              <div className="variant-er">
                <strong>{er.toFixed(1)}%</strong> engagement
              </div>
            </div>
          )
        })}
      </div>

      <div className="meters">
        <div className="meters-head">
          <span>Variant A</span>
          <span>Variant B</span>
        </div>
        <Meter label="likes" a={A.likes} b={B.likes} />
        <Meter label="reposts" a={A.reposts} b={B.reposts} />
        <Meter label="replies" a={A.replies} b={B.replies} />
        <Meter label="bookmarks" a={A.bookmarks} b={B.bookmarks} />
      </div>

      {done ? (
        <div className="verdict-banner">
          <div className="verdict-stat">
            <strong>Variant B wins</strong>
            <span>
              {FINAL.lift} engagement lift · {FINAL.confidence} confidence · driven by {FINAL.driver}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="sim-feed">
            {feed.map((e, i) => (
              <div key={`${e.follower.id}-${i}`} className="sim-event" style={{ opacity: 1 - i * 0.14 }}>
                <img src={e.follower.avatar} alt="" />
                <span className="sim-handle">{e.follower.handle}</span>
                <span className="sim-action">{ACTION_LABEL[e.action]}</span>
                <span className={`sim-variant v${e.variant}`}>{e.variant}</span>
              </div>
            ))}
          </div>
          {replies.length > 0 && (
            <div className="sim-replies">
              {replies.map((e, i) => (
                <div key={`${e.follower.id}-r-${i}`} className={`sim-reply ${e.sentiment}`}>
                  <img src={e.follower.avatar} alt="" />
                  <div>
                    <span className="sim-reply-name">{e.follower.name}</span>
                    <p>{e.reply}</p>
                  </div>
                  <span className={`sim-variant v${e.variant}`}>{e.variant}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  )
}
