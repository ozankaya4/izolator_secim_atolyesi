import { describe, expect, it } from 'vitest';
import { csvContent } from './storage';
import { parseScenarios } from './scenarios';
describe('Güvenli aktarım ve yerel kayıtlar', () => {
  it('metin formüllerini etkisizleştirir, gerçek sayıları ve CSV hücre sınırlarını korur', () => {
    const content = csvContent(
      ['Başlık'],
      [
        ['=HYPERLINK("https://example.com")'],
        ['  +1'],
        ['＝1+2'],
        [-10],
        ['normal;"metin"\nyeni satır'],
      ],
    );
    expect(content).toContain('"\t=HYPERLINK(""https://example.com"")"');
    expect(content).toContain('"\t  +1"');
    expect(content).toContain('"\t＝1+2"');
    expect(content).toContain('"-10"');
    expect(content).toContain('"normal;""metin""\nyeni satır"');
  });
  it('bozuk yerel karşılaştırma kaydı arayüze aktarılmaz', () => {
    expect(parseScenarios([{ id: 'bad', metrics: null }, null, '<script>'])).toEqual([]);
    expect(parseScenarios({})).toEqual([]);
  });
});
