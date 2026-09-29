import React, { useEffect, useRef, useState, memo } from 'react';

/**
 * Photocard görseli — <img> yerine boyalı div (background-image).
 * Tablette uzun basınca tarayıcının “görseli kaydet / paylaş” menüsü açılmaz.
 */
const CellImage = memo(function CellImage({
  src,
  alt,
  rotationClass = '',
  sleeveColor,
  wrapperClasses,
  extraImgClass = '',
  onFit,
}) {
  const paintRef = useRef(null);
  const wrapperRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [naturalSize, setNaturalSize] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setFailed(false);
    setNaturalSize(null);

    if (!src) {
      setLoaded(true);
      setFailed(true);
      return undefined;
    }

    const image = new window.Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      setNaturalSize({ w: image.naturalWidth, h: image.naturalHeight });
      setLoaded(true);
      setFailed(false);
    };
    image.onerror = () => {
      if (cancelled) return;
      setLoaded(true);
      setFailed(true);
    };
    image.src = src;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  useEffect(() => {
    if (!loaded || failed || !naturalSize) return;
    const target = paintRef.current;
    const wrapper = wrapperRef.current;
    if (!target || !wrapper) return;

    // fitImageToWrapper: naturalWidth/Height + classList/style bekler
    onFit?.(
      {
        naturalWidth: naturalSize.w,
        naturalHeight: naturalSize.h,
        complete: true,
        classList: target.classList,
        style: target.style,
        addEventListener() {},
        removeEventListener() {},
      },
      wrapper
    );
  }, [loaded, failed, naturalSize, rotationClass, sleeveColor, src, onFit]);

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

  const paintStyle = {
    ...(sleeveColor ? { '--sleeve-color': sleeveColor } : {}),
    ...(loaded && !failed && src
      ? {
          backgroundImage: `url(${JSON.stringify(String(src))})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: '100% 100%',
        }
      : {}),
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
        <div
          ref={paintRef}
          role="img"
          aria-label={alt || ''}
          data-natural-width={naturalSize?.w || undefined}
          data-natural-height={naturalSize?.h || undefined}
          className={[
            'cell-image',
            extraImgClass,
            rotationClass,
            sleeveColor ? 'has-sleeve' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={paintStyle}
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
      )}
    </div>
  );
});

export default CellImage;
