import { useState } from 'react';
import { Check, X } from 'lucide-react';

const INK = '#5c564e';
const STROKE = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' };

/** Hình vẽ nét tự làm (không dùng ảnh người thật). Khung 120 × 160. */
function Frame({ children }) {
  return (
    <svg viewBox="0 0 120 160" aria-hidden="true" className="h-full w-full">
      <rect width="120" height="160" fill="#f2eee8" />
      {children}
    </svg>
  );
}

function Standing({ x = 60, cutAt = 150 }) {
  return (
    <g {...STROKE}>
      <circle cx={x} cy="28" r="12" fill="#f1e9e1" />
      <path d={`M${x} 40 V92`} />
      <path d={`M${x} 52 L${x - 20} 84 M${x} 52 L${x + 20} 84`} />
      <path d={`M${x} 92 L${x - 12} ${cutAt} M${x} 92 L${x + 12} ${cutAt}`} />
    </g>
  );
}

const ILLUSTRATIONS = [
  {
    id: 'good',
    good: true,
    label: 'Nên',
    alt: 'Hình vẽ một người đứng thẳng, nhìn thẳng, thấy rõ từ đầu đến chân.',
    caption: 'Đứng thẳng, đủ toàn thân',
    art: (
      <Frame>
        <Standing cutAt={146} />
        <path d="M30 150 H90" {...STROKE} strokeWidth="2" />
      </Frame>
    ),
  },
  {
    id: 'cut',
    good: false,
    label: 'Không',
    alt: 'Hình vẽ một người bị cắt mất phần chân ở mép dưới ảnh.',
    caption: 'Bị cắt mất chân',
    art: (
      <Frame>
        <Standing cutAt={170} />
      </Frame>
    ),
  },
  {
    id: 'tilt',
    good: false,
    label: 'Không',
    alt: 'Hình vẽ một người ngồi và nghiêng người sang một bên.',
    caption: 'Ngồi hoặc nghiêng người',
    art: (
      <Frame>
        <g {...STROKE}>
          <circle cx="72" cy="52" r="12" fill="#f1e9e1" />
          <path d="M68 64 L50 108" />
          <path d="M62 78 L88 92 M62 78 L40 92" />
          <path d="M50 108 H92 L92 140 M50 108 L44 140" />
        </g>
      </Frame>
    ),
  },
  {
    id: 'crowd',
    good: false,
    label: 'Không',
    alt: 'Hình vẽ hai người đứng cạnh nhau, một người mặc áo rộng.',
    caption: 'Nhiều người, áo rộng',
    art: (
      <Frame>
        <Standing x={40} cutAt={146} />
        <Standing x={82} cutAt={146} />
        <path d="M70 52 L62 100 H102 L94 52" {...STROKE} strokeWidth="2" />
      </Frame>
    ),
  },
];

const RULES = [
  'Một người duy nhất, đứng thẳng, nhìn thẳng, tay buông xuôi hoặc hơi tách khỏi thân.',
  'Thấy rõ toàn thân từ đỉnh đầu đến bàn chân, không bị cắt.',
  'Ảnh dọc, đủ sáng, nền đơn giản, không vật cản phía trước cơ thể.',
  'Mặc đồ ôm vừa người (tránh áo khoác dày, váy rộng).',
];

function GuideBody() {
  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-small text-ink">
        {RULES.map((rule) => (
          <li key={rule} className="flex gap-2">
            <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
      <p className="text-small text-ink-muted">
        JPG, PNG hoặc WEBP · tối đa 10 MB · tối thiểu 512 × 1024 px · ảnh dọc.
      </p>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-2">
        {ILLUSTRATIONS.map((item) => (
          <li key={item.id} className="w-28 shrink-0 snap-start sm:w-auto">
            <figure>
              <div
                role="img"
                aria-label={item.alt}
                className={`aspect-[3/4] overflow-hidden rounded-md border-2 ${
                  item.good ? 'border-success' : 'border-danger'
                }`}
              >
                {item.art}
              </div>
              <figcaption className="mt-1.5 text-caption">
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    item.good ? 'text-success' : 'text-danger'
                  }`}
                >
                  {item.good ? (
                    <Check size={12} aria-hidden="true" />
                  ) : (
                    <X size={12} aria-hidden="true" />
                  )}
                  {item.label}
                </span>
                <span className="block text-ink-muted">{item.caption}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Hướng dẫn chụp ảnh chuẩn. Desktop: luôn mở trong cột phải (`alwaysOpen`); mobile/tablet: accordion,
 * mặc định mở khi chưa có ảnh và đóng khi đã có ảnh.
 */
export function PhotoGuide({ hasPhoto, alwaysOpen = false }) {
  const [open, setOpen] = useState(!hasPhoto);
  if (alwaysOpen) {
    return (
      <section
        aria-labelledby="guide-title"
        className="rounded-xl border border-line bg-surface p-5 shadow-card"
      >
        <h2 id="guide-title" className="mb-3 font-display text-heading font-semibold">
          Hướng dẫn chụp ảnh chuẩn
        </h2>
        <GuideBody />
      </section>
    );
  }
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="mt-5 rounded-md border border-line"
    >
      <summary className="cursor-pointer px-4 py-3 text-small font-semibold">
        Hướng dẫn chụp ảnh chuẩn
      </summary>
      <div className="px-4 pb-4">
        <GuideBody />
      </div>
    </details>
  );
}
