import React, { useEffect, useRef, useState, memo } from 'react';

const CellImage = memo(function CellImage({
  src,
  alt,
  rotationClass = '',
  sleeveColor,
  wrapperClasses,
  extraImgClass = '',
  onFit,
}) {
  const imgRef = useRef(null);
  const wrapperRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true);
      setFailed(false);
      if (wrapperRef.current) {
        onFit?.(img, wrapperRef.current);
      }
    }
  }, [src, onFit]);

  const wrapperClassName = [
    wrapperClasses,
    sleeveColor ? 'cell-image-wrapper--sleeve' : '',
    failed
      ? 'cell-image-wrapper--error'
      : loaded
        ? 'cell-image-wrapper--loaded'
        : 'cell-image-wrapper--loading',
  ]
    .filter(Boolean)
    .join(' ');

  const handleLoad = (e) => {
    setLoaded(true);
    setFailed(false);
    const wrapper = wrapperRef.current;
    if (wrapper) {
      onFit?.(e.target, wrapper);
    }
  };

  const handleError = () => {
    setLoaded(true);
    setFailed(true);
  };

  return (
    <div
      ref={wrapperRef}
      className={wrapperClassName}
      title={failed ? undefined : alt || undefined}
      aria-busy={!loaded && !failed}
      aria-label={alt || undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!loaded && !failed && (
        <div className="cell-image-placeholder" aria-hidden="true">
          <span className="cell-image-placeholder-icon" />
        </div>
      )}
      {failed ? (
        <div className="cell-image-error" role="img" aria-label={alt || 'Image unavailable'}>
          <span aria-hidden="true">!</span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          draggable={false}
          decoding="async"
          loading="lazy"
          onContextMenu={(e) => e.preventDefault()}
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
                }
              : undefined
          }
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
});

export default CellImage;
