// The three "Grok Imagine" poster iterations, rendered as crafted SVG so the
// demo is fully deterministic and offline. Each maps 1:1 to an imaginePrompt
// in state/script.ts.

function Robot({
  x,
  y,
  s = 1,
  happy = false,
  shell = '#eef1ff',
  shellDark = '#c9cdea',
  eye = '#35e0ff',
}: {
  x: number
  y: number
  s?: number
  happy?: boolean
  shell?: string
  shellDark?: string
  eye?: string
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* ground shadow */}
      <ellipse cx="0" cy="238" rx="150" ry="26" fill="#000" opacity="0.35" />
      {/* antenna */}
      <rect x="-4" y="-176" width="8" height="34" rx="4" fill={shellDark} />
      <circle cx="0" cy="-186" r="13" fill={eye}>
        <animate attributeName="opacity" values="1;0.5;1" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="0" cy="-186" r="22" fill={eye} opacity="0.22" />
      {/* head */}
      <rect x="-130" y="-150" width="260" height="196" rx="58" fill={`url(#shell-${shell.slice(1)})`} />
      <rect x="-130" y="-150" width="260" height="196" rx="58" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
      {/* face screen */}
      <rect x="-104" y="-126" width="208" height="148" rx="38" fill="#070b18" />
      <rect x="-104" y="-126" width="208" height="148" rx="38" fill="url(#screenGlow)" />
      {/* eyes */}
      {happy ? (
        <g stroke={eye} strokeWidth="12" strokeLinecap="round" fill="none">
          <path d="M -62 -52 q 20 -26 40 0" />
          <path d="M 22 -52 q 20 -26 40 0" />
        </g>
      ) : (
        <g fill={eye}>
          <circle cx="-42" cy="-58" r="17">
            <animate attributeName="ry" values="17;2;17" dur="4s" repeatCount="indefinite" />
          </circle>
          <circle cx="42" cy="-58" r="17" />
        </g>
      )}
      {/* smile */}
      <path d="M -26 -12 q 26 20 52 0" stroke={eye} strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.9" />
      {/* body */}
      <rect x="-96" y="56" width="192" height="150" rx="46" fill={`url(#shell-${shell.slice(1)})`} />
      <rect x="-96" y="56" width="192" height="150" rx="46" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="2" />
      {/* chest light */}
      <circle cx="0" cy="112" r="16" fill={eye} opacity="0.85" />
      <circle cx="0" cy="112" r="28" fill={eye} opacity="0.18" />
      {/* speaker dots */}
      <g fill={shellDark}>
        {[-30, -10, 10, 30].map((dx) => (
          <circle key={dx} cx={dx} cy={168} r="4.5" />
        ))}
      </g>
      {/* arms */}
      <rect x="-134" y="70" width="30" height="92" rx="15" fill={shellDark} />
      <rect x="104" y="70" width="30" height="92" rx="15" fill={shellDark} />
    </g>
  )
}

function Defs({ shell, shellDark }: { shell: string; shellDark: string }) {
  return (
    <defs>
      <linearGradient id={`shell-${shell.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shell} />
        <stop offset="1" stopColor={shellDark} />
      </linearGradient>
      <radialGradient id="screenGlow" cx="0.5" cy="0.25" r="0.9">
        <stop offset="0" stopColor="#1b2b52" stopOpacity="0.9" />
        <stop offset="1" stopColor="#070b18" stopOpacity="0" />
      </radialGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0" />
      </filter>
    </defs>
  )
}

const W = 880
const H = 1100

export function Poster({ version }: { version: 1 | 2 | 3 }) {
  if (version === 1) return <PosterV1 />
  if (version === 2) return <PosterV2 />
  return <PosterV3 />
}

function PosterV1() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="poster" role="img" aria-label="Byte poster v1">
      <Defs shell="#eef1ff" shellDark="#c9cdea" />
      <defs>
        <radialGradient id="v1bg" cx="0.5" cy="0.42" r="0.9">
          <stop offset="0" stopColor="#191038" />
          <stop offset="0.55" stopColor="#0e0926" />
          <stop offset="1" stopColor="#070515" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#v1bg)" />
      {/* neon rings */}
      {[210, 300, 390].map((r, i) => (
        <circle key={r} cx={W / 2} cy={470} r={r} fill="none" stroke="#7c5cff" strokeOpacity={0.28 - i * 0.08} strokeWidth="1.5" />
      ))}
      <circle cx={W / 2} cy={470} r={150} fill="#7c5cff" opacity="0.14" />
      <Robot x={W / 2} y={470} s={1.06} />
      <text x={W / 2} y={870} textAnchor="middle" fontSize="128" fontWeight="800" letterSpacing="6" fill="#f4f2ff" fontFamily="Inter Variable, system-ui">
        BYTE
      </text>
      <text x={W / 2} y={930} textAnchor="middle" fontSize="34" fill="#a89ee0" fontFamily="Inter Variable, system-ui">
        your AI study buddy
      </text>
      <text x={W / 2} y={1040} textAnchor="middle" fontSize="22" letterSpacing="4" fill="#5d55a8" fontFamily="Inter Variable, system-ui">
        BYTEBOT.STUDY · FALL 2026
      </text>
      <rect width={W} height={H} filter="url(#grain)" />
    </svg>
  )
}

function PosterV2() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="poster" role="img" aria-label="Byte poster v2">
      <Defs shell="#fff4e4" shellDark="#e3c9a8" />
      <defs>
        <linearGradient id="v2bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241307" />
          <stop offset="1" stopColor="#140a04" />
        </linearGradient>
        <radialGradient id="lamp" cx="0.72" cy="0.18" r="0.75">
          <stop offset="0" stopColor="#ffb95e" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ff9d3d" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3820" />
          <stop offset="1" stopColor="#3a2312" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#v2bg)" />
      <rect width={W} height={H} fill="url(#lamp)" />
      {/* lamp */}
      <g stroke="#c9a06a" strokeWidth="10" strokeLinecap="round" fill="none">
        <path d="M 700 690 L 700 470 L 610 380" />
      </g>
      <path d="M 645 340 a 52 52 0 0 1 -70 74 z" fill="#e8b877" />
      <ellipse cx="590" cy="430" rx="130" ry="80" fill="#ffb95e" opacity="0.15" />
      {/* desk */}
      <rect x="0" y="690" width={W} height="34" fill="url(#desk)" />
      <rect x="0" y="724" width={W} height="376" fill="#180d05" />
      <rect x="0" y="690" width={W} height="6" fill="#ffb95e" opacity="0.25" />
      {/* books */}
      <g>
        <rect x="96" y="622" width="190" height="26" rx="5" fill="#7a4030" />
        <rect x="112" y="594" width="168" height="26" rx="5" fill="#2f5560" />
        <rect x="104" y="566" width="150" height="26" rx="5" fill="#6b5b2e" />
        <text x="188" y="613" textAnchor="middle" fontSize="15" fill="#cdd8de" fontFamily="Inter Variable, system-ui">ORGANIC CHEM II</text>
      </g>
      {/* mug */}
      <g>
        <rect x="742" y="626" width="64" height="66" rx="10" fill="#a44a3f" />
        <path d="M 806 640 q 34 14 0 40" stroke="#a44a3f" strokeWidth="10" fill="none" />
        <path d="M 762 606 q 6 -14 0 -24 M 782 606 q 6 -14 0 -24" stroke="#d8c6b8" strokeWidth="5" fill="none" opacity="0.7" strokeLinecap="round" />
      </g>
      {/* sticky note */}
      <rect x="560" y="632" width="86" height="60" rx="4" fill="#e8d06a" transform="rotate(-4 600 660)" />
      <Robot x={430} y={478} s={0.92} shell="#fff4e4" shellDark="#e3c9a8" eye="#41e3ff" />
      {/* headline */}
      <text x="72" y="130" fontSize="58" fontWeight="750" fill="#ffe9cf" fontFamily="Inter Variable, system-ui">
        for the all-nighters.
      </text>
      <text x="72" y="182" fontSize="30" fill="#c99d6e" fontFamily="Inter Variable, system-ui">
        byte — the study buddy that notices.
      </text>
      {/* price sticker */}
      <g transform="rotate(-9 700 880)">
        <circle cx="700" cy="880" r="102" fill="#ff6b4a" />
        <circle cx="700" cy="880" r="102" fill="none" stroke="#ffd9cf" strokeWidth="4" strokeDasharray="4 8" />
        <text x="700" y="862" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff1ec" fontFamily="Inter Variable, system-ui">
          EARLY BIRD
        </text>
        <text x="700" y="922" textAnchor="middle" fontSize="58" fontWeight="850" fill="#ffffff" fontFamily="Inter Variable, system-ui">
          $99
        </text>
      </g>
      <text x="72" y="1042" fontSize="22" letterSpacing="3" fill="#8a6540" fontFamily="Inter Variable, system-ui">
        BYTEBOT.STUDY
      </text>
      <rect width={W} height={H} filter="url(#grain)" />
    </svg>
  )
}

function PosterV3() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="poster" role="img" aria-label="Byte poster v3">
      <Defs shell="#f2f0ff" shellDark="#cfc7f2" />
      <defs>
        <linearGradient id="v3bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a1257" />
          <stop offset="0.55" stopColor="#4a1e6e" />
          <stop offset="1" stopColor="#8a4a2c" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#v3bg)" />
      <circle cx={W / 2} cy={620} r={250} fill="#b28aff" opacity="0.18" />
      <circle cx={W / 2} cy={620} r={340} fill="none" stroke="#e8c8ff" strokeOpacity="0.2" strokeWidth="2" />
      {/* confetti */}
      <g>
        {[
          [120, 180, '#ffd166', 0], [790, 240, '#41e3ff', 30], [180, 760, '#ff7ac6', -20],
          [740, 700, '#ffd166', 45], [90, 480, '#41e3ff', 10], [810, 470, '#ff7ac6', -35],
          [260, 130, '#b28aff', 20], [640, 130, '#3ee6a0', -15], [420, 90, '#ffd166', 40],
        ].map(([x, y, c, r], i) => (
          <rect key={i} x={Number(x)} y={Number(y)} width="16" height="7" rx="3" fill={String(c)} transform={`rotate(${r} ${x} ${y})`} opacity="0.9" />
        ))}
      </g>
      {/* lockup */}
      <text x={W / 2} y={150} textAnchor="middle" fontSize="40" letterSpacing="10" fontWeight="600" fill="#e5cdff" fontFamily="Inter Variable, system-ui">
        LAUNCHING SEPT 4
      </text>
      <text x={W / 2} y={262} textAnchor="middle" fontSize="120" fontWeight="850" letterSpacing="4" fill="#ffffff" fontFamily="Inter Variable, system-ui">
        byte
      </text>
      <Robot x={W / 2} y={640} s={1.42} happy shell="#f2f0ff" shellDark="#cfc7f2" />
      {/* early-bird badge */}
      <g transform="rotate(10 742 300)">
        <rect x="640" y="256" width="204" height="88" rx="44" fill="#ffd166" />
        <text x="742" y="292" textAnchor="middle" fontSize="22" fontWeight="800" fill="#4a2c05" fontFamily="Inter Variable, system-ui">
          EARLY BIRD
        </text>
        <text x="742" y="326" textAnchor="middle" fontSize="34" fontWeight="850" fill="#3a2103" fontFamily="Inter Variable, system-ui">
          $99
        </text>
      </g>
      {/* CTA strip */}
      <rect x="140" y="962" width={W - 280} height="76" rx="38" fill="#120a24" opacity="0.75" />
      <text x={W / 2} y={1010} textAnchor="middle" fontSize="30" fontWeight="650" fill="#f0e6ff" fontFamily="Inter Variable, system-ui">
        reply “BYTE” for early access
      </text>
      <rect width={W} height={H} filter="url(#grain)" />
    </svg>
  )
}
