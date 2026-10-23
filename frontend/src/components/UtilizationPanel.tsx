import type { Result } from '../lib/types';
import { format } from '../lib/types';
import { groupNames, utilization } from '../lib/insights';

export function UtilizationPanel({ result }: { result: Result }) {
  const ranked = utilization(result.checks);
  if (!ranked.length) return null;
  return (
    <details className="utilization-panel" open>
      <summary>
        Limitlere en yakın kontroller <small>Ölçülen / limit · en yüksek altı oran</small>
      </summary>
      <p className="hint">
        %100 ilgili limite eşittir. Veri olmayan veya hesaplanamayan kontroller bu oranlara
        katılmaz; yukarıdaki doğrulama uyarıları geçerlidir.
      </p>
      <div className="utilization-grid">
        {ranked.slice(0, 6).map(({ check: c, ratio }) => (
          <div
            key={c.id}
            className={'utilization-item ' + (c.status === 'exceeded' ? 'exceeded' : '')}
          >
            <div>
              <strong>{c.title}</strong>
              <span>%{format(ratio * 100, 1)}</span>
            </div>
            <small>
              {groupNames[c.group]} · {[c.mount_id, c.axis].filter(Boolean).join(' / ')}
            </small>
            <meter
              min={0}
              max={1}
              value={Math.min(1, ratio)}
              aria-label={c.title + ' limit kullanımı'}
              aria-valuetext={'%' + format(ratio * 100)}
            />
            <p>
              {format(c.measured, 4)} / {format(c.limit, 4)} {c.unit}
              {ratio > 1 ? ' · Sınır aşıldı' : ''}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}
