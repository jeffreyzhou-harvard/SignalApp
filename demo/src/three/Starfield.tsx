import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../lib/rng'

export function Starfield() {
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => {
    const rng = mulberry32(7)
    const n = 2600
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 90 + rng() * 160
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.cos(phi)
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.004
  })

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.55} color="#5a6494" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  )
}
