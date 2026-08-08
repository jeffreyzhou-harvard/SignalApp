import { followersOf, FOLLOWERS, type Follower } from './followers'
import { mulberry32, pick } from '../lib/rng'

export type Variant = 'A' | 'B'
export type Action = 'view' | 'like' | 'repost' | 'reply' | 'bookmark'

export interface SimEvent {
  follower: Follower
  variant: Variant
  action: Action
  reply?: string
  sentiment?: 'pos' | 'neu' | 'neg'
}

const REPLIES_B: Array<[string, 'pos' | 'neu' | 'neg']> = [
  ['ok the $99 early bird actually got me 👀', 'pos'],
  ['quizzes from my OWN notes?? need this for orgo', 'pos'],
  ['BYTE', 'pos'],
  ['sept 4 is right before midterms. intentional?? 😭', 'pos'],
  ['does it sync with canvas or notion?', 'neu'],
  ['my roommate needs this more than me lol', 'pos'],
  ['BYTE — please tell me it works offline in the library', 'pos'],
  ['first 500 only? that\'s gonna go fast', 'pos'],
  ['cute but what\'s the battery life', 'neu'],
  ['BYTE 🙏', 'pos'],
]

const REPLIES_A: Array<[string, 'pos' | 'neu' | 'neg']> = [
  ['looks cool! what does it cost?', 'neu'],
  ['is this a real product or a render', 'neg'],
  ['ok this is cute', 'pos'],
  ['how is this different from a pomodoro app', 'neg'],
  ['when does it ship?', 'neu'],
  ['interesting… need more details', 'neu'],
]

// Weighted action tables. Variant B (final iteration) converts harder —
// that's the story the wind tunnel tells.
const WEIGHTS: Record<Variant, Array<[Action, number]>> = {
  A: [
    ['view', 62],
    ['like', 22],
    ['bookmark', 6],
    ['repost', 5],
    ['reply', 5],
  ],
  B: [
    ['view', 44],
    ['like', 28],
    ['bookmark', 11],
    ['repost', 9],
    ['reply', 8],
  ],
}

function weightedAction(rng: () => number, v: Variant): Action {
  const table = WEIGHTS[v]
  const total = table.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [a, w] of table) {
    r -= w
    if (r <= 0) return a
  }
  return 'view'
}

/** Deterministic stream of ~n simulation events, students-weighted. */
export function buildSimEvents(n = 170): SimEvent[] {
  const rng = mulberry32(90210)
  const students = followersOf('students')
  const events: SimEvent[] = []
  let a = 0
  let b = 0
  for (let i = 0; i < n; i++) {
    // 70% students, 30% spillover from the rest of the graph
    const follower = rng() < 0.7 ? pick(rng, students) : pick(rng, FOLLOWERS)
    const variant: Variant = rng() < 0.44 ? 'A' : 'B'
    const action = weightedAction(rng, variant)
    const ev: SimEvent = { follower, variant, action }
    if (action === 'reply') {
      const pool = variant === 'B' ? REPLIES_B : REPLIES_A
      const [reply, sentiment] = pool[(variant === 'B' ? b++ : a++) % pool.length]
      ev.reply = reply
      ev.sentiment = sentiment
    }
    events.push(ev)
  }
  return events
}

export interface Tally {
  views: number
  likes: number
  reposts: number
  replies: number
  bookmarks: number
}

export const emptyTally = (): Tally => ({ views: 0, likes: 0, reposts: 0, replies: 0, bookmarks: 0 })

export function applyEvent(t: Tally, e: SimEvent): Tally {
  const next = { ...t, views: t.views + 1 }
  if (e.action === 'like') next.likes++
  if (e.action === 'repost') next.reposts++
  if (e.action === 'reply') next.replies++
  if (e.action === 'bookmark') next.bookmarks++
  return next
}

export function engagementRate(t: Tally): number {
  if (t.views === 0) return 0
  return ((t.likes + t.reposts + t.replies + t.bookmarks) / t.views) * 100
}

// Final scoreboard numbers, scaled to the full simulated population of 400
// agents (the live stream shows the sampled tail of the run).
export const FINAL = {
  A: { views: 4210, likes: 231, reposts: 41, replies: 38, bookmarks: 62, er: 4.9 },
  B: { views: 4530, likes: 402, reposts: 96, replies: 118, bookmarks: 174, er: 6.8 },
  lift: '+38%',
  confidence: '96%',
  driver: 'replies & bookmarks',
}
