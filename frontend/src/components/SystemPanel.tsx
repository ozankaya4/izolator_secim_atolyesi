import type { Project } from '../lib/types';
import { Numeric, Select, Toggle, VectorFields } from './Fields';
import { Info, Move3D } from 'lucide-react';
export function SystemPanel({
  project: p,
  onChange,
}: {
  project: Project;
  onChange: (p: Project) => void;
}) {
  const system = (patch: Partial<Project['system']>) =>
    onChange({ ...p, system: { ...p.system, ...patch } });
  const structure = (patch: Partial<Project['structure']>) =>
    onChange({ ...p, structure: { ...p.structure, ...patch } });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">01 / SİSTEM TANIMI</span>
          <h1>Sistemi tanımlayın</h1>
          <p>Kütle özellikleri ve yapısal davranış, tüm analizlerin ortak temelidir.</p>
        </div>
        <Move3D size={30} strokeWidth={1.3} />
      </div>
      <details className="project-details">
        <summary>
          Proje ve rapor bilgileri <small>Müşteri, ekipman ve revizyon</small>
        </summary>
        <p className="hint">
          İsteğe bağlıdır. Bu bilgiler JSON dosyanıza ve hesapladığınız rapor snapshot’ına eklenir.
        </p>
        <div className="field-grid three">
          {(
            [
              ['customer', 'Müşteri / kuruluş', 200],
              ['equipment', 'Makine / ekipman', 200],
              ['reference', 'Proje referansı', 120],
              ['revision', 'Revizyon', 80],
              ['prepared_by', 'Hazırlayan', 200],
            ] as const
          ).map(([key, label, max]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                value={p.details[key]}
                maxLength={max}
                onChange={(e) =>
                  onChange({ ...p, details: { ...p.details, [key]: e.target.value } })
                }
              />
            </label>
          ))}
        </div>
        <label className="field">
          <span>Proje notları / üreticiye sorulacaklar</span>
          <textarea
            value={p.details.notes}
            maxLength={4000}
            rows={3}
            onChange={(e) => onChange({ ...p, details: { ...p.details, notes: e.target.value } })}
          />
        </label>
      </details>
      <div className="system-layout">
        <div className="form-sheet">
          <section>
            <div className="section-title">
              <h2>Kütle ve atalet</h2>
              <span>Global eksenler · SI referansı</span>
            </div>
            <div className="field-grid two">
              <Numeric
                label="Toplam kütle"
                unit="kg"
                min={0.01}
                max={100000}
                value={p.system.mass_kg}
                onValue={(v) => system({ mass_kg: v })}
              />
              <Select
                label="Yapı modeli"
                value={p.structure.kind}
                onValue={(v) => structure({ kind: v as 'rigid' | 'flexible' })}
              >
                <option value="rigid">Rijit · 6 serbestlik derecesi</option>
                <option value="flexible">Esnek · bağlı 6+1 serbestlik derecesi</option>
              </Select>
            </div>
            <h3>Kütle merkezi</h3>
            <VectorFields
              label="CG"
              unit="mm"
              value={p.system.cg_mm}
              onValue={(v) => system({ cg_mm: v })}
            />
            <h3>CG’de asal ataletler</h3>
            <div className="field-grid three">
              {p.system.inertia_kg_m2.map((v, i) => (
                <Numeric
                  key={i}
                  label={['Ixx', 'Iyy', 'Izz'][i]}
                  unit="kg·m²"
                  value={v}
                  min={0.000001}
                  onValue={(n) =>
                    system({
                      inertia_kg_m2: p.system.inertia_kg_m2.map((x, j) => (j === i ? n : x)),
                    })
                  }
                />
              ))}
            </div>
            <p className="hint">
              Global eksenler asal eksen kabul edilir. Atalet çarpımları sıfırdır.
            </p>
          </section>
          <section>
            <div className="section-title">
              <h2>Sürekli yük</h2>
              <span>F = m · g · (1 + ek ivme)</span>
            </div>
            <div className="field-grid two">
              <Select
                label="Sürekli yük yönü"
                value={p.system.static_direction.join(',')}
                onValue={(v) => system({ static_direction: v.split(',').map(Number) })}
              >
                {[
                  ['0,0,-1', '−Z · aşağı'],
                  ['0,0,1', '+Z · yukarı'],
                  ['1,0,0', '+X'],
                  ['-1,0,0', '−X'],
                  ['0,1,0', '+Y'],
                  ['0,-1,0', '−Y'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <Numeric
                label="Ek sürekli ivme"
                unit="g"
                min={0}
                max={100}
                value={p.system.extra_acceleration_g}
                onValue={(v) => system({ extra_acceleration_g: v })}
              />
            </div>
            <p className="hint">Kuvvet yalnız seçilen yönde uygulanır. g = 9,80665 m/s².</p>
          </section>
          {p.structure.kind === 'flexible' && (
            <section>
              <h2>Esnek eşdeğer yapı</h2>
              <div className="field-grid three">
                <Numeric
                  label="Yapısal frekans"
                  unit="Hz"
                  min={0.1}
                  value={p.structure.frequency_hz}
                  onValue={(v) => structure({ frequency_hz: v })}
                />
                <Numeric
                  label="Yapısal sönüm ζ"
                  unit="oran"
                  min={0.001}
                  max={1}
                  value={p.structure.damping}
                  onValue={(v) => structure({ damping: v })}
                />
                <Numeric
                  label="Etkin esnek kütle"
                  unit="% toplam"
                  min={0.01}
                  max={99}
                  value={p.structure.mass_percent}
                  onValue={(v) => structure({ mass_percent: v })}
                />
              </div>
              <p className="notice">
                Etkin esnek kütle, toplam kütle ve ataletin içindedir. %10 varsayımdır; FEM veya
                test ile kalibre edin. Kalan gövde kütlesinin pozitifliği hesapta denetlenir.
              </p>
            </section>
          )}
          <section>
            <h2>Bağlantı referans noktası</h2>
            <Toggle
              label="İzolatör konumlarının geometrik ortalamasını kullan"
              checked={p.structure.automatic_connection}
              onValue={(v) => structure({ automatic_connection: v })}
            />
            {!p.structure.automatic_connection && (
              <VectorFields
                label="Bağlantı"
                unit="mm"
                value={p.structure.connection_mm}
                onValue={(v) => structure({ connection_mm: v })}
              />
            )}
            <p className="hint">
              Tek bir referans noktasıdır. CG ve her izolatörün yerel hareketi ayrıca hesaplanır.{' '}
              {p.structure.kind === 'flexible'
                ? 'Sensör, eşdeğer esnek kütlenin hareketini temsil eder.'
                : 'Rijit durumda sensör bu noktayla özdeştir.'}
            </p>
          </section>
          <details>
            <summary>İleri sayısal ayarlar ve sönüm</summary>
            <div className="field-grid two">
              <Numeric
                label="İzolasyon sönümü ζ"
                unit="oran"
                min={0.002}
                max={1}
                value={p.system.damping}
                onValue={(v) => system({ damping: v })}
              />
              <Numeric
                label="Dinamik / statik katılık α"
                unit="oran"
                min={0.1}
                max={10}
                value={p.system.dynamic_static_ratio}
                onValue={(v) => system({ dynamic_static_ratio: v })}
              />
              <Numeric
                label="Bağıl tolerans"
                unit="rtol"
                min={1e-10}
                max={1e-4}
                value={p.numerics.rtol}
                onValue={(v) => onChange({ ...p, numerics: { ...p.numerics, rtol: v } })}
              />
              <Numeric
                label="Mutlak tolerans"
                unit="atol · SI"
                min={1e-12}
                max={1e-6}
                value={p.numerics.atol}
                onValue={(v) => onChange({ ...p, numerics: { ...p.numerics, atol: v } })}
              />
              <Numeric
                label="PSD bant çözünürlüğü"
                unit="nokta / ln(Hz)"
                min={150}
                max={1200}
                value={p.numerics.psd_resolution}
                onValue={(v) => onChange({ ...p, numerics: { ...p.numerics, psd_resolution: v } })}
              />
            </div>
          </details>
        </div>
        <aside className="assumptions">
          <Info size={20} />
          <h2>Model kabulleri</h2>
          <p>Girdi ile sonucu aynı fizik modeli birbirine bağlar.</p>
          <dl>
            <dt>Yapı</dt>
            <dd>{p.structure.kind === 'rigid' ? 'Rijit · 6 DOF' : 'Karşılıklı bağlı · 7 DOF'}</dd>
            <dt>Modal sönüm</dt>
            <dd>ζ = {p.system.damping.toLocaleString('tr-TR')}</dd>
            <dt>Katılık oranı</dt>
            <dd>α = {p.system.dynamic_static_ratio.toLocaleString('tr-TR')}</dd>
            <dt>Yerel eksenler</dt>
            <dd>1 / 2 radial · 3 axial</dd>
            <dt>Dönüşüm</dt>
            <dd>Rz(yaw) Ry(pitch) Rx(roll)</dd>
          </dl>
          <div className="aside-note">
            ζ ve α kullanıcı kabulüdür. Katalogdan ürün uygulamak bu değerleri otomatik değiştirmez.
          </div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector('details')?.setAttribute('open', '');
            }}
          >
            Sayısal ayarları incele →
          </a>
        </aside>
      </div>
    </>
  );
}
