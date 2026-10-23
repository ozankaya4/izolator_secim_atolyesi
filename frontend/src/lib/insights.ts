import type { Check, Result } from './types';

export const groupNames = {
  static: 'Katalog / statik yük',
  harmonic: 'Harmonik',
  psd: 'Rastlantısal / PSD',
  shock: 'Şok',
} as const;

export function utilization(checks: Check[]) {
  return checks
    .flatMap((check) => {
      if (
        check.measured == null ||
        check.limit == null ||
        !Number.isFinite(check.measured) ||
        !Number.isFinite(check.limit) ||
        check.measured < 0 ||
        check.limit <= 0 ||
        !['within', 'exceeded'].includes(check.status)
      )
        return [];
      return [{ check, ratio: check.measured / check.limit }];
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export const metricDefinitions = {
  mode_low: ['En düşük doğal frekans', 'Hz'],
  mode_high: ['En yüksek doğal frekans', 'Hz'],
  static_motion: ['En büyük yerel statik hareket', 'mm'],
  harmonic_t: ['Bağlantı yönsel geçirgenliği', 'T'],
  psd_rms: ['Bağlantı · en büyük eksen RMS', 'g RMS'],
  shock_g: ['Bağlantı · en büyük eksen tepesi', 'g tepe'],
  shock_motion: ['En büyük yerel dinamik şok hareketi', 'mm'],
} as const;
export type Metrics = Record<keyof typeof metricDefinitions, number | null>;
const maxAbs = (values: number[]) => (values.length ? Math.max(...values.map(Math.abs)) : null);
export function resultMetrics(r: Result): Metrics {
  return {
    mode_low: r.modes.length ? Math.min(...r.modes.map((m) => m.frequency_hz)) : null,
    mode_high: r.modes.length ? Math.max(...r.modes.map((m) => m.frequency_hz)) : null,
    static_motion: maxAbs(r.static.mounts.flatMap((m) => m.local_displacement_mm)),
    harmonic_t: r.harmonic?.connection_transmissibility ?? null,
    psd_rms: r.psd ? maxAbs(r.psd.response.connection_g) : null,
    shock_g: r.shock ? maxAbs(r.shock.compensated.response.connection_g) : null,
    shock_motion: r.shock ? maxAbs(r.shock.compensated.response.local_mm.flat()) : null,
  };
}
