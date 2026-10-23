import { Component, Suspense, lazy, useState, type ReactNode } from 'react';
import { ArrowUpRight, RotateCcw, Search, Plus, Table2, Box } from 'lucide-react';
import type { Catalog, Mount, Project } from '../lib/types';
import { format } from '../lib/types';
import { api } from '../lib/api';
import { preset, presetNames, align, type Preset } from '../lib/layout';
import { Numeric, Select, Toggle, VectorFields } from './Fields';
import { Button } from './ui/button';
import type { CameraView } from './Scene';
const Scene = lazy(() => import('./Scene'));
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty-state">
        <Box />
        <p>Bu tarayıcıda WebGL açılamadı. Yerleşimi aşağıdaki tabloyla düzenleyebilirsiniz.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function LayoutPanel({
  project: p,
  catalog,
  onChange,
  onNotice,
}: {
  project: Project;
  catalog: Catalog;
  onChange: (p: Project, expected?: Project) => boolean | void;
  onNotice: (s: string) => void;
}) {
  const [family, setFamily] = useState('lord');
  const [series, setSeries] = useState('all');
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState('AM-004-6');
  const [selected, setSelected] = useState(p.mounts[0].id);
  const [accepted, setAccepted] = useState(false);
  const [view, setView] = useState<CameraView>('iso');
  const [table, setTable] = useState(false);
  const [kind, setKind] = useState<Preset>('base4');
  const [size, setSize] = useState(300);
  const [depth, setDepth] = useState(200);
  const [roll, setRoll] = useState(0);
  const [undo, setUndo] = useState<Project | null>(null);
  const [applying, setApplying] = useState(false);
  const selectedMount = p.mounts.find((m) => m.id === selected) ?? p.mounts[0];
  const products = catalog.products.filter(
    (x) =>
      x.family === family &&
      (series === 'all' || series === x.series) &&
      x.name.toLowerCase().includes(query.toLowerCase()),
  );
  const product = products.find((x) => x.id === productId) ?? products[0];
  function updateMount(id: string, patch: Partial<Mount>) {
    onChange({ ...p, mounts: p.mounts.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }
  function changeWithUndo(next: Project) {
    setUndo(structuredClone(p));
    onChange(next);
  }
  async function apply(all: boolean) {
    if (!product) return;
    setApplying(true);
    try {
      const next = await api.apply({
        project: p,
        product_id: product.id,
        mount_ids: all ? p.mounts.map((m) => m.id) : [selectedMount.id],
        estimate_accepted: accepted,
      });
      if (onChange(next, p) === false) return;
      setUndo(structuredClone(p));
      onNotice(
        `${product.name} ${all ? 'tüm izolatörlere' : selectedMount.id + ' izolatörüne'} uygulandı. ζ ve α kullanıcı değerlerinde.`,
      );
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setApplying(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">02 / ÜRÜN VE GEOMETRİ</span>
          <h1>İzolatör ve yerleşim</h1>
          <p>Ürünü seçin, destekleri yerleştirin ve yerel eksenleri inceleyin.</p>
        </div>
        <span className="count-tag">{catalog.products.length} katalog varyantı</span>
      </div>
      <div className="catalog-bar">
        <Select
          label="Üretici ailesi"
          value={family}
          onValue={(v) => {
            setFamily(v);
            setSeries('all');
            setProductId(catalog.products.find((x) => x.family === v)!.id);
            setAccepted(false);
          }}
        >
          <option value="lord">Parker LORD · AM</option>
          <option value="soc">SOCITEC · C2H–C6H</option>
        </Select>
        <Select
          label="Seri"
          value={series}
          onValue={(v) => {
            setSeries(v);
            setProductId(
              catalog.products.find((x) => x.family === family && (v === 'all' || x.series === v))!
                .id,
            );
          }}
        >
          <option value="all">Tüm seriler</option>
          {[
            ...new Set(catalog.products.filter((x) => x.family === family).map((x) => x.series)),
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <label className="field search-field">
          <span>Ürün ara</span>
          <div>
            <Search size={15} />
            <input
              value={query}
              placeholder="Model veya dash…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </label>
        <Select
          label={`Ürün · ${products.length} sonuç`}
          value={product?.id ?? ''}
          onValue={setProductId}
        >
          {products.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.issue ? ' · teyit gerekli' : ''}
            </option>
          ))}
        </Select>
      </div>
      {product && (
        <div className="product-summary">
          <div className="product-picture">
            <img
              src={'/catalog-images/' + product.photo.split('/').at(-1)}
              alt={`${product.series} üretici aile görseli`}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <small>Aile görseli</small>
          </div>
          <div className="product-spec">
            <strong>{product.name}</strong>
            <span>
              {product.family === 'lord'
                ? `${product.compound} silikon · axial ${format(product.axial)} / radial ${format(product.radial)} N/mm · kapasite ${format(product.capacity)} N`
                : `H ${format(product.height)} × W ${format(product.width)} mm · ${format(product.mass)} kg · eşdeğer katılık tahmini`}
            </span>
            <a href={product.source} target="_blank" rel="noreferrer">
              Üretici kaynağı{product.source_page ? ' · s. ' + product.source_page : ''}{' '}
              <ArrowUpRight size={13} />
            </a>
            {product.issue && <p className="field-error">{product.issue}</p>}
            {product.family === 'soc' && (
              <Toggle
                label="Frekans ve referans yükten türetilen k_eq tahminini kabul ediyorum"
                checked={accepted}
                onValue={setAccepted}
              />
            )}
          </div>
          <div className="apply-actions">
            <Button
              size="sm"
              variant="outline"
              disabled={!!product.issue || (product.family === 'soc' && !accepted) || applying}
              onClick={() => void apply(false)}
            >
              Seçiliye uygula
            </Button>
            <Button
              size="sm"
              disabled={!!product.issue || (product.family === 'soc' && !accepted) || applying}
              onClick={() => void apply(true)}
            >
              Tümüne uygula
            </Button>
          </div>
        </div>
      )}
      <div className="workspace-layout">
        <div className="scene-sheet">
          <div className="scene-toolbar">
            <div>
              <Box size={17} />
              <strong>Yerleşim çalışma alanı</strong>
            </div>
            <div className="segmented">
              {(['iso', 'top', 'front'] as const).map((v, i) => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                  {['İzometrik', 'Üst', 'Ön'][i]}
                </button>
              ))}
            </div>
          </div>
          <div className="scene">
            <SceneBoundary>
              <Suspense fallback={<div className="empty-state">3B çalışma alanı yükleniyor…</div>}>
                <Scene project={p} selected={selectedMount.id} onSelect={setSelected} view={view} />
              </Suspense>
            </SceneBoundary>
            <div className="scene-key">
              <span>
                <i className="dot teal" />
                İzolatör
              </span>
              <span>
                <i className="dot amber" />
                CG / seçim
              </span>
              <span>X kırmızı · Y yeşil · Z mavi</span>
            </div>
          </div>
          <div className="mount-chips">
            {p.mounts.map((m) => (
              <button
                key={m.id}
                className={m.id === selectedMount.id ? 'active' : ''}
                onClick={() => setSelected(m.id)}
              >
                {m.id}
                <small>{m.product_id ?? 'Kullanıcı'}</small>
              </button>
            ))}
          </div>
          <div className="scene-caption">
            Şematik yerleşimdir; gerçek CAD geometrisi değildir. Döndürmek için sürükleyin,
            yakınlaştırmak için kaydırın.
          </div>
        </div>
        <aside className="mount-inspector">
          <div className="section-title">
            <h2>{selectedMount.id} özellikleri</h2>
            <span>Seçili izolatör</span>
          </div>
          <p className="source-label">
            {selectedMount.product_id ?? 'Kullanıcı tanımlı'} ·{' '}
            {selectedMount.source === 'user'
              ? 'elle girilen katılık'
              : selectedMount.source === 'derived'
                ? 'k_eq tahmini'
                : 'katalog'}
          </p>
          <h3>Konum</h3>
          <VectorFields
            label={selectedMount.id}
            unit="mm"
            value={selectedMount.position_mm}
            onValue={(v) => updateMount(selectedMount.id, { position_mm: v })}
          />
          <h3>Yerel dönüşüm</h3>
          <div className="field-grid three">
            {selectedMount.angles_deg.map((v, i) => (
              <Numeric
                key={i}
                label={['Roll', 'Pitch', 'Yaw'][i]}
                unit="°"
                value={v}
                onValue={(n) =>
                  updateMount(selectedMount.id, {
                    angles_deg: selectedMount.angles_deg.map((x, j) => (j === i ? n : x)),
                  })
                }
              />
            ))}
          </div>
          <h3>Yerel dinamik katılıklar</h3>
          <div className="field-grid three">
            {selectedMount.stiffness_n_mm.map((v, i) => (
              <Numeric
                key={i}
                label={'k' + (i + 1)}
                unit="N/mm"
                value={v}
                min={0.000001}
                onValue={(n) =>
                  updateMount(selectedMount.id, {
                    stiffness_n_mm: selectedMount.stiffness_n_mm.map((x, j) => (j === i ? n : x)),
                    source: 'user',
                    estimate_accepted: false,
                  })
                }
              />
            ))}
          </div>
          <p className="hint">
            Katılık düzenlenirse veri kaynağı “elle girilen” olur. Yerel 3 axial; yerel 1/2 radial.
          </p>
          <Button
            variant="ghost"
            size="sm"
            disabled={p.mounts.length <= 2}
            onClick={() =>
              onChange({ ...p, mounts: p.mounts.filter((m) => m.id !== selectedMount.id) })
            }
          >
            Seçili izolatörü kaldır
          </Button>
        </aside>
      </div>
      <div className="layout-tools">
        <div className="section-title">
          <h2>Yerleşim araçları</h2>
          {undo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(undo);
                setUndo(null);
              }}
            >
              <RotateCcw size={14} />
              Son işlemi geri al
            </Button>
          )}
        </div>
        <div className="preset-row">
          <Select label="Yerleşim örneği" value={kind} onValue={(v) => setKind(v as Preset)}>
            {Object.entries(presetNames).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </Select>
          <Numeric
            label={
              kind === 'base4' ? 'X açıklığı' : kind.startsWith('base') ? 'Çember çapı' : 'Kenar'
            }
            unit="mm"
            min={1}
            max={100000}
            value={size}
            onValue={setSize}
          />
          {kind === 'base4' && (
            <Numeric
              label="Y açıklığı"
              unit="mm"
              min={1}
              max={100000}
              value={depth}
              onValue={setDepth}
            />
          )}
          <Numeric
            label="Ortak roll"
            unit="°"
            min={-360}
            max={360}
            value={roll}
            onValue={setRoll}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => changeWithUndo(preset(p, kind, size, depth, roll))}
          >
            Örneği uygula
          </Button>
        </div>
        <p className="hint">
          Örnek uygulanınca izolatör sayısı, konumlar ve açılar değişir; ilk izolatörün
          ürün/katılığı kopyalanır.{' '}
          {kind.startsWith('center')
            ? 'CG (0, 0, 0) yapılır.'
            : 'CG korunur; destekler Z=0 tabanına yerleşir.'}
        </p>
        <div className="tool-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              changeWithUndo({ ...p, mounts: p.mounts.map((m) => align(m, p.system.cg_mm)) })
            }
          >
            Yerel 2’yi CG Z doğrusuna hizala
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              changeWithUndo({
                ...p,
                mounts: p.mounts.map((m) => ({
                  ...m,
                  angles_deg: [roll, m.angles_deg[1], m.angles_deg[2]],
                })),
              })
            }
          >
            Roll’u tümüne uygula
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={p.mounts.length >= 20}
            onClick={() => {
              const id =
                'I' + (Math.max(...p.mounts.map((m) => Number(m.id.replace(/\D/g, '')) || 0)) + 1);
              onChange({
                ...p,
                mounts: [...p.mounts, { ...p.mounts[0], id, position_mm: [0, 0, 0] }],
              });
              setSelected(id);
            }}
          >
            <Plus size={14} />
            İzolatör ekle
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTable(!table)}>
            <Table2 size={15} />
            {table ? 'Tabloyu gizle' : 'Ayrıntılı tablo'}
          </Button>
        </div>
        <p className="hint">
          Hizalama roll/pitch değerlerini sıfırlar, yaw’u CG’nin düşey doğrusuna yöneltir. Araç
          işlemleri geri alınabilir.
        </p>
      </div>
      {table && (
        <div className="form-sheet table-scroll wide-table">
          <table>
            <thead>
              <tr>
                <th>İzolatör</th>
                {[
                  'X mm',
                  'Y mm',
                  'Z mm',
                  'Roll °',
                  'Pitch °',
                  'Yaw °',
                  'k1 N/mm',
                  'k2 N/mm',
                  'k3 N/mm',
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.mounts.map((m) => (
                <tr key={m.id} className={selectedMount.id === m.id ? 'selected-row' : ''}>
                  <td>
                    <button onClick={() => setSelected(m.id)}>{m.id}</button>
                    <small>{m.product_id ?? 'Kullanıcı'}</small>
                  </td>
                  {(['position_mm', 'angles_deg', 'stiffness_n_mm'] as const).flatMap((key, g) =>
                    m[key].map((v, i) => (
                      <td key={key + i}>
                        <Numeric
                          compact
                          label={
                            m.id +
                            ' ' +
                            ['X', 'Y', 'Z', 'roll', 'pitch', 'yaw', 'k1', 'k2', 'k3'][g * 3 + i]
                          }
                          unit={g === 0 ? 'mm' : g === 1 ? '°' : 'N/mm'}
                          value={v}
                          min={g === 2 ? 0.000001 : undefined}
                          onValue={(n) =>
                            updateMount(m.id, {
                              [key]: m[key].map((x, j) => (i === j ? n : x)),
                              ...(g === 2
                                ? { source: 'user' as const, estimate_accepted: false }
                                : {}),
                            })
                          }
                        />
                      </td>
                    )),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>Katalog verisi, kaynaklar ve birimler</summary>
        <p>
          Katalog {catalog.revision}: 126 LORD ve 49 SOCITEC varyantı. Görseller üretici aile
          görselleridir; varyantın birebir fotoğrafı veya CAD modeli değildir. Hesaplar yerel
          katalog dosyasını kullanır.
        </p>
        {product?.directions && (
          <table>
            <thead>
              <tr>
                <th>Yön</th>
                <th>F · N</th>
                <th>d · mm</th>
                <th>Şok F · N</th>
                <th>Şok d · mm</th>
                <th>f · Hz</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(product.directions).map(([key, d]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{format(d.F)}</td>
                  <td>{format(d.d)}</td>
                  <td>{format(d.shockF)}</td>
                  <td>{format(d.shockD)}</td>
                  <td>{format(d.fn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          SOCITEC: k_eq=(F/g)(2πf)²; tahmindir. ζ ve α otomatik atanmaz. Aktarım tarihi: 23 Ekim
          2026.
        </p>
      </details>
    </>
  );
}
