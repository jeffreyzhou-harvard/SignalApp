import { useEffect, useState } from 'react'
import { ITERATIONS } from '../state/script'
import { TweetCard } from './TweetCard'

const CONFETTI_COLORS = ['#8b7cff', '#2fd6f6', '#ffb02e', '#ff7ac6', '#3ee6a0', '#ffd166']

export function ShipOverlay() {
  const [stats, setStats] = useState({ replies: 3, reposts: 5, likes: 18, views: 412 })

  useEffect(() => {
    const t = setInterval(() => {
      setStats((s) => ({
        replies: s.replies + (Math.random() > 0.6 ? 1 : 0),
        reposts: s.reposts + (Math.random() > 0.5 ? 1 : 0),
        likes: s.likes + Math.floor(Math.random() * 4),
        views: s.views + Math.floor(Math.random() * 60 + 20),
      }))
    }, 900)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="ship-overlay">
      <div className="confetti">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 53) % 100}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${(i % 10) * 0.18}s`,
              animationDuration: `${2.6 + (i % 5) * 0.5}s`,
            }}
          />
        ))}
      </div>
      <div className="ship-col">
        <div className="ship-check">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#0a1512" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        </div>
        <h2>Posted to X</h2>
        <p className="ship-sub">Winner shipped organically. Tribe exported for paid reach.</p>
        <TweetCard
          text={ITERATIONS[2].tweet}
          version={3}
          posted
          stats={{
            replies: stats.replies,
            reposts: stats.reposts,
            likes: stats.likes,
            views: stats.views.toLocaleString(),
          }}
        />
        <div className="export-chip">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
          </svg>
          students-edtech-4388.csv → X Ads custom audience
        </div>
        <div className="ship-report">
          wind tunnel report · B beat A by <strong>+38%</strong> · 96% confidence · 400 simulated agents
        </div>
      </div>
    </div>
  )
}
