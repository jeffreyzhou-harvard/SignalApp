import { CLUSTERS, type Cluster } from './clusters'
import { mulberry32, pick, gaussian } from '../lib/rng'

export interface Follower {
  id: number
  name: string
  handle: string
  bio: string
  avatar: string
  clusterId: string
  pos: [number, number, number]
}

const FIRST = [
  'Maya', 'Priya', 'Jordan', 'Sam', 'Alex', 'Noah', 'Ava', 'Liam', 'Zoe', 'Ethan',
  'Aisha', 'Diego', 'Hana', 'Marcus', 'Nina', 'Omar', 'Lena', 'Kai', 'Tara', 'Ryan',
  'Sofia', 'Devon', 'Ivy', 'Jonas', 'Mira', 'Cole', 'Anya', 'Felix', 'Ruth', 'Theo',
  'Grace', 'Hugo', 'Isla', 'Mateo', 'Nadia', 'Owen', 'Pia', 'Quinn', 'Rosa', 'Sean',
  'Talia', 'Umar', 'Vera', 'Wes', 'Ximena', 'Yara', 'Zach', 'Elif', 'Ben', 'Chloe',
] as const

const LAST = [
  'Chen', 'Patel', 'Kim', 'Nguyen', 'Garcia', 'Okafor', 'Silva', 'Novak', 'Haddad', 'Ito',
  'Murphy', 'Kaur', 'Alvarez', 'Bauer', 'Costa', 'Dube', 'Eriksen', 'Fischer', 'Gao', 'Hertz',
  'Iyer', 'Jensen', 'Khan', 'Lopez', 'Mehta', 'Nakamura', 'Osei', 'Park', 'Quispe', 'Rossi',
  'Sato', 'Tran', 'Ueda', 'Vargas', 'Weber', 'Xu', 'Yilmaz', 'Zhang', 'Adeyemi', 'Brandt',
] as const

const HANDLE_SUFFIX: Record<string, readonly string[]> = {
  'ai-builders': ['builds', 'ml', 'dev', 'ai', 'ships', 'infra', 'stack'],
  students: ['studies', 'cs26', 'cs27', 'premed', 'notes', 'uni', 'gradszn'],
  robotics: ['bots', 'hw', 'servo', 'mech', 'solder', 'pcb'],
  design: ['design', 'ui', 'type', 'studio', 'pixels'],
  founders: ['vc', 'angel', 'founder', 'capital', 'growth'],
  productivity: ['focus', 'method', 'systems', 'deepwork', 'habits'],
}

const BIOS: Record<string, readonly string[]> = {
  'ai-builders': [
    'building agents at a startup you haven\'t heard of yet',
    'ml eng · evals are all you need',
    'shipping llm infra · ex-faang',
    'weights, biases, and opinions',
  ],
  students: [
    'cs @ berkeley · 27',
    'pre-med, running on caffeine and anki',
    'ee sophomore · building things between psets',
    'double major, single braincell during finals',
  ],
  robotics: [
    'robots by day, robots by night',
    'actuators > everything · FRC alum',
    'hardware is hard, that\'s the point',
    'i void warranties',
  ],
  design: [
    'product designer · typography apologist',
    'making software feel like something',
    'design systems + espresso',
    'portfolio perpetually "almost done"',
  ],
  founders: [
    'founder · 2x exited (1 to my cofounder)',
    'seed investor · dm me your deck',
    'building in public, fundraising in private',
    'operator turned angel',
  ],
  productivity: [
    'i turn chaos into checklists',
    'notion templates paid my rent',
    'deep work evangelist · newsletter below',
    'your favorite study youtuber\'s favorite poster',
  ],
}

function clusterNodes(cluster: Cluster, rng: () => number, startId: number, avatarIdx: number[]): Follower[] {
  const out: Follower[] = []
  for (let i = 0; i < cluster.nodes; i++) {
    const first = pick(rng, FIRST)
    const last = pick(rng, LAST)
    const suffix = pick(rng, HANDLE_SUFFIX[cluster.id])
    const n = Math.floor(rng() * 90)
    const handle = `@${first.toLowerCase()}${rng() > 0.5 ? '_' : ''}${suffix}${n < 30 ? n : ''}`
    // anisotropic gaussian blob around the cluster centre
    const pos: [number, number, number] = [
      cluster.center[0] + gaussian(rng) * 3.4,
      cluster.center[1] + gaussian(rng) * 2.0,
      cluster.center[2] + gaussian(rng) * 3.4,
    ]
    const a = avatarIdx.pop() ?? Math.floor(rng() * 100)
    const gender = a % 2 === 0 ? 'm' : 'f'
    out.push({
      id: startId + i,
      name: `${first} ${last}`,
      handle,
      bio: pick(rng, BIOS[cluster.id]),
      avatar: `/avatars/${gender}${Math.floor(a / 2)}.jpg`,
      clusterId: cluster.id,
      pos,
    })
  }
  return out
}

function buildFollowers(): Follower[] {
  const rng = mulberry32(20260808)
  // shuffle 0..399 -> maps onto the 200 avatar files (each may repeat ~2x max)
  const avatarIdx = Array.from({ length: 400 }, (_, i) => i % 200)
  for (let i = avatarIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[avatarIdx[i], avatarIdx[j]] = [avatarIdx[j], avatarIdx[i]]
  }
  const all: Follower[] = []
  for (const c of CLUSTERS) {
    all.push(...clusterNodes(c, rng, all.length, avatarIdx))
  }
  return all
}

export const FOLLOWERS: Follower[] = buildFollowers()

export function followersOf(clusterId: string): Follower[] {
  return FOLLOWERS.filter((f) => f.clusterId === clusterId)
}
