import type { components } from '../generated/api';
type Complete<T> = T extends (infer U)[]
  ? Complete<U>[]
  : T extends object
    ? { [K in keyof T]-?: Complete<T[K]> }
    : T;
export type Project = Complete<components['schemas']['Project']>;
export type Product = Complete<components['schemas']['Product']>;
export type Catalog = Complete<components['schemas']['Catalog']>;
export type Mount = Complete<components['schemas']['Mount']>;
export type Result = Complete<components['schemas']['AnalysisResult']>;
export type Check = Complete<components['schemas']['Check']>;
export type Response = Complete<components['schemas']['Response']>;
export type Job = Complete<components['schemas']['JobRead']>;
export type Migration = Complete<components['schemas']['MigrationResult']>;
export type Step = 'system' | 'layout' | 'loads' | 'results';
export const statusLabels = {
  within: 'Ön kontrol içinde',
  exceeded: 'Sınır aşıldı',
  verify: 'Doğrulama gerekli',
  failed: 'Hesaplanamadı',
  not_run: 'Hesaplanmadı',
} as const;
export const format = (value: number | undefined | null, digits = 3) =>
  value == null ? '—' : value.toLocaleString('tr-TR', { maximumFractionDigits: digits });
export function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
