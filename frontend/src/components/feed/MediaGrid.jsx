/**
 * MediaGrid — Twitter/X-style fixed-box image grid.
 *
 * Layouts:
 *  1 image  → full-width, 320px tall
 *  2 images → two equal columns, 250px tall
 *  3 images → left column full-height (250px), right column two stacked (each 122px)
 *  4 images → 2 × 2 grid, each cell 180px tall
 *
 * All images use object-cover so they fill the box without distortion.
 * Clicking an image opens the ImageLightbox overlay.
 */

import { useState } from 'react';
import ImageLightbox from './ImageLightbox';

export default function MediaGrid({ images = [], className = '' }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const urls = images.map((img) => img?.url || img).filter(Boolean);
  if (!urls.length) return null;

  const open = (e, idx) => {
    e.stopPropagation();
    setLightboxIndex(idx);
  };

  const imgCls = 'w-full h-full object-cover cursor-pointer select-none';

  let grid = null;

  if (urls.length === 1) {
    grid = (
      <div className="h-[300px] overflow-hidden rounded-xl">
        <img src={urls[0]} alt="media" className={imgCls} onClick={(e) => open(e, 0)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </div>
    );
  } else if (urls.length === 2) {
    grid = (
      <div className="grid grid-cols-2 gap-0.5 h-[250px] overflow-hidden rounded-xl">
        {urls.map((src, i) => (
          <img key={i} src={src} alt={`media ${i + 1}`} className={imgCls} onClick={(e) => open(e, i)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ))}
      </div>
    );
  } else if (urls.length === 3) {
    grid = (
      <div className="grid grid-cols-2 gap-0.5 h-[250px] overflow-hidden rounded-xl">
        {/* Left: single tall image */}
        <img src={urls[0]} alt="media 1" className={imgCls} onClick={(e) => open(e, 0)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        {/* Right: two stacked */}
        <div className="grid grid-rows-2 gap-0.5 h-[250px]">
          <img src={urls[1]} alt="media 2" className={imgCls} onClick={(e) => open(e, 1)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <img src={urls[2]} alt="media 3" className={imgCls} onClick={(e) => open(e, 2)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
      </div>
    );
  } else {
    // 4+ images — show first 4 in 2×2
    const show = urls.slice(0, 4);
    const extra = urls.length - 4;
    grid = (
      <div className="grid grid-cols-2 gap-0.5 h-[360px] overflow-hidden rounded-xl">
        {show.map((src, i) => (
          <div key={i} className="relative overflow-hidden">
            <img src={src} alt={`media ${i + 1}`} className={imgCls} onClick={(e) => open(e, i)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            {/* "+N more" badge on last cell if there are extras */}
            {i === 3 && extra > 0 ? (
              <div
                className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer"
                onClick={(e) => open(e, 3)}
              >
                <span className="text-white text-2xl font-bold">+{extra}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`mt-3 ${className}`}>
      {grid}

      {lightboxIndex !== null ? (
        <ImageLightbox
          images={urls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
