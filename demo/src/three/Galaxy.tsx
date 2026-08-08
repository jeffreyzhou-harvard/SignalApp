import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { CLUSTERS, type Cluster } from '../data/clusters'
import { Starfield } from './Starfield'
import { FOLLOWERS, followersOf, type Follower } from '../data/followers'
import type { Stage } from '../state/script'

// ── avatar → circular canvas texture ────────────────────────────────────────
function makeAvatarTexture(img: HTMLImageElement, color: string): THREE.Texture {
  const S = 112
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')!
  // soft glow ring
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 3.5
  ctx.stroke()
  ctx.restore()
  // clipped avatar
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S / 2 - 15, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(img, 15, 15, S - 30, S - 30)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 2
  return tex
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

function useAvatarTextures(): Map<number, THREE.Texture> | null {
  const [map, setMap] = useState<Map<number, THREE.Texture> | null>(null)
  useEffect(() => {
    let dead = false
    const colors = new Map(CLUSTERS.map((c) => [c.id, c.color]))
    Promise.all(
      FOLLOWERS.map(async (f) => {
        try {
          const img = await loadImage(f.avatar)
          return [f.id, makeAvatarTexture(img, colors.get(f.clusterId)!)] as const
        } catch {
          return null
        }
      }),
    ).then((entries) => {
      if (dead) return
      const m = new Map<number, THREE.Texture>()
      for (const e of entries) if (e) m.set(e[0], e[1])
      setMap(m)
    })
    return () => {
      dead = true
    }
  }, [])
  return map
}

// ── intra-cluster edges (each node → 2 nearest neighbours) ──────────────────
function clusterEdges(members: Follower[]): Float32Array {
  const segs: number[] = []
  for (const f of members) {
    const dists = members
      .filter((o) => o.id !== f.id)
      .map((o) => ({
        o,
        d:
          (f.pos[0] - o.pos[0]) ** 2 +
          (f.pos[1] - o.pos[1]) ** 2 +
          (f.pos[2] - o.pos[2]) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
    for (const { o } of dists) segs.push(...f.pos, ...o.pos)
  }
  return new Float32Array(segs)
}

// ── one tribe: sprites + edges + label ───────────────────────────────────────
function ClusterGroup({
  cluster,
  textures,
  stage,
  selectedId,
  onPickCluster,
  onHover,
}: {
  cluster: Cluster
  textures: Map<number, THREE.Texture>
  stage: Stage
  selectedId: string | null
  onPickCluster: (id: string) => void
  onHover: (f: Follower | null) => void
}) {
  const members = useMemo(() => followersOf(cluster.id), [cluster.id])
  const edges = useMemo(() => clusterEdges(members), [members])
  const groupRef = useRef<THREE.Group>(null)
  const lineMat = useRef<THREE.LineBasicMaterial>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  const dimmed = selectedId !== null && selectedId !== cluster.id && stage !== 'ship' && stage !== 'galaxy'
  const isLive = stage === 'abtest' && cluster.id === selectedId

  useFrame(({ clock }, dt) => {
    const k = 1 - Math.exp(-6 * dt)
    const targetOp = dimmed ? 0.08 : 1
    const g = groupRef.current
    if (!g) return
    let i = 0
    for (const child of g.children) {
      if ((child as THREE.Sprite).isSprite) {
        const s = child as THREE.Sprite
        const m = s.material as THREE.SpriteMaterial
        m.opacity += (targetOp - m.opacity) * k
        const base = hovered === members[i]?.id ? 1.35 : 0.92
        const pulse = isLive ? 1 + 0.18 * Math.sin(clock.elapsedTime * 3 + i * 1.7) : 1
        const target = base * pulse
        s.scale.x += (target - s.scale.x) * k
        s.scale.y = s.scale.x
        i++
      }
    }
    if (lineMat.current) {
      const lt = dimmed ? 0.015 : 0.16
      lineMat.current.opacity += (lt - lineMat.current.opacity) * k
    }
  })

  const labelDim = dimmed
  return (
    <group ref={groupRef}>
      {members.map((f) => {
        const tex = textures.get(f.id)
        if (!tex) return null
        return (
          <sprite
            key={f.id}
            position={f.pos}
            scale={[0.92, 0.92, 1]}
            onClick={(e) => {
              e.stopPropagation()
              onPickCluster(cluster.id)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(f.id)
              onHover(f)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setHovered(null)
              onHover(null)
              document.body.style.cursor = 'auto'
            }}
          >
            <spriteMaterial map={tex} transparent depthWrite={false} />
          </sprite>
        )
      })}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edges, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={lineMat}
          color={cluster.color}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      <Html position={cluster.center} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`cluster-label ${labelDim ? 'dim' : ''}`} style={{ ['--c' as any]: cluster.color }}>
          <span className="cluster-name">{cluster.label}</span>
          <span className="cluster-count">{cluster.members.toLocaleString()} followers</span>
        </div>
      </Html>
    </group>
  )
}

// ── camera rig + scene offset ────────────────────────────────────────────────
function CameraRig({ stage, selectedId, galaxyRef }: { stage: Stage; selectedId: string | null; galaxyRef: RefObject<THREE.Group | null> }) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3(0, 0, 0))
  const tmp = useRef(new THREE.Vector3())

  useFrame((_, dt) => {
    const g = galaxyRef.current
    if (!g) return
    const k = 1 - Math.exp(-2.2 * dt)

    // scene slides left while the creation studio / wind tunnel panel is open
    const panelOpen = ['gen1', 'gen2', 'gen3', 'abtest', 'verdict'].includes(stage)
    g.position.x += ((panelOpen ? -13 : 0) - g.position.x) * k

    // slow auto-rotation only in the overview
    if (stage === 'galaxy' || stage === 'onboard' || stage === 'ship') {
      g.rotation.y += dt * 0.03
    }

    const cluster = CLUSTERS.find((c) => c.id === selectedId)
    let desired: THREE.Vector3
    let target: THREE.Vector3
    if (cluster && stage !== 'galaxy' && stage !== 'ship' && stage !== 'onboard') {
      const world = tmp.current.set(...cluster.center)
      g.localToWorld(world)
      const dir = world.clone().sub(g.position).setY(0).normalize()
      const dist = stage === 'abtest' || stage === 'verdict' ? 24 : 13
      desired = world.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, stage === 'abtest' ? 7 : 3.5, 0))
      target = world
    } else {
      desired = new THREE.Vector3(0, 9, 44)
      target = new THREE.Vector3(0, 0, 0)
    }
    camera.position.lerp(desired, k)
    look.current.lerp(target, k)
    camera.lookAt(look.current)
  })
  return null
}

// ── nebula backdrop blobs ────────────────────────────────────────────────────
function Nebula() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, 'rgba(124,92,255,0.5)')
    g.addColorStop(0.5, 'rgba(60,40,140,0.16)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <>
      <sprite position={[-30, 8, -40]} scale={[90, 90, 1]}>
        <spriteMaterial map={tex} transparent opacity={0.33} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite position={[35, -14, -55]} scale={[110, 110, 1]}>
        <spriteMaterial map={tex} transparent opacity={0.2} color="#1d9bf0" depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </>
  )
}

// ── public scene ─────────────────────────────────────────────────────────────
export function GalaxyScene({
  stage,
  selectedId,
  onPickCluster,
}: {
  stage: Stage
  selectedId: string | null
  onPickCluster: (id: string) => void
}) {
  const textures = useAvatarTextures()
  const galaxyRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState<Follower | null>(null)

  return (
    <>
      <color attach="background" args={['#050614']} />
      <fog attach="fog" args={['#050614', 55, 150]} />
      <Starfield />
      <Nebula />
      <group ref={galaxyRef}>
        {textures &&
          CLUSTERS.map((c) => (
            <ClusterGroup
              key={c.id}
              cluster={c}
              textures={textures}
              stage={stage}
              selectedId={selectedId}
              onPickCluster={onPickCluster}
              onHover={setHovered}
            />
          ))}
        {hovered && (
          <Html position={hovered.pos} zIndexRange={[35, 0]} style={{ pointerEvents: 'none', transform: 'translate(14px, -50%)' }}>
            <div className="node-tip">
              <img src={hovered.avatar} alt="" />
              <div>
                <div className="node-tip-name">{hovered.name}</div>
                <div className="node-tip-handle">{hovered.handle}</div>
                <div className="node-tip-bio">{hovered.bio}</div>
              </div>
            </div>
          </Html>
        )}
      </group>
      <CameraRig stage={stage} selectedId={selectedId} galaxyRef={galaxyRef} />
    </>
  )
}
