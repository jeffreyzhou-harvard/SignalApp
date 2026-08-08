// ─────────────────────────────────────────────────────────────────────────────
// The deterministic demo script. The voice harness drives this: the copilot
// speaks its line, listens, and ANY recognized speech advances the beat —
// the presenter's exact wording never breaks the flow. Cluster selection is
// the one place we route on keywords (say "students" → Students & EdTech).
// In autopilot (press A) the scripted user lines below are injected instead.
// ─────────────────────────────────────────────────────────────────────────────

export type Stage =
  | 'onboard'
  | 'galaxy'
  | 'zoom'
  | 'cameraAsk'
  | 'camera'
  | 'brief'
  | 'gen1'
  | 'gen2'
  | 'gen3'
  | 'abtest'
  | 'verdict'
  | 'ship'

export const FOUNDER = {
  name: 'Aditya Bilawar',
  handle: '@adityaships',
  avatar: '/avatars/m16.jpg',
  followers: '18,442',
}

export const AGENT_LINES: Record<string, string> = {
  galaxy:
    "Welcome back, Aditya. I've mapped your eighteen thousand followers into six tribes. Which audience are we targeting for the next campaign?",
  zoom:
    'Students & EdTech — four thousand four hundred followers, most active weeknights, they respond to price and relatability. What are we launching for them?',
  cameraAsk: 'Want to turn your camera on and show me the product?',
  cameraLive: "Nice — I can see it. Palm-sized robot, little screen face. Tell me about it.",
  brief:
    "Got it. Byte — an AI study companion that quizzes students from their own notes. Writing your first draft and sending the poster brief to Grok Imagine now.",
  gen1: "Here's iteration one. Dark, technical, product-forward. What should I change?",
  gen2:
    'Warmer palette, desk scene, early-bird price on the poster. The copy now leads with the all-nighter hook. Anything else?',
  gen3:
    "Robot's the hero now — launch date and early-bird badge are on. Before this goes anywhere near your feed: want me to run it through the wind tunnel against your student tribe?",
  abtest:
    'Spinning up four hundred simulated students from your embeddings. Variant A is iteration two, variant B is the final. Watching engagement now.',
  verdict:
    'Variant B out-performed by thirty-eight percent — ninety-six percent confidence, driven by replies and bookmarks. Ship it?',
  ship: "Posted to X, and the tribe is exported as an Ads-ready custom audience. Good launch, Aditya.",
}

// What the presenter is expected to say at each listening beat (also used
// verbatim by autopilot). Recognition is deterministic: anything advances.
export const USER_LINES: Partial<Record<Stage, string>> = {
  galaxy: "Let's target the students cluster.",
  zoom: "I'm launching a little robot for students — let me show you.",
  brief:
    "It's called Byte — a palm-sized AI study buddy. It sits on your desk, quizzes you from your own notes, and guards your focus. Early bird is ninety-nine dollars.",
  gen1: 'Make it warmer — put it on a student\'s desk, and show the price.',
  gen2: 'Love it. Make the robot the hero, and add the launch date and an early-bird badge.',
  gen3: 'Run the test.',
  verdict: 'Ship it.',
}

export interface Iteration {
  version: 1 | 2 | 3
  imaginePrompt: string
  tweet: string
  changeNote: string
}

export const ITERATIONS: Iteration[] = [
  {
    version: 1,
    imaginePrompt:
      'product poster, palm-sized companion robot with OLED face, midnight studio, neon violet rim light, minimal, premium tech launch key art',
    tweet:
      "meet byte. a palm-sized AI study buddy that sits on your desk, quizzes you before exams, and guards your focus.\n\nbuilt for students. priced like a textbook.",
    changeNote: 'First pass — dark, technical, product-forward.',
  },
  {
    version: 2,
    imaginePrompt:
      'cozy dorm desk at night, warm lamp glow, companion robot beside textbooks and coffee, soft amber palette, price tag $99 early bird, inviting editorial poster',
    tweet:
      "pulling an all-nighter? byte notices.\n\nit quizzes you from your own notes, schedules your breaks, and celebrates the small wins.\n\n$99 early bird — cheaper than your chem textbook.",
    changeNote: 'Warmer palette · desk scene · price added · all-nighter hook.',
  },
  {
    version: 3,
    imaginePrompt:
      'hero shot, companion robot large in frame with confident OLED smile, violet-to-amber gradient, EARLY BIRD $99 badge, "Launching Sept 4" lockup, celebratory launch key art',
    tweet:
      "byte launches sept 4 🚀\n\npalm-sized AI study buddy · quizzes you from your own notes · guards your focus\n\nfirst 500 students get it for $99. reply BYTE and i'll DM you early access.",
    changeNote: 'Robot as hero · launch date · early-bird badge · reply-gated CTA.',
  },
]

// Beat routing table: stage → next stage once the user has spoken.
export const NEXT: Partial<Record<Stage, Stage>> = {
  galaxy: 'zoom',
  zoom: 'cameraAsk',
  brief: 'gen1',
  gen1: 'gen2',
  gen2: 'gen3',
  gen3: 'abtest',
  verdict: 'ship',
}
