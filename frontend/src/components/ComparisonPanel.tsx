import { useEffect, useState } from 'react';
import { ArrowRight, Download, GitCompareArrows, X } from 'lucide-react';
import type { Scenario } from '../lib/scenarios';
import { groupNames, metricDefinitions, type Metrics } from '../lib/insights';
import { format } from '../lib/types';
import { csv } from '../lib/storage';
import { Status } from './ResultsPanel';
import { Button } from './ui/button';

function ScenarioName({
  scenario,
  onRename,
}: {
  scenario: Scenario;
  onRename: (id: string, label: string) => void;
}) {
  const [label, setLabel] = useState(scenario.label);
  useEffect(() => setLabel(scenario.label), [scenario.label]);
  return (
    <input
      aria-label={'Senaryo adı ' + scenario.label}
      maxLength={120}
      value={label}
      onChange={(e) => setLabel(e.target.value)}
      onBlur={() => {
        const next = label.trim();
        if (next && next !== scenario.label) onRename(scenario.id, next);
        else setLabel(scenario.label);
      }}
    />
  );
}

export function ComparisonPanel({
  scenarios,
  onRemove,
  onRename,
  onOpen,
  onNavigate,
}: {
  scenarios: Scenario[];
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onOpen: (project: unknown) => void;
  onNavigate: () => void;
}) {
  const mixedLoads = new Set(scenarios.map((s) => s.loadSignature)).size > 1;
  const mixedVersions =
    new Set(scenarios.map((s) => s.solverVersion + '|' + s.catalogHash)).size > 1;
  const keys = Object.keys(metricDefinitions) as (keyof Metrics)[];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">05 / TASARIM ALTERNATİFLERİ</span>
          <h1>Senaryo karşılaştırması</h1>
          <p>En fazla dört hesabın sabitlenmiş sonuç özetini yan yana inceleyin.</p>
        </div>
        <GitCompareArrows size={28} />
      </div>
      {!scenarios.length ? (
        <div className="empty-state form-sheet">
          <GitCompareArrows size={36} />
          <h2>İlk alternatifinizi ekleyin</h2>
          <p>
            Bir hesap tamamlayın, sonuç ekranında “Karşılaştırmaya ekle” düğmesine basın. Sonra
            ürün, yerleşim veya kütleyi değiştirip yeniden hesaplayın.
          </p>
          <Button variant="outline" onClick={onNavigate}>
            Sistemi düzenle <ArrowRight size={15} />
          </Button>
        </div>
      ) : (
        <>
          <div className="comparison-toolbar">
            <p>
              {scenarios.length} / 4 senaryo · Sonraki taslak değişiklikleri bu kayıtları
              değiştirmez.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                csv(
                  'senaryo-karsilastirmasi.csv',
                  ['Özellik', ...scenarios.map((s) => s.label)],
                  [
                    ['Kütle kg', ...scenarios.map((s) => s.mass)],
                    ['İzolatör sayısı', ...scenarios.map((s) => s.mountCount)],
                    ...keys.map(
                      (key) =>
                        [
                          metricDefinitions[key].join(' · '),
                          ...scenarios.map((s) => s.metrics[key] ?? 'Hesaplanmadı'),
                        ] as (string | number)[],
                    ),
                  ],
                )
              }
            >
              <Download size={14} />
              Karşılaştırmayı CSV indir
            </Button>
          </div>
          {mixedLoads && (
            <div className="message notice" role="status">
              Dinamik yükler veya kabul sınırları farklı. Sayısal farklar tek başına bir tasarımın
              daha iyi olduğunu göstermez; her senaryonun kendi isterlerini inceleyin.
            </div>
          )}
          {mixedVersions && (
            <div className="message notice" role="status">
              Çözücü veya katalog sürümleri farklı. Güncel sürümle yeniden hesaplayarak
              karşılaştırın.
            </div>
          )}
          <div className="form-sheet table-scroll comparison-table">
            <table>
              <thead>
                <tr>
                  <th>Özellik</th>
                  {scenarios.map((s) => (
                    <th key={s.id}>
                      <div className="scenario-header">
                        <ScenarioName scenario={s} onRename={onRename} />
                        <button
                          aria-label={s.label + ' senaryosunu karşılaştırmadan çıkar'}
                          onClick={() => onRemove(s.id)}
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <small>{new Date(s.calculatedAt).toLocaleString('tr-TR')}</small>
                      <Status status={s.overall} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Kütle / izolatör</th>
                  {scenarios.map((s) => (
                    <td key={s.id}>
                      {format(s.mass)} kg · {s.mountCount} adet
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Yapı / ürünler</th>
                  {scenarios.map((s) => (
                    <td key={s.id}>
                      {s.structure === 'rigid' ? 'Rijit 6 DOF' : 'Bağlı 7 DOF'}
                      <small>{s.products}</small>
                    </td>
                  ))}
                </tr>
                {(Object.keys(groupNames) as (keyof typeof groupNames)[]).map((group) => (
                  <tr key={group}>
                    <th>{groupNames[group]}</th>
                    {scenarios.map((s) => (
                      <td key={s.id}>
                        <Status status={s.groups[group]} />
                      </td>
                    ))}
                  </tr>
                ))}
                {keys.map((key) => (
                  <tr key={key}>
                    <th>
                      {metricDefinitions[key][0]}
                      <small>{metricDefinitions[key][1]}</small>
                    </th>
                    {scenarios.map((s) => (
                      <td key={s.id}>{format(s.metrics[key], 5)}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th>Kaynak</th>
                  {scenarios.map((s) => (
                    <td key={s.id}>
                      <code>{s.id.slice(0, 10)}</code>
                      <small>
                        Çözücü {s.solverVersion} · katalog {s.catalogHash.slice(0, 8)}
                      </small>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Yeniden düzenle</th>
                  {scenarios.map((s) => (
                    <td key={s.id}>
                      <Button variant="outline" size="sm" onClick={() => onOpen(s.project)}>
                        Taslak olarak aç
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">
            “—” hesaplanmayan bir büyüklüktür; sıfır sonuç anlamına gelmez. Karşılaştırma kayıtları
            bu tarayıcıda saklanır. “Taslak olarak aç” girdileri yükler; güncel sonuç ve rapor için
            yeniden hesaplayın.
          </p>
        </>
      )}
    </>
  );
}
