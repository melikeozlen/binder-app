import { useEffect, useMemo, useRef, useState } from 'react';
import { getDriveImageFallbacks, normalizeDriveImageUrl } from '../utils/driveImageUrl';

const LazyGalleryImage = ({ src, alt, onError, onLoad }) => {
  const imgRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [srcIndex, setSrcIndex] = useState(0);

  const candidateSrcs = useMemo(() => {
    if (!src) return [];
    const normalized = normalizeDriveImageUrl(src);
    const fallbacks = getDriveImageFallbacks(normalized);
    return [...new Set(fallbacks)];
  }, [src]);

  const activeSrc = candidateSrcs[srcIndex] || null;

  useEffect(() => {
    setSrcIndex(0);
  }, [src]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || shouldLoad) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad, src]);

  const handleError = (event) => {
    if (srcIndex < candidateSrcs.length - 1) {
      setSrcIndex((index) => index + 1);
      return;
    }
    onError?.(event);
  };

  return (
    <img
      ref={imgRef}
      src={shouldLoad ? activeSrc : undefined}
      alt={alt}
      draggable="false"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleError}
      onLoad={onLoad}
    />
  );
};

export default LazyGalleryImage;
