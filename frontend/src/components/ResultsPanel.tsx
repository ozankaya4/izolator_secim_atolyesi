import { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, ArrowRight, Download, Clock3, Activity } from 'lucide-react';
import type { Check, Result, Response } from '../lib/types';
import { format, statusLabels } from '../lib/types';
import { csv } from '../lib/storage';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Chart, baseChart } from './Chart';
const groupNames = {
  static: 'Katalog / statik yük',
  harmonic: 'Harmonik',
  psd: 'Rastlantısal / PSD',
  shock: 'Şok',
};
export function combined(checks: Check[]): Check['status'] {
  for (const status of ['failed', 'exceeded', 'verify', 'not_run'] as const)
    if (checks.some((c) => c.status === status)) return status;
  return checks.length ? 'within' : 'not_run';
}
export function Status({ status }: { status: Check['status'] }) {
  const Icon = status === 'within' ? CheckCircle2 : status === 'not_run' ? Clock3 : AlertTriangle;
  return (
    <span className={'status status-' + status}>
      <Icon size={14} />
      {statusLabels[status]}
    </span>
  );
}
export function CheckTable({ checks }: { checks: Check[] }) {
  return (
    <div className="table-scroll">
      <table className="check-table">
        <thead>
          <tr>
            <th>Kontrol / nokta</th>
            <th>Durum</th>
            <th>Ölçülen</th>
            <th>Limit</th>
            <th>Açıklama</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} id={c.id}>
              <td>
                <strong>{c.title}</strong>
                <small>{[c.mount_id, c.axis].filter(Boolean).join(' · ')}</small>
              </td>
              <td>
                <Status status={c.status} />
              </td>
              <td>
                {format(c.measured)} {c.measured == null ? '' : c.unit}
              </td>
              <td>
                {format(c.limit)} {c.limit == null ? '' : c.unit}
              </td>
              <td>{c.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ResponseTable({
  response: r,
  result,
  unit,
}: {
  response: Response;
  result: Result;
  unit: string;
}) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Nokta</th>
            {['X', 'Y', 'Z'].map((a) => (
              <th key={a}>
                {a} · {unit}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['CG', r.cg_g],
            ['Bağlantı', r.connection_g],
            ...(r.sensor_g ? [['Sensör', r.sensor_g]] : []),
          ].map(([name, values]) => (
            <tr key={name as string}>
              <td>{name as string}</td>
              {(values as number[]).map((v, i) => (
                <td key={i}>{format(v, 5)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>İzolatörlerin yerel bağıl hareketi</h3>
      <table>
        <thead>
          <tr>
            <th>İzolatör</th>
            {[1, 2, 3].map((a) => (
              <th key={a}>
                Yerel {a} · {unit.includes('RMS') ? 'mm RMS' : 'mm tepe'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.local_mm.map((row, i) => (
            <tr key={i}>
              <td>{result.snapshot.mounts[i].id}</td>
              {row.map((v, j) => (
                <td key={j}>{format(v, 5)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
export function HarmonicChart({ result: r, print = false }: { result: Result; print?: boolean }) {
  const [log, setLog] = useState(true);
  const [cursor, setCursor] = useState(0);
  const h = r.harmonic;
  const option = useMemo(
    () =>
      h
        ? {
            ...baseChart,
            xAxis: {
              ...(baseChart.xAxis as object),
              type: log ? 'log' : 'value',
              name: 'Frekans · Hz',
            },
            yAxis: {
              ...(baseChart.yAxis as object),
              type: log ? 'log' : 'value',
              name: 'Geçirgenlik · T',
            },
            series: [
              {
                name: 'Bağlantı',
                type: 'line',
                showSymbol: false,
                data: h.spectrum.map((row) => [row[0], Math.max(row[1], 1e-12)]),
                markLine: {
                  symbol: 'none',
                  silent: true,
                  label: { fontSize: 9 },
                  data: [
                    { yAxis: 1, name: 'T = 1', label: { formatter: 'T = 1' } },
                    ...r.modes.map((m) => ({
                      xAxis: m.frequency_hz,
                      label: { show: false },
                      lineStyle: { color: '#c5d0cc', type: 'dashed' },
                    })),
                  ],
                },
                markPoint: {
                  symbolSize: 32,
                  label: {
                    formatter: (params: { value: unknown }) => format(Number(params.value), 2),
                    fontSize: 9,
                  },
                  data: [{ type: 'max', name: 'Tepe' }],
                },
              },
              ...(h.sensor_transmissibility != null
                ? [
                    {
                      name: 'Sensör',
                      type: 'line',
                      showSymbol: false,
                      data: h.spectrum.map((row) => [row[0], Math.max(row[2], 1e-12)]),
                    },
                  ]
                : []),
            ],
            dataZoom: print ? [] : [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }],
          }
        : {},
    [h, log, print, r.modes],
  );
  if (!h) return null;
  const row = h.spectrum[Math.min(cursor, h.spectrum.length - 1)];
  return (
    <>
      <div className="chart-title">
        <h3>Yönsel geçirgenlik</h3>
        {!print && (
          <div className="segmented">
            <button className={log ? 'active' : ''} onClick={() => setLog(true)}>
              Log–log
            </button>
            <button className={!log ? 'active' : ''} onClick={() => setLog(false)}>
              Lineer
            </button>
          </div>
        )}
      </div>
      <Chart label="Bağlantı ve sensör yönsel geçirgenlik frekans grafiği" option={option} />
      {!print && (
        <div className="frequency-cursor">
          <label htmlFor="frequency-cursor">Frekans imleci</label>
          <input
            id="frequency-cursor"
            type="range"
            min={0}
            max={h.spectrum.length - 1}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
          />
          <output>
            {format(row[0])} Hz · Bağlantı T {format(row[1])}
            {row[2] != null ? ' · Sensör T ' + format(row[2]) : ''}
          </output>
        </div>
      )}
    </>
  );
}
export function PSDChart({ result: r }: { result: Result }) {
  if (!r.psd) return null;
  return (
    <Chart
      label="Giriş ve çıkış ivme PSD grafiği"
      option={{
        ...baseChart,
        xAxis: { ...(baseChart.xAxis as object), type: 'log', name: 'Frekans · Hz' },
        yAxis: { ...(baseChart.yAxis as object), type: 'log', name: 'İvme PSD · g²/Hz' },
        series: [
          {
            type: 'line',
            name: 'Giriş',
            showSymbol: false,
            data: r.psd.spectrum.map((row) => [row[0], row[1]]),
          },
          {
            type: 'line',
            name: 'Bağlantı · X/Y/Z toplamı',
            showSymbol: false,
            data: r.psd.spectrum.map((row) => [row[0], Math.max(1e-14, row[2])]),
          },
          ...(r.psd.response.sensor_g
            ? [
                {
                  type: 'line',
                  name: 'Sensör · X/Y/Z toplamı',
                  showSymbol: false,
                  data: r.psd.spectrum.map((row) => [row[0], Math.max(1e-14, row[3])]),
                },
              ]
            : []),
        ],
      }}
    />
  );
}
export function ShockCharts({ result: r, print = false }: { result: Result; print?: boolean }) {
  const [full, setFull] = useState(print);
  const [version, setVersion] = useState(0);
  const shock = r.shock;
  if (!shock) return null;
  const s = shock.compensated;
  const group = 'shock-' + r.snapshot_id + (print ? '-print' : '');
  function option(channel: 1 | 2 | 4) {
    const series = [
      {
        name: channel === 1 ? 'Giriş' : channel === 2 ? 'Bağlantı' : 'Bağlantı bağıl hareket',
        type: 'line',
        showSymbol: false,
        data: s.samples.map((row) => [row[0], row[channel]]),
      },
      ...(channel !== 1 && s.response.sensor_g
        ? [
            {
              name: 'Sensör',
              type: 'line',
              showSymbol: false,
              data: s.samples.map((row) => [row[0], row[channel + 1]]),
            },
          ]
        : []),
      ...(shock!.pure
        ? [
            {
              name: 'Saf darbe referansı',
              type: 'line',
              showSymbol: false,
              lineStyle: { type: 'dashed' },
              data: shock!.pure.samples.map((row) => [row[0], row[channel]]),
            },
          ]
        : []),
    ];
    return {
      ...baseChart,
      xAxis: { ...(baseChart.xAxis as object), name: 'Ana darbe başlangıcına göre zaman · ms' },
      yAxis: {
        ...(baseChart.yAxis as object),
        name: channel === 4 ? 'Bağıl deplasman · mm' : 'İvme · g',
      },
      series,
      dataZoom: print
        ? []
        : [
            {
              type: 'inside',
              startValue: full
                ? undefined
                : -Math.max(s.main_start_ms, 2.5 * r.snapshot.shock.duration_ms),
              endValue: full
                ? undefined
                : Math.max(r.snapshot.shock.duration_ms * 12, s.main_start_ms * 2),
              start: full ? 0 : undefined,
              end: full ? 100 : undefined,
            },
            { type: 'slider', height: 16, bottom: 8 },
          ],
    };
  }
  return (
    <>
      <div className="chart-title">
        <h3>Senkron zaman kayıtları</h3>
        {!print && (
          <div className="tool-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFull(true);
                setVersion((v) => v + 1);
              }}
            >
              Tam kayıt / sıfırla
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFull(false);
                setVersion((v) => v + 1);
              }}
            >
              Darbe çevresi
            </Button>
          </div>
        )}
      </div>
      <p className="hint">
        Tüm kaydın sonu {format(s.end_ms)} ms. Tepe kartları her zaman tüm çözümü kapsar. Düz:
        seçili kompanzasyon; kesikli: bağımsız saf darbe.
      </p>
      {([1, 2, 4] as const).map((channel, i) => (
        <div className="shock-chart" key={channel + '-' + version}>
          <h3>{['Giriş ivmesi', 'Mutlak çıkış ivmesi', 'Bağıl deplasman'][i]}</h3>
          <Chart
            group={group}
            full={full}
            label={['Şok giriş ivmesi', 'Şok çıkış ivmesi', 'Şok bağıl deplasman'][i]}
            option={option(channel)}
          />
        </div>
      ))}
    </>
  );
}
export function ResultsPanel({ result: r, stale }: { result: Result | null; stale: boolean }) {
  const [tab, setTab] = useState('modal');
  const [allIssues, setAllIssues] = useState(false);
  if (!r)
    return (
      <div className="empty-state results-empty">
        <Activity size={40} strokeWidth={1} />
        <h1>Modeliniz hesaplamaya hazır</h1>
        <p>
          Sistem, yerleşim ve yükleri düzenledikten sonra Hesapla’ya basın.
          <br />
          Karar özeti ve analiz ayrıntıları burada görünecek.
        </p>
      </div>
    );
  const groups = Object.keys(groupNames) as (keyof typeof groupNames)[];
  const violations = r.checks.filter((c) => c.status === 'exceeded' || c.status === 'failed');
  const issues = r.checks.filter((c) => c.status === 'verify');
  const verificationGroups = [
    ...new Set(issues.map((c) => c.group + '|' + c.title + '|' + c.detail)),
  ].map((key) => {
    const matches = issues.filter((c) => c.group + '|' + c.title + '|' + c.detail === key);
    return {
      check: matches[0],
      mounts: matches
        .map((c) => c.mount_id)
        .filter(Boolean)
        .join(', '),
    };
  });
  function go(c: Check) {
    setTab(c.group === 'static' ? 'modal' : c.group);
    setTimeout(
      () => document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      100,
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">04 / KARAR VE ANALİZ</span>
          <h1>Sonuçlar</h1>
          <p>
            {r.snapshot.name} · {new Date(r.created_at).toLocaleString('tr-TR')} ·{' '}
            {format(r.duration_seconds, 2)} sn
          </p>
        </div>
        <Status status={r.overall} />
      </div>
      {stale && (
        <div className="stale-banner" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>Güncel değil</strong>
            <p>
              Girdiler değişti. Bu sonuçlar {r.snapshot_id.slice(0, 8)} snapshot’ına aittir. Güncel
              taslak için yeniden hesaplayın.
            </p>
          </div>
        </div>
      )}
      <div className="decision-grid">
        {groups.map((group) => {
          const checks = r.checks.filter((c) => c.group === group);
          return (
            <button
              key={group}
              className="decision-item"
              onClick={() => setTab(group === 'static' ? 'modal' : group)}
            >
              <span>{groupNames[group]}</span>
              <Status status={combined(checks)} />
              <small>
                {checks.filter((c) => c.status === 'exceeded').length} sınır aşımı ·{' '}
                {checks.filter((c) => c.status === 'verify').length} doğrulama
              </small>
              <ArrowRight size={16} />
            </button>
          );
        })}
      </div>
      <div className="decision-notes">
        <h2>
          {violations.length ? `${violations.length} kontrol için işlem gerekiyor` : 'Karar özeti'}
        </h2>
        {violations.slice(0, allIssues ? undefined : 8).map((c) => (
          <button className="violation" key={c.id} onClick={() => go(c)}>
            <AlertTriangle size={16} />
            <span>
              <strong>{c.title}</strong> · {[c.mount_id, c.axis].filter(Boolean).join(' / ')}
              {c.measured != null
                ? ` · ${format(c.measured)} ${c.unit} > ${format(c.limit)} ${c.unit}`
                : ''}
              {c.status === 'failed' ? ' · ' + c.detail : ''}
            </span>
            <ArrowRight size={14} />
          </button>
        ))}
        {violations.length > 8 && (
          <Button variant="ghost" size="sm" onClick={() => setAllIssues(!allIssues)}>
            {allIssues ? 'Daha az göster' : `Tüm ${violations.length} ihlali göster`}
          </Button>
        )}
        {issues.length > 0 && (
          <p className="notice">
            {issues.length} kontrol için doğrulama gerekli. Bilinmeyen veya başarısız kontroller
            genel olumlu karara dönüştürülmez.
          </p>
        )}
        {verificationGroups.map(({ check: c, mounts }) => (
          <button key={c.id} className="verification-note" onClick={() => go(c)}>
            <AlertTriangle size={15} />
            <span>
              <strong>
                {c.title}
                {mounts ? ' · ' + mounts : ''}
              </strong>
              <small>{c.detail}</small>
            </span>
            <ArrowRight size={14} />
          </button>
        ))}
      </div>
      <div className="form-sheet results-details">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="modal">Modal / statik</TabsTrigger>
            <TabsTrigger value="harmonic">Harmonik</TabsTrigger>
            <TabsTrigger value="psd">PSD</TabsTrigger>
            <TabsTrigger value="shock">Şok</TabsTrigger>
          </TabsList>
          <TabsContent value="modal">
            <section>
              <div className="section-title">
                <h2>
                  {r.snapshot.structure.kind === 'flexible'
                    ? 'Bağlı sistem · 7 mod'
                    : 'Rijit sistem · 6 mod'}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    csv(
                      'modal.csv',
                      ['Mod', 'Hz', 'Sönüm oranı', 'Etkin kütle %'],
                      r.modes.map((m, i) => [
                        i + 1,
                        m.frequency_hz,
                        m.damping,
                        m.participation_percent,
                      ]),
                    )
                  }
                >
                  <Download size={14} />
                  CSV
                </Button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Mod</th>
                    <th>Frekans · Hz</th>
                    <th>Tanısal modal ζ</th>
                    <th>Tahrik etkin kütle · %</th>
                  </tr>
                </thead>
                <tbody>
                  {r.modes.map((m, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{format(m.frequency_hz, 5)}</td>
                      <td>{format(m.damping, 5)}</td>
                      <td>{format(m.participation_percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                Esnek çözümde tam sönüm matrisi korunur. Tablodaki ζ tanısaldır; yedi moda ortak
                sönüm atanmaz.
              </p>
              <h3>Statik CG hareketi</h3>
              <p>
                {r.static.cg_displacement_mm.map((v) => format(v, 5)).join(' / ')} mm ·{' '}
                {r.static.cg_rotation_mrad.map((v) => format(v, 5)).join(' / ')} mrad
              </p>
              <div className="section-title">
                <h3>Statik destek reaksiyonları</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    csv(
                      'statik.csv',
                      ['İzolatör', 'u1 mm', 'u2 mm', 'u3 mm', 'F1 N', 'F2 N', 'F3 N'],
                      r.static.mounts.map((m) => [
                        m.mount_id,
                        ...m.local_displacement_mm,
                        ...m.reaction_n,
                      ]),
                    )
                  }
                >
                  CSV
                </Button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>İzolatör</th>
                    <th>Yerel 1 · N</th>
                    <th>Yerel 2 · N</th>
                    <th>Yerel 3 · N</th>
                  </tr>
                </thead>
                <tbody>
                  {r.static.mounts.map((m) => (
                    <tr key={m.mount_id}>
                      <td>{m.mount_id}</td>
                      {m.reaction_n.map((v, i) => (
                        <td key={i}>{format(v, 4)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                Pozitif yerel F3 basma destek reaksiyonudur; üretici montaj yönüyle doğrulayın.
              </p>
            </section>
            <CheckTable checks={r.checks.filter((c) => c.group === 'static')} />
          </TabsContent>
          <TabsContent value="harmonic">
            {r.harmonic ? (
              <section>
                <div className="section-title">
                  <h2>{format(r.snapshot.harmonic.frequency_hz)} Hz harmonik cevap</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      csv(
                        'harmonik.csv',
                        [
                          'Hz',
                          'Bağlantı T',
                          ...(r.harmonic!.sensor_transmissibility != null ? ['Sensör T'] : []),
                        ],
                        r.harmonic!.spectrum,
                      )
                    }
                  >
                    Grafik CSV
                  </Button>
                </div>
                <HarmonicChart result={r} />
                <ResponseTable response={r.harmonic.response} result={r} unit="g tepe" />
                <p className="hint">
                  Bağlantı kompleks fazı X/Y/Z:{' '}
                  {r.harmonic.phase_deg.map((x) => format(x)).join(' / ')}°
                </p>
              </section>
            ) : (
              <p className="notice">Harmonik sonuç üretilmedi.</p>
            )}
            <CheckTable checks={r.checks.filter((c) => c.group === 'harmonic')} />
          </TabsContent>
          <TabsContent value="psd">
            {r.psd ? (
              <section>
                <div className="section-title">
                  <h2>Rastlantısal titreşim</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      csv(
                        'psd.csv',
                        [
                          'Hz',
                          'Giriş g²/Hz',
                          'Bağlantı XYZ g²/Hz',
                          ...(r.psd!.response.sensor_g ? ['Sensör XYZ g²/Hz'] : []),
                        ],
                        r.psd!.spectrum,
                      )
                    }
                  >
                    Grafik CSV
                  </Button>
                </div>
                <p>
                  Giriş: <strong>{format(r.psd.input_g_rms)} g RMS</strong> ·{' '}
                  {r.psd.integration_points} entegrasyon noktası
                </p>
                <PSDChart result={r} />
                <ResponseTable response={r.psd.response} result={r} unit="g RMS" />
                <p className="notice">
                  Hareket tablosu RMS’tir. İster kontrolünde {format(r.psd.sigma)}σ × RMS
                  kullanılır; mutlak maksimum garantisi değildir.
                </p>
              </section>
            ) : (
              <p className="notice">PSD sonucu üretilmedi.</p>
            )}
            <CheckTable checks={r.checks.filter((c) => c.group === 'psd')} />
          </TabsContent>
          <TabsContent value="shock">
            {r.shock ? (
              <section>
                <div className="section-title">
                  <h2>Tüm çözüm süresinin şok tepeleri</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      csv(
                        'sok.csv',
                        [
                          'Zaman ms',
                          'Giriş g',
                          'Bağlantı g',
                          'Sensör g (rijitte özdeş)',
                          'Bağlantı mm',
                          'Sensör mm (rijitte özdeş)',
                        ],
                        r.shock!.compensated.samples,
                      );
                      if (r.shock!.pure)
                        csv(
                          'sok-saf-referans.csv',
                          [
                            'Zaman ms',
                            'Giriş g',
                            'Bağlantı g',
                            'Sensör g',
                            'Bağlantı mm',
                            'Sensör mm',
                          ],
                          r.shock!.pure.samples,
                        );
                    }}
                  >
                    Zaman kaydı CSV
                  </Button>
                </div>
                <div className="peak-cards">
                  <div>
                    <span>Bağlantı · max |X/Y/Z|</span>
                    <strong>
                      {format(Math.max(...r.shock.compensated.response.connection_g))}{' '}
                      <small>g tepe</small>
                    </strong>
                  </div>
                  <div>
                    <span>En büyük yerel bağıl hareket</span>
                    <strong>
                      {format(Math.max(...r.shock.compensated.response.local_mm.flat()))}{' '}
                      <small>mm</small>
                    </strong>
                  </div>
                  {r.shock.pure && (
                    <div>
                      <span>Saf darbe · bağlantı tepesi</span>
                      <strong>
                        {format(Math.max(...r.shock.pure.response.connection_g))} <small>g</small>
                      </strong>
                    </div>
                  )}
                </div>
                <ShockCharts result={r} />
                <ResponseTable response={r.shock.compensated.response} result={r} unit="g tepe" />
                <h3>Şok katılığı ve toplam deformasyon</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>İzolatör</th>
                        <th>Yerel açı</th>
                        <th>k− / k+ · N/mm</th>
                        <th>Ön yük · mm 1/2/3</th>
                        <th>Toplam izdüşüm min/max · mm</th>
                        <th>Model gerekçesi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.shock.compensated.mounts.map((m) => (
                        <tr key={m.mount_id}>
                          <td>{m.mount_id}</td>
                          <td>{format(m.angle_deg, 2)}°</td>
                          <td>
                            {format(m.compression_n_mm)} / {format(m.tension_n_mm)}
                          </td>
                          <td>{m.preload_mm.map((v) => format(v)).join(' / ')}</td>
                          <td>
                            {format(m.projection_min_mm)} / {format(m.projection_max_mm)}
                          </td>
                          <td>{m.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="notice">{r.shock.scope}</p>
                <p>
                  Hız penceresi: {format(r.shock.velocity_window_m_s, 6)} m/s · nominal{' '}
                  {format(r.shock.nominal_velocity_m_s, 6)} m/s · oran{' '}
                  {format(r.shock.velocity_ratio == null ? null : r.shock.velocity_ratio * 100)}%
                </p>
                <p className="hint">
                  Profil son hızı {format(r.shock.compensated.net_velocity_m_s, 10)} m/s · son
                  konumu {format(r.shock.compensated.final_displacement_m, 10)} m.
                </p>
              </section>
            ) : (
              <p className="notice">Şok sonucu üretilmedi.</p>
            )}
            <CheckTable checks={r.checks.filter((c) => c.group === 'shock')} />
          </TabsContent>
        </Tabs>
      </div>
      <details>
        <summary>Model kabulleri, uyarılar ve tanılama</summary>
        {r.warnings.map((w, i) => (
          <p className="notice" key={i}>
            {w}
          </p>
        ))}
        {r.assumptions.map((a, i) => (
          <p key={i}>{a}</p>
        ))}
        <p>
          Çözücü {r.solver_version} · koşul sayısı {format(r.condition_number)} · rtol{' '}
          {r.snapshot.numerics.rtol} · atol {r.snapshot.numerics.atol}
        </p>
        <p className="hash">Snapshot SHA-256: {r.snapshot_id}</p>
        {r.shock && (
          <p>
            DOP853 · {r.shock.compensated.accepted_steps} kabul edilen adım ·{' '}
            {r.shock.compensated.peak_evaluations} yoğun tepe değerlendirmesi.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            csv(
              'kontroller.csv',
              [
                'Grup',
                'Kontrol',
                'Durum',
                'İzolatör',
                'Eksen',
                'Ölçülen',
                'Limit',
                'Birim',
                'Açıklama',
              ],
              r.checks.map((c) => [
                c.group,
                c.title,
                statusLabels[c.status],
                c.mount_id ?? '',
                c.axis ?? '',
                c.measured ?? '',
                c.limit ?? '',
                c.unit,
                c.detail,
              ]),
            )
          }
        >
          Kontrolleri CSV aktar
        </Button>
      </details>
    </>
  );
}
