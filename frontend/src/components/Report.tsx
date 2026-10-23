import { FileText, Printer, X } from 'lucide-react';
import type { Result } from '../lib/types';
import { format } from '../lib/types';
import { Button } from './ui/button';
import {
  CheckTable,
  HarmonicChart,
  PSDChart,
  ShockCharts,
  ResponseTable,
  Status,
  combined,
} from './ResultsPanel';
export default function Report({
  result: r,
  stale,
  onClose,
}: {
  result: Result;
  stale: boolean;
  onClose: () => void;
}) {
  const p = r.snapshot;
  return (
    <div className="report-shell">
      <div className="report-toolbar">
        <strong>
          <FileText size={18} />
          Hesap snapshot raporu
        </strong>
        <Button variant="outline" onClick={onClose}>
          <X size={16} />
          Raporu kapat
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={16} />
          Yazdır / PDF
        </Button>
      </div>
      <article className="report">
        <header>
          <div className="eyebrow">İZOLATÖR SEÇİM ATÖLYESİ · HESAP RAPORU</div>
          <h1>{p.name}</h1>
          <p>
            {new Date(r.created_at).toLocaleString('tr-TR')} · Çözücü {r.solver_version}
          </p>
          <Status status={r.overall} />
        </header>
        {stale && (
          <div className="stale-banner">
            <strong>ESKİ SNAPSHOT RAPORU — Güncel taslak değişti.</strong>
            <p>
              Bu rapordaki tüm girdiler ve sonuçlar aynı hesap snapshot’ına aittir. Güncel proje
              için yeniden hesaplayın.
            </p>
          </div>
        )}
        <p className="hash">SHA-256: {r.snapshot_id}</p>
        <p className="hash">Katalog SHA-256: {r.catalog_sha256}</p>
        <section>
          <h2>Girdi özeti</h2>
          <table>
            <tbody>
              <tr>
                <th>Kütle</th>
                <td>{format(p.system.mass_kg)} kg</td>
                <th>Yapı</th>
                <td>{p.structure.kind === 'rigid' ? 'Rijit 6 DOF' : 'Bağlı 7 DOF'}</td>
              </tr>
              <tr>
                <th>CG · mm</th>
                <td>{p.system.cg_mm.map((v) => format(v)).join(' / ')}</td>
                <th>Ixx/Iyy/Izz · kg·m²</th>
                <td>{p.system.inertia_kg_m2.map((v) => format(v)).join(' / ')}</td>
              </tr>
              <tr>
                <th>Sürekli yük</th>
                <td>
                  {p.system.static_direction.join(' / ')} · ek{' '}
                  {format(p.system.extra_acceleration_g)} g
                </td>
                <th>Tahrik vektörü</th>
                <td>{p.direction.join(' / ')}</td>
              </tr>
              <tr>
                <th>ζ / α</th>
                <td>
                  {format(p.system.damping)} / {format(p.system.dynamic_static_ratio)}
                </td>
                <th>Sayısal tolerans</th>
                <td>
                  rtol {p.numerics.rtol} · atol {p.numerics.atol}
                </td>
              </tr>
              {p.structure.kind === 'flexible' && (
                <tr>
                  <th>Esnek yapı</th>
                  <td colSpan={3}>
                    {format(p.structure.frequency_hz)} Hz · ζ {format(p.structure.damping)} · etkin
                    kütle %{format(p.structure.mass_percent)} · referans{' '}
                    {p.structure.automatic_connection
                      ? 'geometrik ortalama'
                      : p.structure.connection_mm.join(' / ') + ' mm'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <h3>İzolatörler ve katalog kaynağı</h3>
          <table>
            <thead>
              <tr>
                <th>ID / ürün</th>
                <th>Konum · mm</th>
                <th>Roll/Pitch/Yaw · °</th>
                <th>k1/k2/k3 · N/mm</th>
                <th>Veri kaynağı</th>
              </tr>
            </thead>
            <tbody>
              {p.mounts.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.id} · {m.product_id ?? 'Kullanıcı'}
                  </td>
                  <td>{m.position_mm.map((v) => format(v)).join(' / ')}</td>
                  <td>{m.angles_deg.map((v) => format(v)).join(' / ')}</td>
                  <td>{m.stiffness_n_mm.map((v) => format(v)).join(' / ')}</td>
                  <td>
                    {m.source}
                    {m.estimate_accepted ? ' · tahmin kabul edildi' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {[...new Set(p.mounts.map((m) => m.product_id).filter(Boolean))].map((id) => {
            const product = r.catalog_products.find((x) => x.id === id);
            return product ? (
              <p key={id} className="source-url">
                {product.name}: <a href={product.source}>{product.source}</a> · aktarım{' '}
                {product.retrieved_at}
                {product.issue ? ' · ' + product.issue : ''}
              </p>
            ) : null;
          })}
          <p>
            Katalog catalog-v1 · revizyon {r.catalog_revision}. ζ/α üretici onayı olarak atanmaz.
          </p>
        </section>
        <section>
          <h2>Modeller ve kabuller</h2>
          {r.assumptions.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
          {r.warnings.map((a, i) => (
            <p key={i} className="notice">
              {a}
            </p>
          ))}
        </section>
        <section>
          <h2>Durumlar, isterler ve ihlaller</h2>
          <table>
            <thead>
              <tr>
                <th>Analiz</th>
                <th>Durum</th>
                <th>Kontrol sayısı</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['static', 'Katalog / statik yük'],
                  ['harmonic', 'Harmonik'],
                  ['psd', 'PSD'],
                  ['shock', 'Şok'],
                ] as const
              ).map(([key, label]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <Status status={combined(r.checks.filter((c) => c.group === key))} />
                  </td>
                  <td>{r.checks.filter((c) => c.group === key).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>İhlaller ve doğrulama gerektiren kontroller</h3>
          <CheckTable checks={r.checks.filter((c) => c.status !== 'within')} />
        </section>
        <section>
          <h2>Modal ve statik sonuçlar</h2>
          <table>
            <thead>
              <tr>
                <th>Mod</th>
                <th>Hz</th>
                <th>Tanısal ζ</th>
                <th>Etkin kütle · %</th>
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
          <p>
            CG statik hareketi X/Y/Z:{' '}
            {r.static.cg_displacement_mm.map((v) => format(v, 5)).join(' / ')} mm
          </p>
          <table>
            <thead>
              <tr>
                <th>İzolatör</th>
                <th>Yerel hareket 1/2/3 · mm</th>
                <th>Reaksiyon 1/2/3 · N</th>
              </tr>
            </thead>
            <tbody>
              {r.static.mounts.map((m) => (
                <tr key={m.mount_id}>
                  <td>{m.mount_id}</td>
                  <td>{m.local_displacement_mm.map((v) => format(v, 5)).join(' / ')}</td>
                  <td>{m.reaction_n.map((v) => format(v, 5)).join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {r.harmonic && (
          <section>
            <h2>Harmonik</h2>
            <p>
              Giriş {format(p.harmonic.amplitude_g)} g tepe · {format(p.harmonic.frequency_hz)} Hz ·
              T sınırı {format(p.limits.harmonic_transmissibility)} · ivme sınırı{' '}
              {format(p.limits.harmonic_acceleration_g)} g
            </p>
            <HarmonicChart result={r} print />
            <ResponseTable response={r.harmonic.response} result={r} unit="g tepe" />
          </section>
        )}
        {r.psd && (
          <section>
            <h2>Rastlantısal / PSD</h2>
            <p>
              Giriş {format(r.psd.input_g_rms)} g RMS · {format(p.random.sigma)}σ hareket çarpanı ·
              çıkış sınırı {format(p.limits.psd_acceleration_g_rms)} g RMS
            </p>
            <table>
              <thead>
                <tr>
                  <th>Hz</th>
                  <th>g²/Hz</th>
                </tr>
              </thead>
              <tbody>
                {p.random.points.map((v, i) => (
                  <tr key={i}>
                    <td>{format(v.frequency_hz)}</td>
                    <td>{format(v.density_g2_hz, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PSDChart result={r} />
            <ResponseTable response={r.psd.response} result={r} unit="g RMS" />
          </section>
        )}
        {r.shock && (
          <section>
            <h2>Şok</h2>
            <p>
              {p.shock.shape} · {format(p.shock.amplitude_g)} g · {format(p.shock.duration_ms)} ms ·
              %{p.shock.compensation_percent} ortak kompanzasyon
            </p>
            <p>
              Çıkış sınırı {format(p.limits.shock_acceleration_g)} g tepe · yerel hareket sınırı ±
              {format(p.limits.local_motion_mm)} mm
            </p>
            <ShockCharts result={r} print />
            <ResponseTable response={r.shock.compensated.response} result={r} unit="g tepe" />
            <p>{r.shock.scope}</p>
          </section>
        )}
        <footer>
          <p>
            Çözücü {r.solver_version} · DOP853 · rtol {p.numerics.rtol} · atol {p.numerics.atol} ·
            PSD çözünürlüğü {p.numerics.psd_resolution} / ln(Hz) · koşul sayısı{' '}
            {format(r.condition_number)}
          </p>
          <p>Bu rapor {r.snapshot_id.slice(0, 12)} hesap snapshot’ından oluşturulmuştur.</p>
        </footer>
      </article>
    </div>
  );
}
