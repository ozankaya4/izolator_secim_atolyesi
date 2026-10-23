import { useEffect, useRef, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { Button } from './ui/button';

const terms = [
  [
    'Kütle merkezi · CG',
    'Ekipmanın kütlesinin dengelendiği noktadır. Geometrik merkezle aynı olmak zorunda değildir. CG konumunu ve CG’deki asal ataletleri CAD/kütle özelliklerinden alın.',
  ],
  [
    'Atalet · kg·m²',
    'Dönmeye karşı dirençtir. Ixx, Iyy ve Izz, CG’de ve global asal eksenlerdedir. Bu model atalet çarpımlarını sıfır kabul eder; gelişigüzel üç pozitif sayı fiziksel bir atalet oluşturmayabilir.',
  ],
  [
    'Doğal frekans / mod',
    'Sistemin serbest titreşim biçimidir. Rijit modelde altı, bağlı esnek modelde yedi mod vardır. Bir modun tahrik yönünde etkin kütlesi, o yöndeki katılımını açıklar.',
  ],
  [
    'Sönüm oranı · ζ',
    'Titreşimin sönmesini temsil eden model parametresidir. Ürünün adından otomatik olarak çıkarılmaz. Seçtiğiniz değeri deney veya üretici verisiyle gerekçelendirin.',
  ],
  [
    'Dinamik / statik oran · α',
    'Dinamik katılığın statik katılığa oranıdır. Sürekli yük hesabında k_static = k_dyn / α kullanılır. Güvenlik katsayısı değildir.',
  ],
  [
    'Geçirgenlik · T',
    'Seçili frekansta bağlantının tahrik yönündeki mutlak ivme genliğinin, giriş ivme genliğine oranıdır. T < 1 bu kanalda azaltma anlamına gelir; diğer eksen ve limitler ayrıca incelenir.',
  ],
  [
    'PSD · g²/Hz',
    'Taban ivmesinin frekanslara dağılan güç yoğunluğudur. Bu model tek doğrultulu ortak taban girdisi kullanır. Frekanslar artan sırada olmalı; ondalık virgülde sütunları noktalı virgül veya sekmeyle ayırın.',
  ],
  [
    'RMS ve σ',
    'RMS istatistiksel etkin değerdir. Hareket kontrolündeki σ × RMS, seçilen istatistiksel çarpandır; kaydın hiçbir anda bu değeri aşmayacağını garanti etmez.',
  ],
  [
    'Yerel / global eksen',
    'Global X/Y/Z ekipmanın referansıdır. Her izolatörün yerel 1/2 yönü radial, yerel 3 yönü axial’dır. Dönüş sırası Rz(yaw) Ry(pitch) Rx(roll) olarak uygulanır.',
  ],
  [
    'Şok ve kompanzasyon',
    'Kısa süreli taban darbesidir. Pozitif kompanzasyon, darbe öncesi/sonrası alanlarla son hız ve konumu dengelemeyi hedefler. Saf darbe aynı modelle ayrı çözülür. Tepe değerler grafik yakınlaştırmasından etkilenmez.',
  ],
  [
    'Katalog / k_eq tahmini',
    'LORD katalog katılıkları ile SOCITEC referans frekans/yükten türetilen eşdeğer katılık farklı veri türleridir. SOCITEC tahmini açık kabul ister; ara açılarda yönlü veri bulunamazsa doğrusal geri dönüş gerekçesi gösterilir.',
  ],
  [
    'Ön kontrol ve doğrulama',
    '“Ön kontrol içinde”, yalnız hesaplanmış ve veri bulunan kontrolleri kapsar. “Doğrulama gerekli” üretici verisi veya mühendislik incelemesi eksikliği demektir. MIL ön kontrolü SRS veya tam tolerans/uygunluk belgesi değildir.',
  ],
  [
    'Snapshot ve güncellik',
    'Hesap, o andaki girdilerin değişmez kopyasına bağlıdır. Taslak değişince eski sonuç “Güncel değil” olur. Rapor ve karşılaştırma farklı girdilerle karıştırılmaz.',
  ],
] as const;

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => {
      element.close();
      opener?.focus();
    };
  }, []);
  const filtered = terms.filter(([title, text]) =>
    (title + text).toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')),
  );
  return (
    <dialog ref={dialog} className="help-dialog" aria-labelledby="help-heading" onCancel={onClose}>
      <div className="section-title">
        <div>
          <span className="eyebrow">ÇALIŞMA REHBERİ</span>
          <h2 id="help-heading">
            <BookOpen size={20} />
            Kullanım ve mühendislik terimleri
          </h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Rehberi kapat" onClick={onClose}>
          <X size={19} />
        </Button>
      </div>
      <p>Seçim, tasarım kontrolü ve raporlama için aynı sırayı izleyin.</p>
      <ol className="guide-steps">
        <li>
          <strong>Girdileri hazırlayın.</strong> Kütle, CG ve ataletin kaynağını; çalışma yüklerini
          ve kabul sınırlarını belirleyin. Rapor bilgilerine ekipmanı ve varsayımları yazın.
        </li>
        <li>
          <strong>Ürün ve yerleşimi kurun.</strong> Katalog kaynağını, yön sözleşmesini, kapasiteyi
          ve katılık tahminini kontrol edin. Aile görseli CAD modeli değildir.
        </li>
        <li>
          <strong>Hesaplayın ve ayrıntıları inceleyin.</strong> Önce sınır aşımlarını ve veri
          eksiklerini, sonra modal/statik ve dinamik sonuçları gözden geçirin.
        </li>
        <li>
          <strong>Alternatifleri karşılaştırın.</strong> Sonucu karşılaştırmaya ekleyin; ürünü veya
          yerleşimi değiştirip tekrar hesaplayın. Aynı yük ve limitler karşılaştırmayı anlamlı
          kılar.
        </li>
        <li>
          <strong>Kaydedin ve paylaşın.</strong> Taslağı JSON ile yedekleyin. Rapor yalnız hesap
          snapshot’ını içerir. Tarayıcı verilerinin silinmesi yerel arşivi de siler.
        </li>
      </ol>
      <label className="field help-search">
        <span>
          <Search size={14} />
          Terim ara
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Örn. RMS, atalet, katılık…"
        />
      </label>
      <div className="glossary">
        {filtered.map(([title, text]) => (
          <details key={title} open={!!search}>
            <summary>{title}</summary>
            <p>{text}</p>
          </details>
        ))}
        {!filtered.length && <p role="status">Bu aramayla eşleşen terim bulunamadı.</p>}
      </div>
      <p className="hint">
        Hesaba özgü kabuller ve sayısal tanılama, sonuç ekranının altındaki “Model kabulleri,
        uyarılar ve tanılama” bölümündedir. Üretici kaynakları ürün kartında ve raporda bulunur.
      </p>
    </dialog>
  );
}
