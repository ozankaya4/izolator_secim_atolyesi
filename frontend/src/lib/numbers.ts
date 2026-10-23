export function parseNumber(text: string): number {
  const s = text.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(s))
    throw new Error('Geçerli sayı girin; ondalık virgül veya nokta kullanabilirsiniz.');
  const value = Number(s.replace(',', '.'));
  if (!Number.isFinite(value)) throw new Error('Sonlu sayı girin.');
  return value;
}
export function parsePSD(
  text: string,
  delimiter: 'semicolon' | 'whitespace' | 'comma' = 'semicolon',
): { frequency_hz: number; density_g2_hz: number }[] {
  const rows = text
    .split(/\r?\n/)
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.trim());
  if (rows.length < 2) throw new Error('En az iki veri satırı girin.');
  return rows.reduce<{ frequency_hz: number; density_g2_hz: number }[]>((out, { row, index }) => {
    const cells =
      delimiter === 'semicolon'
        ? row.split(';')
        : delimiter === 'comma'
          ? row.split(',')
          : row.trim().split(/\s+/);
    if (cells.length !== 2)
      throw new Error(`Satır ${index + 1}: iki sütun gerekli. Seçili ayırıcıyı kontrol edin.`);
    const values = cells.map((cell, col) => {
      try {
        if (delimiter === 'comma' && cell.includes(';')) throw new Error();
        const v = parseNumber(cell);
        if (v <= 0) throw new Error();
        return v;
      } catch {
        throw new Error(`Satır ${index + 1}, sütun ${col + 1}: pozitif sayı gerekli.`);
      }
    });
    if (out.length && values[0] <= out[out.length - 1].frequency_hz)
      throw new Error(`Satır ${index + 1}, sütun 1: frekans önceki satırdan büyük olmalı.`);
    out.push({ frequency_hz: values[0], density_g2_hz: values[1] });
    return out;
  }, []);
}
