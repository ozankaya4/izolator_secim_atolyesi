import { z } from 'zod';
import type { Result } from './types';
import { stable } from './types';
import { resultMetrics } from './insights';

const status = z.enum(['within', 'exceeded', 'verify', 'failed', 'not_run']);
const metric = z.number().finite().nullable();
export const scenarioSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  label: z.string().min(1).max(120),
  calculatedAt: z.string().max(80),
  solverVersion: z.string().max(80),
  catalogHash: z.string().max(80),
  overall: status,
  groups: z.object({ static: status, harmonic: status, psd: status, shock: status }),
  mass: z.number().positive().finite(),
  mountCount: z.number().int().min(2).max(20),
  products: z.string().max(2000),
  structure: z.enum(['rigid', 'flexible']),
  loadSignature: z.string().max(150000),
  metrics: z.object({
    mode_low: metric,
    mode_high: metric,
    static_motion: metric,
    harmonic_t: metric,
    psd_rms: metric,
    shock_g: metric,
    shock_motion: metric,
  }),
  // The draft is validated by the API again before it can replace the current project.
  project: z.unknown(),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export function scenarioFromResult(r: Result): Scenario {
  const groups = Object.fromEntries(
    (['static', 'harmonic', 'psd', 'shock'] as const).map((group) => {
      const checks = r.checks.filter((c) => c.group === group);
      const combined =
        (['failed', 'exceeded', 'verify', 'not_run'] as const).find((s) =>
          checks.some((c) => c.status === s),
        ) ?? (checks.length ? 'within' : 'not_run');
      return [group, combined];
    }),
  );
  return scenarioSchema.parse({
    id: r.snapshot_id,
    label: r.snapshot.name,
    calculatedAt: r.created_at,
    solverVersion: r.solver_version,
    catalogHash: r.catalog_sha256,
    overall: r.overall,
    groups,
    mass: r.snapshot.system.mass_kg,
    mountCount: r.snapshot.mounts.length,
    products: [...new Set(r.snapshot.mounts.map((m) => m.product_id ?? 'Kullanıcı katılığı'))].join(
      ' · ',
    ),
    structure: r.snapshot.structure.kind,
    loadSignature: stable({
      direction: r.snapshot.direction,
      harmonic: r.snapshot.harmonic,
      random: r.snapshot.random,
      shock: r.snapshot.shock,
      limits: r.snapshot.limits,
    }),
    metrics: resultMetrics(r),
    project: structuredClone(r.snapshot),
  });
}
export function parseScenarios(raw: unknown): Scenario[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Map<string, Scenario>();
  for (const item of raw.slice(0, 4)) {
    const parsed = scenarioSchema.safeParse(item);
    if (parsed.success) unique.set(parsed.data.id, parsed.data);
  }
  return [...unique.values()];
}
