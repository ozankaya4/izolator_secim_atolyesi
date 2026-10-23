# Sürümler ve resmî kaynaklar

23 Ekim 2026'da resmî belgeler, npm/PyPI paket metaverisi ve gerçek kurulumla kontrol edildi. Doğrudan bağımlılıklar tam sürümdür; transitif sürümler `pnpm-lock.yaml` ve `uv.lock` ile sabittir. Docker görüntülerinde `latest` kullanılmaz.

- [React sürümleri](https://react.dev/versions): React / React DOM 19.3.1.
- [Vite desteklenen sürümler](https://vite.dev/releases): Vite 8.3.5, Node 24.22.1.
- [TypeScript 5.9](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html): 5.9.3. Mevcut openapi-typescript 7.13.0, TypeScript ^5.x ister. TS 7 ile gerçek üretim başarısız olduğundan uyumlu kararlı 5.9.3 seçildi.
- [FastAPI sürüm notları](https://fastapi.tiangolo.com/release-notes/): FastAPI 0.162.0; Pydantic 2.14.1. Kurulu paket metaverisi `pyproject.toml` ile sabit.
- [SciPy sürümleri](https://scipy.org/news/): SciPy 1.18.1 ve NumPy 2.5.4; Python 3.13.16.
- [Genelleştirilmiş eigh](https://docs.scipy.org/doc/scipy/reference/generated/scipy.linalg.eigh.html): simetrik, pozitif kütle matrisiyle modal çözüm.
- [solve_ivp yöntem seçimi](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html): DOP853, yüksek doğruluk istenen nonstiff problemler için önerilir. Bu uygulama ayrıca en yüksek frekanstan adım üst sınırı ve iş bütçesi uygular; tolerans yakınsaması test edilir.
- [shadcn/ui Vite](https://ui.shadcn.com/docs/installation/vite): yerel Button/Tabs bileşenleri Radix + CVA örüntüsü ve Tailwind 4.3.3 kullanır.
- [uv Docker akışı](https://docs.astral.sh/uv/guides/integration/docker/): uv 0.13.5, frozen lockfile kurulumu.
- [Nginx resmî indirmeleri](https://nginx.org/download/): kararlı 1.30.6.

Tam frontend listesi `frontend/package.json`, backend listesi `backend/pyproject.toml` içindedir. Paket kurulumunda peer bağımlılık kontrolü ve strict TypeScript derlemesi yapılır.
