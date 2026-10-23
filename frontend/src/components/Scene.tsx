import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import { Euler } from 'three';
import type { Project } from '../lib/types';
export type CameraView = 'iso' | 'top' | 'front';
function Camera({ view, scale, target }: { view: CameraView; scale: number; target: number[] }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.up.set(0, 0, 1);
    const v = view === 'top' ? [0, 0, 3] : view === 'front' ? [0, -3, 0.001] : [2, -2, 1.7];
    camera.position.set(
      target[0] + v[0] * scale,
      target[1] + v[1] * scale,
      target[2] + v[2] * scale,
    );
    camera.lookAt(...(target as [number, number, number]));
    camera.updateProjectionMatrix();
    invalidate();
  }, [view, scale, target, camera, invalidate]);
  return (
    <OrbitControls makeDefault enableDamping={false} target={target as [number, number, number]} />
  );
}
export default function Scene({
  project: p,
  selected,
  onSelect,
  view,
}: {
  project: Project;
  selected: string;
  onSelect: (s: string) => void;
  view: CameraView;
}) {
  const positions = p.mounts.map((m) => m.position_mm.map((x) => x / 1000));
  const cg = p.system.cg_mm.map((x) => x / 1000);
  const extent = Math.max(0.15, ...positions.flatMap((v) => v.map((x, i) => Math.abs(x - cg[i]))));
  const target = useMemo(() => cg, [cg.join(',')]);
  const points = positions.map((v) => v as [number, number, number]);
  return (
    <Canvas
      frameloop="demand"
      camera={{ fov: 38, near: 0.001, far: 10000 }}
      dpr={[1, 1.75]}
      aria-label="İzolatörlerin şematik üç boyutlu yerleşimi"
    >
      <color attach="background" args={['#f4f7f6']} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[2, -3, 5]} intensity={2} />
      <Camera view={view} scale={extent * 1.45} target={target} />
      <gridHelper args={[extent * 6, 12, '#c2cfcc', '#e1e8e6']} rotation={[Math.PI / 2, 0, 0]} />
      <axesHelper args={[extent * 0.8]} />
      <group position={cg as [number, number, number]}>
        <mesh>
          <sphereGeometry args={[extent * 0.038, 20, 20]} />
          <meshStandardMaterial color="#d48b36" />
        </mesh>
        <Line
          points={[
            [0, 0, -extent * 0.1],
            [0, 0, extent * 0.14],
          ]}
          color="#d48b36"
          lineWidth={1.5}
        />
      </group>
      {points.length > 2 && (
        <Line
          points={[...points, points[0]]}
          color="#91a8a2"
          lineWidth={1.4}
          dashed
          dashSize={0.01}
          gapSize={0.006}
        />
      )}
      <mesh position={cg as [number, number, number]}>
        <boxGeometry args={[extent * 1.8, extent * 1.2, extent * 0.32]} />
        <meshStandardMaterial color="#9db6ae" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      {p.mounts.map((m, i) => (
        <group
          key={m.id}
          position={points[i]}
          rotation={
            new Euler(
              ...(m.angles_deg.map((x) => (x * Math.PI) / 180) as [number, number, number]),
              'ZYX',
            )
          }
          onClick={(e) => {
            e.stopPropagation();
            onSelect(m.id);
          }}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[extent * 0.09, extent * 0.12, extent * 0.13, 24]} />
            <meshStandardMaterial
              color={selected === m.id ? '#176b68' : '#64837a'}
              roughness={0.6}
            />
          </mesh>
          <mesh position={[0, 0, extent * 0.08]}>
            <boxGeometry args={[extent * 0.24, extent * 0.18, extent * 0.026]} />
            <meshStandardMaterial
              color={selected === m.id ? '#3e8e83' : '#a1b1ac'}
              metalness={0.2}
            />
          </mesh>
          <axesHelper args={[extent * 0.24]} />
          {selected === m.id && (
            <mesh rotation={[0, 0, 0]}>
              <torusGeometry args={[extent * 0.16, extent * 0.008, 8, 48]} />
              <meshBasicMaterial color="#d48b36" />
            </mesh>
          )}
        </group>
      ))}
    </Canvas>
  );
}
