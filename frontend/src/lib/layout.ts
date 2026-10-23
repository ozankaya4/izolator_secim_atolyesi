import type { Mount, Project } from './types';
import { stable } from './types';
type LayoutState = { mounts: Mount[]; system: Pick<Project['system'], 'cg_mm'> };
export function undoLayout<T extends LayoutState>(current: T, before: T, after: T): T {
  const changedCG = stable(before.system.cg_mm) !== stable(after.system.cg_mm);
  if (
    stable(current.mounts) !== stable(after.mounts) ||
    (changedCG && stable(current.system.cg_mm) !== stable(after.system.cg_mm))
  ) {
    throw new Error(
      'Yerleşim bu işlemden sonra değiştirildi. Güncel girdiler korundu; eski yerleşim işlemi geri alınmadı.',
    );
  }
  return {
    ...current,
    mounts: structuredClone(before.mounts),
    system: {
      ...current.system,
      cg_mm: changedCG ? [...before.system.cg_mm] : current.system.cg_mm,
    },
  };
}
export const presetNames = {
  base4: 'Dikdörtgen · 4',
  base6: 'Taban altıgen · 6',
  base8: 'Taban sekizgen · 8',
  center4: 'CG merkezli kare · 4',
  center8: 'Küp · 8',
};
export type Preset = keyof typeof presetNames;
export function align(m: Mount, cg: number[]): Mount {
  const dx = cg[0] - m.position_mm[0],
    dy = cg[1] - m.position_mm[1];
  const yaw = Math.hypot(dx, dy) < 1e-9 ? 0 : (Math.atan2(-dx, dy) * 180) / Math.PI;
  return { ...m, angles_deg: [0, 0, yaw] };
}
export function preset(
  p: Project,
  kind: Preset,
  size: number,
  depth: number,
  roll: number,
): Project {
  const h = size / 2;
  let coords: number[][] = [];
  if (kind === 'base4')
    coords = [
      [-h, -depth / 2, 0],
      [h, -depth / 2, 0],
      [h, depth / 2, 0],
      [-h, depth / 2, 0],
    ];
  else if (kind === 'base6' || kind === 'base8') {
    const n = kind === 'base6' ? 6 : 8;
    coords = Array.from({ length: n }, (_, i) => [
      h * Math.cos((2 * Math.PI * i) / n),
      h * Math.sin((2 * Math.PI * i) / n),
      0,
    ]);
  } else if (kind === 'center4')
    coords = [
      [-h, -h, 0],
      [h, -h, 0],
      [h, h, 0],
      [-h, h, 0],
    ];
  else coords = [-h, h].flatMap((z) => [-h, h].flatMap((y) => [-h, h].map((x) => [x, y, z])));
  const cg = kind.startsWith('center') ? [0, 0, 0] : p.system.cg_mm;
  return {
    ...p,
    system: { ...p.system, cg_mm: cg },
    mounts: coords.map((position_mm, i) => {
      const m = align({ ...p.mounts[0], id: 'I' + (i + 1), position_mm }, cg);
      return { ...m, angles_deg: [roll, 0, m.angles_deg[2]] };
    }),
  };
}
