import { useState } from 'react';
import type { Project } from '../lib/types';
import { parsePSD } from '../lib/numbers';
import { Numeric, Toggle, Select, VectorFields } from './Fields';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
export function LoadsPanel({
  project: p,
  onChange,
}: {
  project: Project;
  onChange: (p: Project) => void;
}) {
  const [text, setText] = useState('5;0,01\n20;0,04\n200;0,04\n500;0,01');
  const [delimiter, setDelimiter] = useState<'semicolon' | 'whitespace' | 'comma'>('semicolon');
  const [error, setError] = useState('');
  const limits = (patch: Partial<Project['limits']>) =>
    onChange({ ...p, limits: { ...p.limits, ...patch } });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">03 / UYARIM VE SINIRLAR</span>
          <h1>Yükler ve isterler</h1>
          <p>Her analiz aynı sistem ve ortak taban tahrik yönünü kullanır.</p>
        </div>
      </div>
      <div className="direction-bar">
        <div>
          <h2>Ortak tahrik yönü</h2>
          <p>Normalize edilir · global X / Y / Z</p>
        </div>
        <Select
          label="Dinamik taban yönü"
          value={
            ['1,0,0', '0,1,0', '0,0,1'].includes(p.direction.join(','))
              ? p.direction.join(',')
              : 'custom'
          }
          onValue={(v) => {
            if (v === 'custom') onChange({ ...p, direction: [0.1, 0, 1] });
            else onChange({ ...p, direction: v.split(',').map(Number) });
          }}
        >
          <option value="1,0,0">X yönü</option>
          <option value="0,1,0">Y yönü</option>
          <option value="0,0,1">Z yönü</option>
          <option value="custom">Özel vektör</option>
        </Select>
        <VectorFields
          label="Tahrik"
          unit="oran"
          value={p.direction}
          onValue={(v) => onChange({ ...p, direction: v })}
        />
      </div>
      <div className="form-sheet">
        <Tabs defaultValue="harmonic" className="loads-tabs">
          <TabsList>
            <TabsTrigger value="harmonic">Harmonik</TabsTrigger>
            <TabsTrigger value="psd">Rastlantısal / PSD</TabsTrigger>
            <TabsTrigger value="shock">Şok</TabsTrigger>
          </TabsList>
          <TabsContent forceMount value="harmonic">
            <section>
              <div className="section-title">
                <h2>Sinüzoidal taban ivmesi</h2>
                <Toggle
                  label="Harmonik analizi hesapla"
                  checked={p.harmonic.enabled}
                  onValue={(v) => onChange({ ...p, harmonic: { ...p.harmonic, enabled: v } })}
                />
              </div>
              <div className="field-grid two">
                <Numeric
                  label="Tahrik frekansı"
                  unit="Hz"
                  min={0.01}
                  max={100000}
                  value={p.harmonic.frequency_hz}
                  onValue={(v) => onChange({ ...p, harmonic: { ...p.harmonic, frequency_hz: v } })}
                />
                <Numeric
                  label="Taban ivmesi"
                  unit="g tepe"
                  min={0}
                  max={10000}
                  value={p.harmonic.amplitude_g}
                  onValue={(v) => onChange({ ...p, harmonic: { ...p.harmonic, amplitude_g: v } })}
                />
                <Numeric
                  label="Çıkış ivmesi sınırı"
                  unit="g tepe · X/Y/Z"
                  min={0.001}
                  value={p.limits.harmonic_acceleration_g}
                  onValue={(v) => limits({ harmonic_acceleration_g: v })}
                />
                <Numeric
                  label="Yönsel geçirgenlik sınırı"
                  unit="T"
                  min={0.0001}
                  value={p.limits.harmonic_transmissibility}
                  onValue={(v) => limits({ harmonic_transmissibility: v })}
                />
              </div>
              <p className="hint">
                T, ortak tahrik yönündeki mutlak çıkış ivmesinin giriş ivmesine oranıdır. Kompleks
                faz korunur.
              </p>
            </section>
          </TabsContent>
          <TabsContent forceMount value="psd">
            <section>
              <div className="section-title">
                <h2>Tek doğrultulu ortak taban PSD’si</h2>
                <Toggle
                  label="PSD analizini hesapla"
                  checked={p.random.enabled}
                  onValue={(v) => onChange({ ...p, random: { ...p.random, enabled: v } })}
                />
              </div>
              <div className="psd-layout">
                <div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Frekans · Hz</th>
                          <th>PSD · g²/Hz</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.random.points.map((row, i) => (
                          <tr key={i}>
                            <td>
                              <Numeric
                                compact
                                label={`PSD satır ${i + 1} frekans`}
                                unit="Hz"
                                min={0.000001}
                                value={row.frequency_hz}
                                onValue={(v) =>
                                  onChange({
                                    ...p,
                                    random: {
                                      ...p.random,
                                      points: p.random.points.map((r, j) =>
                                        j === i ? { ...r, frequency_hz: v } : r,
                                      ),
                                    },
                                  })
                                }
                              />
                            </td>
                            <td>
                              <Numeric
                                compact
                                label={`PSD satır ${i + 1} yoğunluk`}
                                unit="g²/Hz"
                                min={1e-12}
                                value={row.density_g2_hz}
                                onValue={(v) =>
                                  onChange({
                                    ...p,
                                    random: {
                                      ...p.random,
                                      points: p.random.points.map((r, j) =>
                                        j === i ? { ...r, density_g2_hz: v } : r,
                                      ),
                                    },
                                  })
                                }
                              />
                            </td>
                            <td>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={p.random.points.length <= 2}
                                aria-label={`PSD satır ${i + 1} sil`}
                                onClick={() =>
                                  onChange({
                                    ...p,
                                    random: {
                                      ...p.random,
                                      points: p.random.points.filter((_, j) => j !== i),
                                    },
                                  })
                                }
                              >
                                ×
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...p,
                        random: {
                          ...p.random,
                          points: [
                            ...p.random.points,
                            {
                              frequency_hz: p.random.points.at(-1)!.frequency_hz * 2,
                              density_g2_hz: 0.01,
                            },
                          ],
                        },
                      })
                    }
                  >
                    + Satır ekle
                  </Button>
                </div>
                <div>
                  <label className="field">
                    <span>PSD metnini yapıştırın</span>
                    <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
                  </label>
                  <Select
                    label="Sütun ayırıcı"
                    value={delimiter}
                    onValue={(v) => setDelimiter(v as typeof delimiter)}
                  >
                    <option value="semicolon">Noktalı virgül ; · ondalık , veya .</option>
                    <option value="whitespace">Boşluk / sekme · ondalık , veya .</option>
                    <option value="comma">Virgül , · yalnız ondalık nokta</option>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      try {
                        const points = parsePSD(text, delimiter);
                        onChange({ ...p, random: { ...p.random, points } });
                        setError('');
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Tabloya aktar
                  </Button>
                  {error && (
                    <p role="alert" className="field-error">
                      {error}
                    </p>
                  )}
                </div>
              </div>
              <div className="field-grid two">
                <Numeric
                  label="Çıkış ivmesi sınırı"
                  unit="g RMS · X/Y/Z"
                  min={0.001}
                  value={p.limits.psd_acceleration_g_rms}
                  onValue={(v) => limits({ psd_acceleration_g_rms: v })}
                />
                <Numeric
                  label="Hareket çarpanı"
                  unit="σ × RMS"
                  min={1}
                  max={6}
                  value={p.random.sigma}
                  onValue={(v) => onChange({ ...p, random: { ...p.random, sigma: v } })}
                />
              </div>
              <p className="notice">
                σ × RMS bir istatistiksel tahmindir; mutlak maksimum garantisi değildir. PSD bant
                dışında sıfır, noktalar arasında log-log enterpolasyon kullanır.
              </p>
            </section>
          </TabsContent>
          <TabsContent forceMount value="shock">
            <section>
              <div className="section-title">
                <h2>Klasik darbe ve kompanzasyon</h2>
                <Toggle
                  label="Şok analizini hesapla"
                  checked={p.shock.enabled}
                  onValue={(v) => onChange({ ...p, shock: { ...p.shock, enabled: v } })}
                />
              </div>
              <div className="field-grid two">
                <Select
                  label="Darbe şekli"
                  value={p.shock.shape}
                  onValue={(v) =>
                    onChange({ ...p, shock: { ...p.shock, shape: v as Project['shock']['shape'] } })
                  }
                >
                  <option value="half">Yarım sinüs</option>
                  <option value="saw">Terminal tepe testere dişi</option>
                  <option value="triangle">Simetrik üçgen</option>
                </Select>
                <Select
                  label="Ortak ön / son kompanzasyon"
                  value={String(p.shock.compensation_percent)}
                  onValue={(v) =>
                    onChange({
                      ...p,
                      shock: {
                        ...p.shock,
                        compensation_percent: Number(v) as Project['shock']['compensation_percent'],
                      },
                    })
                  }
                >
                  {[0, 5, 10, 15, 20].map((v) => (
                    <option key={v} value={v}>
                      %{v}
                      {v === 0 ? ' · saf darbe' : ''}
                    </option>
                  ))}
                </Select>
                <Numeric
                  label="Şok genliği"
                  unit="g tepe"
                  min={0}
                  max={100000}
                  value={p.shock.amplitude_g}
                  onValue={(v) => onChange({ ...p, shock: { ...p.shock, amplitude_g: v } })}
                />
                <Numeric
                  label="Ana darbe süresi"
                  unit="ms"
                  min={0.01}
                  max={10000}
                  value={p.shock.duration_ms}
                  onValue={(v) => onChange({ ...p, shock: { ...p.shock, duration_ms: v } })}
                />
                <Numeric
                  label="Çıkış ivmesi sınırı"
                  unit="g tepe · X/Y/Z"
                  min={0.001}
                  value={p.limits.shock_acceleration_g}
                  onValue={(v) => limits({ shock_acceleration_g: v })}
                />
              </div>
              <p className="hint">
                Pozitif kompanzasyonda ters yarım sinüs loblarının süreleri sıfır son hız ve konum
                için çözülür. Saf darbe aynı modelle bağımsız hesaplanır.
              </p>
              <details>
                <summary>Şok modelinin ve standart ön kontrolünün kapsamı</summary>
                <p>
                  SOCITEC F/d verisi 0°, 45°, 90° için ±0,5° eşleşmede uygulanır. Ara açıda
                  gerekçesi gösterilen doğrusal model kullanılır. Statik ön yük toplam izdüşümün
                  basma/çekme dalını belirler. F/d sekant tahmini tam histerezis modeli değildir.
                </p>
                <p>
                  MIL-STD hız penceresi ön kontrolü, SRS veya tam tolerans zarfı doğrulaması
                  değildir. Simetrik üçgen mühendislik seçeneğidir.
                </p>
                <a
                  href="https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=35978"
                  target="_blank"
                  rel="noreferrer"
                >
                  DLA resmî standart kaydı ↗
                </a>
              </details>
            </section>
          </TabsContent>
        </Tabs>
        <section>
          <div className="section-title">
            <h2>Ortak yerel hareket sınırı</h2>
            <span>Her izolatör · yerel 1 / 2 / 3</span>
          </div>
          <div className="field-grid two">
            <Numeric
              label="İzin verilen bağıl hareket"
              unit="±mm"
              min={0.001}
              value={p.limits.local_motion_mm}
              onValue={(v) => limits({ local_motion_mm: v })}
            />
            <p className="hint">
              Harmonik tepe, PSD için σ × RMS ve şokta tüm zamanın tepe hareketi bu sınıra göre ayrı
              değerlendirilir.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
