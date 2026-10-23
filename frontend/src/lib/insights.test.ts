import { expect, it } from 'vitest';
import { utilization } from './insights';
import type { Check } from './types';
it('sınır kullanım sırası yalnız anlamlı sayısal kontrolleri içerir', () => {
  const check = (measured: number | null, limit: number | null, status = 'within') =>
    ({ measured, limit, status }) as Check;
  const values = utilization([
    check(0, 10),
    check(12, 10, 'exceeded'),
    check(null, 10),
    check(5, 0),
    check(5, 10, 'unknown'),
    check(Infinity, 10),
  ]);
  expect(values.map((v) => v.ratio)).toEqual([1.2, 0]);
});
