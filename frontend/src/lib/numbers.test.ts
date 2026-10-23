import { describe, it, expect } from 'vitest';
import { parseNumber, parsePSD } from './numbers';
describe('Türkçe sayı ve PSD sınırı', () => {
  it('virgül, nokta ve bilimsel gösterimi sayıya dönüştürür', () => {
    expect(parseNumber('1,25')).toBe(1.25);
    expect(parseNumber('1.25')).toBe(1.25);
    expect(parseNumber('1,2e-3')).toBe(0.0012);
  });
  it('binlik ayracı, boş ve sonlu olmayan değerleri reddeder', () => {
    for (const x of ['', '1.234,5', 'NaN', 'Infinity', '1 000', '1e999'])
      expect(() => parseNumber(x)).toThrow();
  });
  it('PSD ayırıcı seçimini uygular ve satır/sütun hatası verir', () => {
    expect(parsePSD('5;0,01\n10;0,02')[0].density_g2_hz).toBe(0.01);
    expect(parsePSD('5,0.01\n10,0.02', 'comma')[1].frequency_hz).toBe(10);
    expect(() => parsePSD('5,0,01\n10,0,02', 'comma')).toThrow('Satır 1');
    expect(() => parsePSD('5;0.01\n4;0.02')).toThrow('Satır 2, sütun 1');
  });
});
