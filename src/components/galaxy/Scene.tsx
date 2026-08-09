"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { AudienceCluster, AudienceMember } from "@/lib/audience/types";

/*
 * The audience galaxy, in AgentSim's own world: near-black space (#08090a),
 * quiet gray-blue stars, one faint accent nebula, hairline-chip labels.
 * Structure (avatar sprites, neighbor edges, click-to-zoom camera) follows
 * the stage demo in demo/src/three — kept as reference, not imported.
 */

function makeAvatarTexture(img: HTMLImageElement, color: string): THREE.Texture {
  const S = 112;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 15, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, 15, 15, S - 30, S - 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function useAvatarTextures(members: AudienceMember[], clusters: AudienceCluster[]) {
  const [map, setMap] = useState<Map<number, THREE.Texture> | null>(null);
  useEffect(() => {
    let dead = false;
    const colors = new Map(clusters.map((c) => [c.id, c.color]));
    Promise.all(
      members.map(async (m) => {
        try {
          const img = await loadImage(m.avatar);
          return [m.id, makeAvatarTexture(img, colors.get(m.clusterId) ?? "#82898f")] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (dead) return;
      const next = new Map<number, THREE.Texture>();
      for (const e of entries) if (e) next.set(e[0], e[1]);
      setMap(next);
    });
    return () => {
      dead = true;
    };
  }, [members, clusters]);
  return map;
}

function clusterEdges(members: AudienceMember[]): Float32Array {
  const segs: number[] = [];
  for (const m of members) {
    const nearest = members
      .filter((o) => o.id !== m.id)
      .map((o) => ({
        o,
        d:
          (m.pos[0] - o.pos[0]) ** 2 +
          (m.pos[1] - o.pos[1]) ** 2 +
          (m.pos[2] - o.pos[2]) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { o } of nearest) segs.push(...m.pos, ...o.pos);
  }
  return new Float32Array(segs);
}

function Starfield() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    // simple LCG so the field is stable between mounts
    let s = 7;
    const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const n = 2200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 90 + rng() * 160;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.004;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.5} color="#3d434c" transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** One faint identity-blue glow behind the field. */
function Nebula() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(77,163,255,0.35)");
    g.addColorStop(0.55, "rgba(77,163,255,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <sprite position={[8, -6, -60]} scale={[110, 110, 1]}>
      <spriteMaterial map={tex} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

function ClusterGroup({
  cluster,
  members,
  textures,
  selectedId,
  live,
  onPick,
  onHover,
}: {
  cluster: AudienceCluster;
  members: AudienceMember[];
  textures: Map<number, THREE.Texture>;
  selectedId: string | null;
  live: boolean;
  onPick: (id: string) => void;
  onHover: (m: AudienceMember | null) => void;
}) {
  const edges = useMemo(() => clusterEdges(members), [members]);
  const groupRef = useRef<THREE.Group>(null);
  const lineMat = useRef<THREE.LineBasicMaterial>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const dimmed = selectedId !== null && selectedId !== cluster.id;

  useFrame(({ clock }, dt) => {
    const k = 1 - Math.exp(-6 * dt);
    const g = groupRef.current;
    if (!g) return;
    const targetOp = dimmed ? 0.07 : 1;
    let i = 0;
    for (const child of g.children) {
      if ((child as THREE.Sprite).isSprite) {
        const s = child as THREE.Sprite;
        const m = s.material as THREE.SpriteMaterial;
        m.opacity += (targetOp - m.opacity) * k;
        const base = hovered === members[i]?.id ? 1.3 : 0.92;
        const pulse = live ? 1 + 0.18 * Math.sin(clock.elapsedTime * 3 + i * 1.7) : 1;
        const target = base * pulse;
        s.scale.x += (target - s.scale.x) * k;
        s.scale.y = s.scale.x;
        i++;
      }
    }
    if (lineMat.current) {
      const lt = dimmed ? 0.012 : 0.14;
      lineMat.current.opacity += (lt - lineMat.current.opacity) * k;
    }
  });

  return (
    <group ref={groupRef}>
      {members.map((m) => {
        const tex = textures.get(m.id);
        if (!tex) return null;
        return (
          <sprite
            key={m.id}
            position={m.pos}
            scale={[0.92, 0.92, 1]}
            onClick={(e) => {
              e.stopPropagation();
              onPick(cluster.id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(m.id);
              onHover(m);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHovered(null);
              onHover(null);
              document.body.style.cursor = "auto";
            }}
          >
            <spriteMaterial map={tex} transparent depthWrite={false} />
          </sprite>
        );
      })}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edges, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={lineMat}
          color={cluster.color}
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      <Html position={cluster.center} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
        <div
          className={`flex flex-col items-center gap-0.5 whitespace-nowrap rounded-lg border border-line bg-surface/80 px-3 py-1.5 backdrop-blur transition-opacity duration-300 ${
            dimmed ? "opacity-0" : "opacity-100"
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cluster.color }} />
            {cluster.label}
          </span>
          <span className="text-xs text-faint">{cluster.members.toLocaleString()} followers</span>
        </div>
      </Html>
    </group>
  );
}

function CameraRig({
  selectedId,
  clusters,
  galaxyRef,
  shifted,
}: {
  selectedId: string | null;
  clusters: AudienceCluster[];
  galaxyRef: RefObject<THREE.Group | null>;
  shifted: boolean;
}) {
  const { camera, gl } = useThree();
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const tmp = useRef(new THREE.Vector3());
  const pan = useRef({ x: 0, y: 0 });

  // Drag to pan: offsets the camera and its look-target along the view plane.
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let last = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      pan.current.x = Math.max(-30, Math.min(30, pan.current.x - (e.clientX - last.x) * 0.035));
      pan.current.y = Math.max(-20, Math.min(20, pan.current.y + (e.clientY - last.y) * 0.035));
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);

  // Re-center the pan when focus changes; the lerp makes it a glide.
  useEffect(() => {
    pan.current = { x: 0, y: 0 };
  }, [selectedId]);

  useFrame((_, dt) => {
    const g = galaxyRef.current;
    if (!g) return;
    const k = 1 - Math.exp(-2.2 * dt);

    // slide the field left while the campaign panel is open
    g.position.x += ((shifted ? -9 : 0) - g.position.x) * k;

    if (!selectedId) g.rotation.y += dt * 0.03;

    const cluster = clusters.find((c) => c.id === selectedId);
    let desired: THREE.Vector3;
    let target: THREE.Vector3;
    if (cluster) {
      const world = tmp.current.set(...cluster.center);
      g.localToWorld(world);
      const dir = world.clone().sub(g.position).setY(0).normalize();
      desired = world.clone().add(dir.multiplyScalar(13)).add(new THREE.Vector3(0, 3.5, 0));
      target = world;
    } else {
      desired = new THREE.Vector3(0, 9, 44);
      target = new THREE.Vector3(0, 0, 0);
    }

    // Apply the user's pan along the camera's view plane.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    const drift = right.multiplyScalar(pan.current.x).add(new THREE.Vector3(0, pan.current.y, 0));
    desired.add(drift);
    target.add(drift);

    camera.position.lerp(desired, k);
    look.current.lerp(target, k);
    camera.lookAt(look.current);
  });
  return null;
}

export function GalaxyScene({
  clusters,
  members,
  selectedId,
  pulseClusterId = null,
  shifted = false,
  onPick,
}: {
  clusters: AudienceCluster[];
  members: AudienceMember[];
  selectedId: string | null;
  pulseClusterId?: string | null;
  shifted?: boolean;
  onPick: (id: string) => void;
}) {
  const textures = useAvatarTextures(members, clusters);
  const galaxyRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<AudienceMember | null>(null);
  const byCluster = useMemo(() => {
    const m = new Map<string, AudienceMember[]>();
    for (const c of clusters) m.set(c.id, []);
    for (const member of members) m.get(member.clusterId)?.push(member);
    return m;
  }, [clusters, members]);

  return (
    <>
      <color attach="background" args={["#08090a"]} />
      <fog attach="fog" args={["#08090a", 55, 150]} />
      <Starfield />
      <Nebula />
      <group ref={galaxyRef}>
        {textures &&
          clusters.map((c) => (
            <ClusterGroup
              key={c.id}
              cluster={c}
              members={byCluster.get(c.id) ?? []}
              textures={textures}
              selectedId={selectedId}
              live={pulseClusterId === c.id}
              onPick={onPick}
              onHover={setHovered}
            />
          ))}
        {hovered && (
          <Html
            position={hovered.pos}
            zIndexRange={[35, 0]}
            style={{ pointerEvents: "none", transform: "translate(14px, -50%)" }}
          >
            <div className="flex w-56 items-start gap-2.5 rounded-xl border border-line-strong bg-overlay px-3 py-2.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hovered.avatar} alt="" className="h-9 w-9 rounded-full border border-line object-cover" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-fg">{hovered.name}</p>
                <p className="text-xs text-muted">{hovered.handle}</p>
                <p className="mt-0.5 text-xs leading-4 text-faint">{hovered.bio}</p>
              </div>
            </div>
          </Html>
        )}
      </group>
      <CameraRig selectedId={selectedId} clusters={clusters} galaxyRef={galaxyRef} shifted={shifted} />
    </>
  );
}
