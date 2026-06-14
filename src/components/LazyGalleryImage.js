import { useEffect, useRef, useState } from 'react';

const LazyGalleryImage = ({ src, alt, onError, onLoad }) => {
  const imgRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);

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

  return (
    <img
      ref={imgRef}
      src={shouldLoad ? src : undefined}
      alt={alt}
      draggable="false"
      loading="lazy"
      decoding="async"
      onError={onError}
      onLoad={onLoad}
    />
  );
};

export default LazyGalleryImage;
