import React, { useEffect, useRef, useState } from 'react';

const CellImage = ({
  src,
  alt,
  rotationClass = '',
  sleeveColor,
  wrapperClasses,
  extraImgClass = '',
  sleeveRingPx = 6,
  onFit,
}) => {
  const imgRef = useRef(null);
  const wrapperRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true);
      if (wrapperRef.current) {
        onFit?.(img, wrapperRef.current);
      }
    }
  }, [src, onFit]);

  const wrapperClassName = [
    wrapperClasses,
    sleeveColor ? 'cell-image-wrapper--sleeve' : '',
    loaded ? 'cell-image-wrapper--loaded' : 'cell-image-wrapper--loading',
  ]
    .filter(Boolean)
    .join(' ');

  const handleLoad = (e) => {
    setLoaded(true);
    const wrapper = wrapperRef.current;
    if (wrapper) {
      onFit?.(e.target, wrapper);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={wrapperClassName}
      title={alt || undefined}
      aria-busy={!loaded}
      aria-label={alt || undefined}
    >
      {!loaded && (
        <div className="cell-image-placeholder" aria-hidden="true">
          <span className="cell-image-placeholder-icon" />
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        draggable={false}
        decoding="async"
        className={[
          'cell-image',
          extraImgClass,
          rotationClass,
          sleeveColor ? 'has-sleeve' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          sleeveColor
            ? {
                '--sleeve-color': sleeveColor,
                '--sleeve-width': `${sleeveRingPx}px`,
              }
            : undefined
        }
        onLoad={handleLoad}
      />
    </div>
  );
};

export default CellImage;
