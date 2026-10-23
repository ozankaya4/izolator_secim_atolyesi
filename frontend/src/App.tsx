import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Waves,
  Save,
  FolderOpen,
  FileDown,
  Upload,
  FileText,
  ChevronRight,
  Box,
  SlidersHorizontal,
  Activity,
  Play,
  Square,
  Check,
  ArrowRight,
  X,
  RefreshCw,
  BookOpen,
  GitCompareArrows,
} from 'lucide-react';
import { api } from './lib/api';
import type { Catalog, Project, Result, Step } from './lib/types';
import { format, stable } from './lib/types';
import {
  getDraft,
  listProjects,
  saveDraft,
  saveProject,
  download,
  listScenarios,
  editScenarios,
} from './lib/storage';
import { scenarioFromResult, type Scenario } from './lib/scenarios';
import { Button } from './components/ui/button';
import { FieldScopeContext, ValidityContext } from './components/Fields';
import { SystemPanel } from './components/SystemPanel';
const LayoutPanel = lazy(() =>
  import('./components/LayoutPanel').then((m) => ({ default: m.LayoutPanel })),
);
const LoadsPanel = lazy(() =>
  import('./components/LoadsPanel').then((m) => ({ default: m.LoadsPanel })),
);
const ResultsPanel = lazy(() =>
  import('./components/ResultsPanel').then((m) => ({ default: m.ResultsPanel })),
);
const Report = lazy(() => import('./components/Report'));
const ComparisonPanel = lazy(() =>
  import('./components/ComparisonPanel').then((m) => ({ default: m.ComparisonPanel })),
);
const HelpPanel = lazy(() =>
  import('./components/HelpPanel').then((m) => ({ default: m.HelpPanel })),
);
const steps: { id: Step; name: string; sub: string; icon: typeof Box }[] = [
  { id: 'system', name: 'Sistem', sub: 'Kütle ve yapı', icon: SlidersHorizontal },
  { id: 'layout', name: 'İzolatör ve yerleşim', sub: 'Ürün ve geometri', icon: Box },
  { id: 'loads', name: 'Yükler ve isterler', sub: 'Tahrik ve sınırlar', icon: Activity },
  { id: 'results', name: 'Sonuçlar', sub: 'Karar ve analiz', icon: FileText },
  { id: 'compare', name: 'Karşılaştırma', sub: 'Tasarım alternatifleri', icon: GitCompareArrows },
];
export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [step, setStep] = useState<Step>('system');
  const [visited, setVisited] = useState<Set<Step>>(new Set(['system']));
  const [formSession, setFormSession] = useState(0);
  const [help, setHelp] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [bootError, setBootError] = useState('');
  const [saved, setSaved] = useState(false);
  const [picker, setPicker] = useState<{ project: Project; savedAt: string }[] | null>(null);
  const [report, setReport] = useState(false);
  const [invalid, setInvalid] = useState<Map<string, Step>>(new Map());
  const sequence = useRef(0);
  const revision = useRef(0);
  const job = useRef<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const latestProject = useRef(project);
  latestProject.current = project;
  const navigate = useCallback((next: Step) => {
    setStep(next);
    setVisited((old) => new Set(old).add(next));
  }, []);
  const validity = useCallback((id: string, value: boolean, owner: Step = 'system') => {
    if (value) {
      sequence.current++;
      setBusy(false);
      if (job.current) {
        void api.cancel(job.current);
        job.current = null;
      }
    }
    setInvalid((old) => {
      if (old.has(id) === value) return old;
      const next = new Map(old);
      if (value) next.set(id, owner);
      else next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void listScenarios()
      .then((items) => {
        if (alive) setScenarios(items);
      })
      .catch(() => {});
    void (async () => {
      try {
        const [fallback, cat, draft] = await Promise.all([
          api.default(),
          api.catalog(),
          getDraft().catch(() => null),
        ]);
        let initial = fallback;
        if (draft) {
          try {
            const recovered = await api.migrate(draft);
            initial = recovered.project;
            if (alive) setNotice('Son yerel taslağınız kurtarıldı.');
          } catch {
            if (alive) setNotice('Yerel taslak doğrulanamadı; yeni proje açıldı.');
          }
        }
        if (alive) {
          setProject(initial);
          setCatalog(cat);
        }
      } catch (e) {
        if (alive) setBootError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
      mounted.current = false;
      sequence.current++;
      if (job.current) void api.cancel(job.current);
    };
  }, []);
  useEffect(() => {
    if (!project || !project.name.trim() || invalid.size) return;
    setSaved(false);
    let alive = true;
    const timer = setTimeout(() => {
      void saveDraft(project)
        .then(() => {
          if (alive) setSaved(true);
        })
        .catch(() => {
          if (alive) setNotice('Otomatik kayıt kullanılamıyor. JSON dosyasıyla kaydedebilirsiniz.');
        });
    }, 450);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [project, invalid.size]);
  const change = useCallback((next: Project, expected?: Project, expectedSequence?: number) => {
    if (
      expected &&
      (stable(expected) !== stable(latestProject.current) ||
        (expectedSequence !== undefined && expectedSequence !== sequence.current))
    ) {
      setNotice('İşlem sürerken girdiler değişti. Güncel taslak korundu; işlemi yeniden başlatın.');
      return false;
    }
    revision.current++;
    sequence.current++;
    setBusy(false);
    setStage('Girdiler değişti; yeniden hesaplayın.');
    if (job.current) {
      void api.cancel(job.current);
      job.current = null;
      setBusy(false);
      setStage('Girdi değişti; hesap iptal edildi.');
    }
    setProject(next);
    latestProject.current = next;
    setError('');
    return true;
  }, []);
  const compute = useCallback(async () => {
    if (!project || !project.name.trim() || invalid.size || busy) return;
    const token = ++sequence.current;
    const currentRevision = revision.current;
    const snapshot = structuredClone(project);
    setBusy(true);
    setError('');
    setStage('Girdi doğrulanıyor');
    try {
      let response = await api.start(snapshot);
      if (token !== sequence.current || !mounted.current) {
        if (response.status === 'queued' || response.status === 'running')
          void api.cancel(response.id);
        return;
      }
      job.current = response.id;
      while (response.status === 'running' || response.status === 'queued') {
        setStage(response.stage);
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (token !== sequence.current || !mounted.current) return;
        response = await api.job(response.id);
      }
      if (token !== sequence.current || currentRevision !== revision.current || !mounted.current)
        return;
      if (response.status === 'completed' && response.result) {
        setResult(response.result);
        navigate('results');
        setStage('Hesap tamamlandı');
      } else if (response.status === 'failed') setError(response.error ?? 'Hesaplanamadı');
      else setStage('İptal edildi');
    } catch (e) {
      if (token === sequence.current) setError((e as Error).message);
    } finally {
      if (token === sequence.current) {
        job.current = null;
        setBusy(false);
      }
    }
  }, [project, invalid.size, busy, navigate]);
  function cancel() {
    sequence.current++;
    if (job.current) void api.cancel(job.current);
    job.current = null;
    setBusy(false);
    setStage('İptal edildi');
  }
  const stale = !!(
    project &&
    result &&
    (invalid.size > 0 || stable(project) !== stable(result.snapshot))
  );
  if (bootError)
    return (
      <div className="boot-screen">
        <Waves size={36} />
        <h1>API bağlantısı kurulamadı</h1>
        <p>Çalışma alanına şu anda ulaşılamıyor. Bağlantınızı kontrol edip yeniden deneyin.</p>
        <p>{bootError}</p>
        <Button onClick={() => location.reload()}>
          <RefreshCw size={16} />
          Yeniden dene
        </Button>
      </div>
    );
  if (!project || !catalog)
    return (
      <div className="boot-screen">
        <Waves size={36} />
        <p>Çalışma alanı hazırlanıyor…</p>
      </div>
    );
  async function importFile(f: File) {
    const expected = latestProject.current!;
    const expectedSequence = sequence.current;
    try {
      if (f.size > 262144) throw new Error('Proje dosyası en fazla 256 KiB olabilir.');
      const migrated = await api.migrate(JSON.parse(await f.text()));
      if (!change(migrated.project, expected, expectedSequence)) return;
      setInvalid(new Map());
      setFormSession((value) => value + 1);
      setNotice(['Dosya doğrulandı ve proje açıldı.', ...migrated.notices].join('\n'));
    } catch (e) {
      setError('İçe aktarılamadı; mevcut proje korundu. ' + (e as Error).message);
    }
  }
  async function openDraft(raw: unknown, message: string) {
    const expected = latestProject.current!;
    const expectedSequence = sequence.current;
    try {
      const migrated = await api.migrate(raw);
      if (!change(migrated.project, expected, expectedSequence)) return;
      setInvalid(new Map());
      setFormSession((value) => value + 1);
      setPicker(null);
      navigate('system');
      setNotice([message, ...migrated.notices].join('\n'));
    } catch (e) {
      setError('Proje açılamadı; mevcut taslak korundu. ' + (e as Error).message);
    }
  }
  async function editComparison(edit: (current: Scenario[]) => Scenario[]) {
    try {
      setScenarios(await editScenarios(edit));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addComparison() {
    if (!result || stale) return;
    try {
      const item = scenarioFromResult(result);
      setScenarios(
        await editScenarios((current) =>
          current.some((s) => s.id === item.id) ? current : [...current, item],
        ),
      );
      setNotice(
        'Hesap snapshot’ı karşılaştırmaya eklendi. Taslağı değiştirip yeni bir alternatif hesaplayabilirsiniz.',
      );
      navigate('compare');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <ValidityContext.Provider value={validity}>
      <div className="app-shell" hidden={report && !!result}>
        <header className="topbar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('system');
            }}
          >
            <span className="brand-icon">
              <Waves size={23} />
            </span>
            <span>
              İzolatör<span>Seçim Atölyesi</span>
            </span>
          </a>
          <span className="topbar-divider" />
          <label className="project-name">
            <span className="sr-only">Proje adı</span>
            <input
              maxLength={120}
              value={project.name}
              onChange={(e) => change({ ...project, name: e.target.value })}
              aria-invalid={!project.name.trim()}
            />
          </label>
          <div className="project-actions">
            <Button
              variant="ghost"
              size="sm"
              disabled={invalid.size > 0 || !project.name.trim()}
              onClick={() =>
                void saveProject(project)
                  .then(() => setNotice('Proje IndexedDB arşivine kaydedildi.'))
                  .catch((e) => setError(String(e)))
              }
            >
              <Save size={16} />
              <span>Kaydet</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void listProjects()
                  .then(setPicker)
                  .catch((e) => setError(String(e)))
              }
            >
              <FolderOpen size={16} />
              <span>Aç</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={invalid.size > 0 || !project.name.trim()}
              onClick={() => download('izolator-proje.json', JSON.stringify(project, null, 2))}
            >
              <FileDown size={16} />
              <span>JSON</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="JSON içe aktar"
              title="JSON içe aktar"
              onClick={() => file.current?.click()}
            >
              <Upload size={16} />
            </Button>
            <Button variant="outline" size="sm" disabled={!result} onClick={() => setReport(true)}>
              <FileText size={16} />
              <span>Rapor</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHelp(true)}
              aria-label="Kullanım rehberi ve terimler"
            >
              <BookOpen size={16} />
              <span>Rehber</span>
            </Button>
          </div>
          <div className={'freshness ' + (stale ? 'stale' : '')}>
            <i />
            {stale ? 'Güncel değil' : result ? 'Sonuç güncel' : 'Henüz hesaplanmadı'}
          </div>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void importFile(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </header>
        <aside className="sidebar">
          <div className="sidebar-label">ÇALIŞMA AKIŞI</div>
          <nav aria-label="Proje adımları">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  className={'step ' + (step === s.id ? 'active' : '')}
                  aria-current={step === s.id ? 'step' : undefined}
                  onClick={() => navigate(s.id)}
                >
                  <span className="step-number">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {[...invalid.values()].includes(s.id)
                        ? 'Geçersiz giriş var'
                        : s.id === 'compare' && scenarios.length
                          ? `${scenarios.length} kayıtlı senaryo`
                          : s.sub}
                    </small>
                  </span>
                  <Icon size={16} />
                </button>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <span className="local-dot" />
            YEREL ÇALIŞMA ALANI
            <p>Projeler bu tarayıcıda saklanır; hesap girdileri çözüm için sunucuya gönderilir.</p>
            <span className="version-label">Python / SciPy · v1.0</span>
          </div>
        </aside>
        <main id="main-content">
          <div className="breadcrumb">
            Proje <ChevronRight size={13} />
            <span>{steps.find((s) => s.id === step)!.name}</span>
            <span className="autosave">
              {saved ? (
                <>
                  <Check size={12} />
                  Taslak kaydedildi
                </>
              ) : (
                'Kaydediliyor…'
              )}
            </span>
          </div>
          {picker && (
            <div className="project-picker">
              <div className="section-title">
                <h2>Yerel projeler</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Proje listesini kapat"
                  onClick={() => setPicker(null)}
                >
                  <X size={16} />
                </Button>
              </div>
              {picker.length ? (
                picker.map((item) => (
                  <button
                    key={item.project.name}
                    onClick={() => {
                      void openDraft(item.project, 'Yerel proje açıldı.');
                    }}
                  >
                    <strong>{item.project.name}</strong>
                    <span>{new Date(item.savedAt).toLocaleString('tr-TR')}</span>
                    <ArrowRight size={15} />
                  </button>
                ))
              ) : (
                <p>Arşivde kayıtlı proje yok. Üst çubuktaki Kaydet düğmesini kullanın.</p>
              )}
            </div>
          )}
          {notice && (
            <div className="message notice" role="status">
              <span>{notice}</span>
              <button aria-label="Bildirimi kapat" onClick={() => setNotice('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {error && (
            <div className="message error" role="alert">
              <span>{error}</span>
              <button aria-label="Hatayı kapat" onClick={() => setError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          <div hidden={step !== 'system'} key={'system-' + formSession}>
            <FieldScopeContext.Provider value="system">
              <SystemPanel project={project} onChange={change} />
            </FieldScopeContext.Provider>
          </div>
          {visited.has('layout') && (
            <div hidden={step !== 'layout'} key={'layout-' + formSession}>
              <Suspense fallback={<p>Yerleşim hazırlanıyor…</p>}>
                <FieldScopeContext.Provider value="layout">
                  <LayoutPanel
                    project={project}
                    catalog={catalog}
                    onChange={change}
                    onNotice={setNotice}
                  />
                </FieldScopeContext.Provider>
              </Suspense>
            </div>
          )}
          {visited.has('loads') && (
            <div hidden={step !== 'loads'} key={'loads-' + formSession}>
              <Suspense fallback={<p>Yükler hazırlanıyor…</p>}>
                <FieldScopeContext.Provider value="loads">
                  <LoadsPanel project={project} onChange={change} />
                </FieldScopeContext.Provider>
              </Suspense>
            </div>
          )}
          {step === 'results' && (
            <Suspense fallback={<p>Sonuçlar hazırlanıyor…</p>}>
              <ResultsPanel result={result} stale={stale} onCompare={() => void addComparison()} />
            </Suspense>
          )}
          {step === 'compare' && (
            <Suspense fallback={<p>Karşılaştırma hazırlanıyor…</p>}>
              <ComparisonPanel
                scenarios={scenarios}
                onRemove={(id) => void editComparison((items) => items.filter((s) => s.id !== id))}
                onRename={(id, label) =>
                  void editComparison((items) =>
                    items.map((s) => (s.id === id ? { ...s, label } : s)),
                  )
                }
                onOpen={(raw) =>
                  void openDraft(
                    raw,
                    'Senaryo girdileri taslak olarak açıldı. Sonuçlar için yeniden hesaplayın.',
                  )
                }
                onNavigate={() => navigate('system')}
              />
            </Suspense>
          )}
        </main>
        <footer className="compute-bar">
          <div className="project-summary">
            <span>
              <strong>{format(project.system.mass_kg)}</strong> kg
            </span>
            <span>
              <strong>{project.mounts.length}</strong> izolatör
            </span>
            <span>{project.structure.kind === 'rigid' ? 'Rijit · 6 DOF' : 'Esnek · 7 DOF'}</span>
            <span>{project.direction.map((v) => format(v, 2)).join(' / ')} · tahrik</span>
          </div>
          <div className="compute-actions">
            <div className="compute-stage" role="status" aria-live="polite">
              {busy && <progress aria-label="Hesaplama sürüyor" />}
              {invalid.size ? (
                <button className="invalid-link" onClick={() => navigate([...invalid.values()][0])}>
                  Geçersiz sayısal alanları düzeltin →
                </button>
              ) : !project.name.trim() ? (
                'Proje adı boş olamaz.'
              ) : (
                stage || 'Analiz için hazır'
              )}
            </div>
            <Button variant="outline" size="sm" disabled={!busy} onClick={cancel}>
              <Square size={13} />
              İptal
            </Button>
            <Button
              disabled={busy || invalid.size > 0 || !project.name.trim()}
              onClick={() => void compute()}
            >
              <Play size={15} fill="currentColor" />
              {busy ? 'Hesaplanıyor' : 'Hesapla'}
            </Button>
          </div>
        </footer>
        {help && (
          <Suspense fallback={<p role="status">Rehber hazırlanıyor…</p>}>
            <HelpPanel onClose={() => setHelp(false)} />
          </Suspense>
        )}
      </div>
      {report && result && (
        <Suspense fallback={<p>Rapor hazırlanıyor…</p>}>
          <Report result={result} stale={stale} onClose={() => setReport(false)} />
        </Suspense>
      )}
    </ValidityContext.Provider>
  );
}
