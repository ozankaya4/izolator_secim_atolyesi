import type { Project, Catalog, Migration, Job } from './types';
import type { operations } from '../generated/api';
type Apply =
  operations['apply_api_catalog_apply_post']['requestBody']['content']['application/json'];
export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(import.meta.env.BASE_URL + 'api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const err: unknown = await response.json().catch(() => ({
      detail:
        response.status === 429
          ? 'Çok sık istek gönderildi; birkaç saniye sonra yeniden deneyin.'
          : response.status === 413
            ? 'İstek en fazla 256 KiB olabilir.'
            : response.statusText,
    }));
    const detail = typeof err === 'object' && err && 'detail' in err ? err.detail : null;
    throw new Error(
      detail
        ? typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail
                .map(
                  (item: {
                    field?: string;
                    message?: string;
                    loc?: (string | number)[];
                    msg?: string;
                  }) =>
                    [item.field ?? item.loc?.join('.'), item.message ?? item.msg]
                      .filter(Boolean)
                      .join(': '),
                )
                .join('\n')
            : JSON.stringify(detail)
        : 'API bağlantı hatası',
    );
  }
  return response.json() as Promise<T>;
}
export const api = {
  default: () => request<Project>('/projects/default'),
  catalog: () => request<Catalog>('/catalog'),
  migrate: (raw: unknown) => request<Migration>('/projects/migrate', raw),
  apply: (body: Apply) => request<Project>('/catalog/apply', body),
  start: (project: Project) => request<Job>('/jobs', project),
  job: (id: string) => request<Job>('/jobs/' + id),
  cancel: (id: string) => request<Job>('/jobs/' + id + '/cancel', {}),
};
