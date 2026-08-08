import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { GalaxyScene } from './three/Galaxy'
import { Onboarding } from './components/Onboarding'
import { Hud } from './components/Hud'
import { VoiceDock, type OrbState } from './components/VoiceDock'
import { CameraAskModal, CameraPip } from './components/CameraFlow'
import { Studio } from './components/Studio'
import { ABTest } from './components/ABTest'
import { ShipOverlay } from './components/ShipOverlay'
import { AGENT_LINES, USER_LINES, type Stage } from './state/script'
import { listen, speak, stopSpeaking, voiceSupport, type ListenHandle } from './lib/voice'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function routeCluster(t: string): string {
  const s = t.toLowerCase()
  if (/(student|edtech|school|college|campus|uni)/.test(s)) return 'students'
  if (/(robot|hardware|maker)/.test(s)) return 'robotics'
  if (/(design|creative|creator)/.test(s)) return 'design'
  if (/(founder|vc|invest)/.test(s)) return 'founders'
  if (/(productiv|habit|guru)/.test(s)) return 'productivity'
  if (/(ai|builder|engineer|biggest|largest|all|everyone)/.test(s)) return 'ai-builders'
  return 'students'
}

export default function App() {
  const [stage, setStage] = useState<Stage>('onboard')
  const [selected, setSelected] = useState<string | null>(null)
  const [agentLine, setAgentLine] = useState('')
  const [userLine, setUserLine] = useState('')
  const [orb, setOrb] = useState<OrbState>('idle')
  const [autopilot, setAutopilot] = useState(false)
  const [muted, setMuted] = useState(false)
  const [camOn, setCamOn] = useState<boolean | null>(null)
  const [camScanned, setCamScanned] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [visibleVersion, setVisibleVersion] = useState<0 | 1 | 2 | 3>(0)

  const stageRef = useRef(stage)
  stageRef.current = stage
  const autopilotRef = useRef(autopilot)
  autopilotRef.current = autopilot
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const manualResolve = useRef<(() => void) | null>(null)
  const listenHandle = useRef<ListenHandle | null>(null)

  const go = useCallback((s: Stage) => setStage(s), [])

  // ── global keys: A autopilot · M mute · R restart · Space/Enter advance ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') setAutopilot((v) => !v)
      if (e.key === 'm' || e.key === 'M') setMuted((v) => !v)
      if (e.key === 'r' || e.key === 'R') location.reload()
      if (e.key === ' ' || e.key === 'Enter') {
        if (manualResolve.current) {
          e.preventDefault()
          manualResolve.current()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── the director ──────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false
    const alive = () => !dead && stageRef.current === stage

    const say = async (text: string) => {
      if (!alive()) return
      setOrb('speaking')
      setUserLine('')
      setAgentLine(text)
      await speak(text, mutedRef.current)
      if (alive()) setOrb('idle')
    }

    const typeOut = async (line: string) => {
      const words = line.split(' ')
      for (let i = 1; i <= words.length; i++) {
        if (!alive()) return
        setUserLine(words.slice(0, i).join(' '))
        await delay(75)
      }
    }

    const waitManual = () =>
      new Promise<void>((res) => {
        manualResolve.current = () => {
          manualResolve.current = null
          res()
        }
      })

    // One listening beat. Deterministic: mic transcript, manual key/orb press
    // (injects the scripted line), or autopilot — something always advances.
    const user = async (key: Stage): Promise<string> => {
      if (!alive()) return ''
      const scripted = USER_LINES[key] ?? 'okay'
      setUserLine('')
      setOrb('listening')
      let transcript: string | null = null
      if (autopilotRef.current) {
        await delay(1100)
        await typeOut(scripted)
        transcript = scripted
      } else {
        while (alive() && transcript === null) {
          const manualP = waitManual().then(() => ({ src: 'manual' as const, t: null as string | null }))
          if (voiceSupport.stt) {
            listenHandle.current = listen(setUserLine)
            const winner = await Promise.race([
              listenHandle.current.result.then((t) => ({ src: 'mic' as const, t })),
              manualP,
            ])
            listenHandle.current.stop()
            if (winner.src === 'mic' && winner.t) {
              transcript = winner.t
              setUserLine(winner.t)
            } else if (winner.src === 'manual') {
              await typeOut(scripted)
              transcript = scripted
            }
            // mic returned null (timeout/denied) → loop; manual still armed
          } else {
            await manualP
            await typeOut(scripted)
            transcript = scripted
          }
        }
      }
      manualResolve.current = null
      if (alive()) setOrb('thinking')
      await delay(450)
      return transcript ?? scripted
    }

    async function run() {
      switch (stage) {
        case 'onboard':
          break
        case 'galaxy': {
          await delay(800)
          await say(AGENT_LINES.galaxy)
          const t = await user('galaxy')
          if (!alive()) return
          setSelected(routeCluster(t))
          go('zoom')
          break
        }
        case 'zoom': {
          await delay(1700)
          await say(AGENT_LINES.zoom)
          await user('zoom')
          if (alive()) go('cameraAsk')
          break
        }
        case 'cameraAsk': {
          await say(AGENT_LINES.cameraAsk)
          if (!alive()) return
          if (autopilotRef.current) {
            await delay(1200)
            if (alive()) {
              setCamOn(true)
              go('camera')
            }
          }
          // otherwise the modal buttons drive the transition
          break
        }
        case 'camera': {
          if (camOn) {
            await delay(2700)
            if (!alive()) return
            setCamScanned(true)
            await delay(700)
            await say(AGENT_LINES.cameraLive)
          } else {
            await say('No problem — describe it for me.')
          }
          await user('brief')
          if (alive()) go('brief')
          break
        }
        case 'brief': {
          await say(AGENT_LINES.brief)
          await delay(400)
          if (alive()) go('gen1')
          break
        }
        case 'gen1':
        case 'gen2':
        case 'gen3': {
          const v = Number(stage.slice(-1)) as 1 | 2 | 3
          setGenerating(true)
          await delay(3100)
          if (!alive()) return
          setGenerating(false)
          setVisibleVersion(v)
          await delay(700)
          await say(AGENT_LINES[stage])
          await user(stage)
          if (!alive()) return
          go(v === 3 ? 'abtest' : ((`gen${v + 1}`) as Stage))
          break
        }
        case 'abtest': {
          await delay(900)
          await say(AGENT_LINES.abtest)
          // ABTest's onDone moves us to verdict
          break
        }
        case 'verdict': {
          await delay(600)
          await say(AGENT_LINES.verdict)
          await user('verdict')
          if (alive()) go('ship')
          break
        }
        case 'ship': {
          await delay(600)
          await say(AGENT_LINES.ship)
          break
        }
      }
    }

    run()
    return () => {
      dead = true
      stopSpeaking()
      listenHandle.current?.stop()
      manualResolve.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const orbClick = () => {
    if (orb === 'listening' && manualResolve.current) manualResolve.current()
    else if (orb === 'speaking') stopSpeaking()
  }

  const pickCluster = (id: string) => {
    if (stage === 'galaxy') {
      setSelected(id)
      stopSpeaking()
      go('zoom')
    }
  }

  const panelOpen = ['gen1', 'gen2', 'gen3', 'abtest', 'verdict'].includes(stage)
  const showStudio = ['gen1', 'gen2', 'gen3'].includes(stage)
  const showAB = stage === 'abtest' || stage === 'verdict'

  return (
    <div className="app">
      <Canvas camera={{ position: [0, 9, 44], fov: 50 }} dpr={[1, 2]}>
        <GalaxyScene stage={stage} selectedId={selected} onPickCluster={pickCluster} />
      </Canvas>

      {stage !== 'onboard' && <Hud stage={stage} />}

      {stage === 'onboard' && <Onboarding onDone={() => go('galaxy')} />}

      {stage === 'cameraAsk' && !autopilot && (
        <CameraAskModal
          onYes={() => {
            stopSpeaking()
            setCamOn(true)
            go('camera')
          }}
          onNo={() => {
            stopSpeaking()
            setCamOn(false)
            go('camera')
          }}
        />
      )}

      {stage === 'camera' && camOn && <CameraPip scanned={camScanned} />}

      <div className={`side-panel ${panelOpen ? 'open' : ''}`}>
        {showStudio && <Studio visibleVersion={visibleVersion} generating={generating} />}
        {showAB && <ABTest done={stage === 'verdict'} onDone={() => go('verdict')} />}
      </div>

      {stage === 'ship' && <ShipOverlay />}

      {stage !== 'onboard' && stage !== 'ship' && (
        <VoiceDock orb={orb} agentLine={agentLine} userLine={userLine} autopilot={autopilot} onOrbClick={orbClick} />
      )}

      {stage !== 'onboard' && (
        <div className="keys-hint">
          <b>space</b> advance · <b>a</b> autopilot · <b>m</b> mute · <b>r</b> restart
        </div>
      )}
    </div>
  )
}
