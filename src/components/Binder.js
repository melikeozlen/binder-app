import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import './Binder.css';
import Page from './Page';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { getTranslation } from '../utils/translations';

const FLIP_DURATION_MS = 720;

const Binder = ({ 
  binderColor, 
  ringColor,
  gridStitchColor = '#D7D7DC',
  containerColor = '#ffffff',
  binderType = 'leather',
  widthRatio = 1.9, 
  heightRatio = 1, 
  pages = [], 
  pageType = 'mat',
  defaultBackImage = null,
  selectedPageIndex = null,
  currentSpread = { leftPageId: null, rightPageId: null },
  currentSpreadIndex = 0,
  maxSpreadIndex = 0,
  onPageSelect,
  onPageUpdate,
  onPageGridEdit,
  editingGridPageId,
  editingGridSize,
  onGridSizeChange,
  onGridSizeSave,
  onGridSizeCancel,
  onNextPage,
  onPrevPage,
  onDeletePage,
  imageInputMode = 'defaultGallery',
  galleryUrls = [],
  binderUsedImages = null,
  binderId = null,
  isFullscreen = false,
  onToggleFullscreen,
  onAddPage
}) => {
  const { language } = useLanguage();
  const { confirm } = useConfirm();
  const t = (key) => getTranslation(key, language);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const touchStartRef = useRef(null);
  const touchEndRef = useRef(null);
  const prevSpreadIndexRef = useRef(currentSpreadIndex);
  const skipFlipOnMountRef = useRef(true);
  const [flip, setFlip] = useState(null);


  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
      if (vv) vv.removeEventListener('resize', updateSize);
    };
  }, []);

  // Touch sürükleme ile sayfa değiştirme
  const minSwipeDistance = 50;
  const requestNextPageRef = useRef(() => {});
  const requestPrevPageRef = useRef(() => {});

  const onTouchStart = (e) => {
    touchEndRef.current = null;
    touchStartRef.current = e.touches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchEndRef.current = e.touches[0].clientX;
  };

  const onTouchEnd = () => {
    // Galeri veya photocard sürüklenirken sayfa değiştirmeyi engelle
    if (
      document.body.classList.contains('gallery-modal-open') ||
      document.body.classList.contains('cell-drag-active')
    ) {
      return;
    }
    
    if (!touchStartRef.current || !touchEndRef.current) return;
    
    const distance = touchStartRef.current - touchEndRef.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) requestNextPageRef.current();
    if (isRightSwipe) requestPrevPageRef.current();
  };

  const binderAspectRatio = widthRatio / heightRatio;
  const containerAspectRatio = containerSize.width / containerSize.height;
  const useFullWidth = containerAspectRatio > binderAspectRatio;

  const wrapperStyle = useMemo(() => {
    const isCompact = containerSize.width < 1024;
    const scale = isCompact ? 0.97 : 0.95;

    if (containerSize.width <= 1 || containerSize.height <= 1) {
      return { width: `${scale * 100}%`, height: `${scale * 100}%` };
    }

    if (useFullWidth) {
      return {
        height: `${scale * 100}%`,
        width: `${(binderAspectRatio / containerAspectRatio) * scale * 100}%`,
        maxWidth: '100%',
        maxHeight: '100%',
      };
    }

    return {
      width: `${scale * 100}%`,
      height: `${(containerAspectRatio / binderAspectRatio) * scale * 100}%`,
      maxWidth: '100%',
      maxHeight: '100%',
    };
  }, [useFullWidth, containerSize, binderAspectRatio, containerAspectRatio]);
  // Dikiş rengini hesapla: binder rengi açıksa koyu, koyuysa açık
  const stitchColor = useMemo(() => {
    // Varsayılan binder rengi
    const defaultColor = binderColor || '#E6E6E6';
    
    // Hex rengi RGB'ye çevir
    const hex = defaultColor.replace('#', '');
    if (hex.length !== 6) {
      // Fallback: varsayılan renkten hesapla
      const defaultR = 230, defaultG = 230, defaultB = 230;
      return `rgb(${Math.round(defaultR * 0.7)}, ${Math.round(defaultG * 0.7)}, ${Math.round(defaultB * 0.7)})`;
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      // Fallback: varsayılan renkten hesapla
      const defaultR = 230, defaultG = 230, defaultB = 230;
      return `rgb(${Math.round(defaultR * 0.7)}, ${Math.round(defaultG * 0.7)}, ${Math.round(defaultB * 0.7)})`;
    }
    
    // Brightness hesapla (0-255 arası)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // Eğer açıksa (brightness > 128) koyu yap, koyuysa açık yap
    if (brightness > 128) {
      // Açık renk → koyu dikiş (binder renginden %30 daha koyu)
      const factor = 0.7;
      return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
    } else {
      // Koyu renk → açık dikiş (binder renginden %30 daha açık)
      const factor = 1.3;
      return `rgb(${Math.min(255, Math.round(r * factor))}, ${Math.min(255, Math.round(g * factor))}, ${Math.min(255, Math.round(b * factor))})`;
    }
  }, [binderColor]);

  // Ring rengini hesapla: hex'ten RGB'ye çevir ve farklı tonlar oluştur
  const ringColorRGB = useMemo(() => {
    const defaultRingColor = ringColor || '#878787';
    const hex = defaultRingColor.replace('#', '');
    
    if (hex.length !== 6) {
      return { r: 135, g: 135, b: 135 };
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return { r: 135, g: 135, b: 135 };
    }
    
    return { r, g, b };
  }, [ringColor]);

  // Ring rengi için farklı tonlar hesapla
  const ringBase = `rgb(${ringColorRGB.r}, ${ringColorRGB.g}, ${ringColorRGB.b})`;
  const ringLightR = Math.min(255, Math.round(ringColorRGB.r * 1.3));
  const ringLightG = Math.min(255, Math.round(ringColorRGB.g * 1.3));
  const ringLightB = Math.min(255, Math.round(ringColorRGB.b * 1.3));
  const ringLight = `rgb(${ringLightR}, ${ringLightG}, ${ringLightB})`;
  
  const ringDarkR = Math.round(ringColorRGB.r * 0.7);
  const ringDarkG = Math.round(ringColorRGB.g * 0.7);
  const ringDarkB = Math.round(ringColorRGB.b * 0.7);
  const ringDark = `rgb(${ringDarkR}, ${ringDarkG}, ${ringDarkB})`;
  
  const ringHighlightR = Math.min(255, Math.round(ringColorRGB.r * 1.5));
  const ringHighlightG = Math.min(255, Math.round(ringColorRGB.g * 1.5));
  const ringHighlightB = Math.min(255, Math.round(ringColorRGB.b * 1.5));
  const ringHighlight = `rgb(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB})`;
  
  // RGBA değerleri için (opacity ile)
  const ringLightRgba90 = `rgba(${ringLightR}, ${ringLightG}, ${ringLightB}, 0.9)`;
  const ringLightRgba70 = `rgba(${ringLightR}, ${ringLightG}, ${ringLightB}, 0.7)`;
  const ringLightRgba50 = `rgba(${ringLightR}, ${ringLightG}, ${ringLightB}, 0.5)`;
  const ringLightRgba80 = `rgba(${ringLightR}, ${ringLightG}, ${ringLightB}, 0.8)`;
  const ringHighlightRgba90 = `rgba(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB}, 0.9)`;
  const ringDarkRgba50 = `rgba(${ringDarkR}, ${ringDarkG}, ${ringDarkB}, 0.5)`;
  const ringHighlightRgba70 = `rgba(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB}, 0.7)`;
  const ringHighlightRgba80 = `rgba(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB}, 0.8)`;
  const ringHighlightRgba60 = `rgba(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB}, 0.6)`;
  const ringHighlightRgba50 = `rgba(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB}, 0.5)`;
  const ringHighlightRgba30 = `rgba(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB}, 0.3)`;
  const ringHighlightRgba20 = `rgba(${ringHighlightR}, ${ringHighlightG}, ${ringHighlightB}, 0.2)`;
  const ringBaseRgba = `rgba(${ringColorRGB.r}, ${ringColorRGB.g}, ${ringColorRGB.b}, 1)`;

  // Sayfaları order alanına göre sırala (yoksa ID'ye göre - geriye dönük uyumluluk)
  const sortedPages = useMemo(() => {
    return [...pages].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.id;
      const orderB = b.order !== undefined ? b.order : b.id;
      return orderA - orderB;
    });
  }, [pages]);
  const pageIdToPhysicalIndex = useMemo(() => {
    const map = new Map();
    sortedPages.forEach((p, idx) => {
      map.set(p.id, idx);
    });
    return map;
  }, [sortedPages]);

  // Spread değişince gerçekçi 3D çevirme başlat (tek adımlı ileri/geri)
  useEffect(() => {
    if (skipFlipOnMountRef.current) {
      skipFlipOnMountRef.current = false;
      prevSpreadIndexRef.current = currentSpreadIndex;
      return;
    }

    const from = prevSpreadIndexRef.current;
    const to = currentSpreadIndex;
    prevSpreadIndexRef.current = to;
    if (from === to) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || Math.abs(to - from) !== 1) {
      setFlip(null);
      return;
    }

    const direction = to > from ? 'next' : 'prev';
    const sheet =
      direction === 'next'
        ? sortedPages[from] || null
        : sortedPages[from - 1] || null;
    if (!sheet) {
      setFlip(null);
      return;
    }

    if (direction === 'next') {
      setFlip({
        direction,
        sheet,
        underLeft: from > 0 ? sortedPages[from - 1] : null,
        underRight: to < sortedPages.length ? sortedPages[to] : null,
      });
    } else {
      setFlip({
        direction,
        sheet,
        underLeft: to > 0 ? sortedPages[to - 1] : null,
        underRight: from < sortedPages.length ? sortedPages[from] : null,
      });
    }
  }, [currentSpreadIndex, sortedPages]);

  useEffect(() => {
    if (!flip) return undefined;
    const id = window.setTimeout(() => setFlip(null), FLIP_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [flip]);

  const requestNextPage = useCallback(() => {
    if (flip) return;
    onNextPage?.();
  }, [flip, onNextPage]);

  const requestPrevPage = useCallback(() => {
    if (flip) return;
    onPrevPage?.();
  }, [flip, onPrevPage]);

  requestNextPageRef.current = requestNextPage;
  requestPrevPageRef.current = requestPrevPage;
  
  // Mevcut spread'deki sayfaları bul
  const leftPage = currentSpread.leftPageId 
    ? pages.find(p => p.id === currentSpread.leftPageId) 
    : null;
  const rightPage = currentSpread.rightPageId 
    ? pages.find(p => p.id === currentSpread.rightPageId) 
    : null;
  
  // Sayfa numaralarını hesapla
  const leftPagePhysicalIndex = leftPage ? pageIdToPhysicalIndex.get(leftPage.id) : null;
  const rightPagePhysicalIndex = rightPage ? pageIdToPhysicalIndex.get(rightPage.id) : null;
  
  const leftPageNumber = leftPagePhysicalIndex !== null && leftPagePhysicalIndex !== undefined
    ? leftPagePhysicalIndex * 2 + 2
    : null; // Arka yüz
  const rightPageNumber = rightPagePhysicalIndex !== null && rightPagePhysicalIndex !== undefined
    ? rightPagePhysicalIndex * 2 + 1
    : null; // Ön yüz

  const getPageNumbers = (page) => {
    if (!page) return { front: null, back: null };
    const idx = pageIdToPhysicalIndex.get(page.id);
    if (idx === undefined || idx === null) return { front: null, back: null };
    return { front: idx * 2 + 1, back: idx * 2 + 2 };
  };

  const renderPageChrome = (page, position) => {
    if (!page || flip) return null;
    const pageIndex = pages.findIndex((p) => p.id === page.id);
    const isSelected = selectedPageIndex !== null && pages[selectedPageIndex]?.id === page.id;
    return (
      <>
        <button
          type="button"
          className="binder-page-select-button button-holes-side"
          onClick={(e) => {
            e.stopPropagation();
            if (pageIndex === -1) return;
            if (isSelected) {
              onPageGridEdit && onPageGridEdit(page.id, page.gridSize || '2x2');
            } else {
              onPageSelect && onPageSelect(page.id);
            }
          }}
          title={t('binder.selectPage')}
          aria-label={t('binder.selectPage')}
        >
          {isSelected ? '⚙' : '○'}
        </button>
        <button
          type="button"
          className="binder-page-delete-button button-holes-side"
          onClick={async (e) => {
            e.stopPropagation();
            const ok = await confirm({
              title: t('dialog.title.deletePage'),
              message: t('binder.deleteConfirm'),
              confirmLabel: t('dialog.delete'),
              cancelLabel: t('dialog.cancel'),
              danger: true,
            });
            if (ok) onDeletePage && onDeletePage(page.id);
          }}
          title={t('binder.deletePage')}
          aria-label={t('binder.deletePage')}
        >
          ×
        </button>
      </>
    );
  };

  const renderBinderPage = ({
    page,
    position,
    zIndex,
    interactive = true,
    flipMode = false,
    extraClassName = '',
  }) => {
    if (!page) return null;
    const nums = getPageNumbers(page);
    const isSelected =
      selectedPageIndex !== null && pages[selectedPageIndex]?.id === page.id;
    const coverSide = flipMode ? 'right' : position === 'left' ? 'left' : 'right';
    const pagePos = flipMode ? 'flip' : position;
    const canInteract = interactive && !flip && !flipMode;

    return (
      <div
        key={`binder-page-${page.id}`}
        className={[
          'binder-page',
          flipMode ? 'flip-sheet' : `${position}-page`,
          canInteract ? 'page-interactive' : '',
          flip && !flipMode ? 'flip-under' : '',
          flipMode && flip ? `flip-${flip.direction}` : '',
          extraClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          zIndex,
          pointerEvents: canInteract ? 'auto' : 'none',
        }}
      >
        {canInteract ? renderPageChrome(page, position) : null}
        <Page
          page={page}
          gridSize={page.gridSize || '2x2'}
          coverSide={coverSide}
          pageType={pageType}
          defaultBackImage={defaultBackImage}
          isSelected={isSelected}
          isFlipped={false}
          pagePosition={pagePos}
          // Çevirme sırasında page-non-interactive kullanma → PC/+ opacity flash olmasın
          pointerEvents="auto"
          pageZIndex={zIndex}
          frontPageNumber={
            flipMode || position === 'right' ? nums.front : null
          }
          backPageNumber={flipMode || position === 'left' ? nums.back : null}
          isTopPage={!flipMode}
          imageInputMode={imageInputMode}
          galleryUrls={galleryUrls}
          binderUsedImages={binderUsedImages}
          binderId={binderId}
          onUpdate={onPageUpdate}
          onGridEdit={() =>
            onPageGridEdit && onPageGridEdit(page.id, page.gridSize || '2x2')
          }
        />
      </div>
    );
  };

  return (
    <div 
      className={`binder-container ${isFullscreen ? 'fullscreen' : ''}`} 
      ref={containerRef} 
      style={{ backgroundColor: containerColor }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Fullscreen kontrolleri */}
      {isFullscreen && (
        <div className="fullscreen-controls">
          {/* Üstte ortada sayfa ekle butonu */}
          <button
            type="button"
            className="fullscreen-add-page-btn"
            onClick={onAddPage}
            title={t('binder.addPage')}
            aria-label={t('binder.addPage')}
          >
            +
          </button>
          {/* Sağda ekran küçültme butonu */}
          <button
            type="button"
            className="fullscreen-exit-btn"
            onClick={onToggleFullscreen}
            title={t('binder.exitFullscreen')}
            aria-label={t('binder.exitFullscreen')}
          >
            ✕
          </button>
        </div>
      )}
      <div className="binder-wrapper" style={{ 
        ...wrapperStyle,
        '--binder-color': binderColor,
        '--stitch-color': stitchColor,
        '--width-ratio': widthRatio,
        '--height-ratio': heightRatio,
        '--ring-base': ringBase,
        '--ring-light': ringLight,
        '--ring-dark': ringDark,
        '--ring-highlight': ringHighlight,
        '--ring-light-rgba-90': ringLightRgba90,
        '--ring-light-rgba-70': ringLightRgba70,
        '--ring-light-rgba-50': ringLightRgba50,
        '--ring-light-rgba-80': ringLightRgba80,
        '--ring-highlight-rgba-90': ringHighlightRgba90,
        '--ring-dark-rgba-50': ringDarkRgba50,
        '--ring-highlight-rgba-70': ringHighlightRgba70,
        '--ring-highlight-rgba-80': ringHighlightRgba80,
        '--ring-highlight-rgba-60': ringHighlightRgba60,
        '--ring-highlight-rgba-50': ringHighlightRgba50,
        '--ring-highlight-rgba-30': ringHighlightRgba30,
        '--ring-highlight-rgba-20': ringHighlightRgba20,
        '--ring-base-rgba': ringBaseRgba
      }}>
        <div
          className={`binder binder-type-${binderType}${flip ? ' is-flipping' : ''}`}
          style={{
            '--grid-stitch-color': gridStitchColor,
            '--grid-stitch-color-outer': gridStitchColor,
          }}
        >
          {/* Sol taraf - Ön cepler */}
          <div className="binder-left" style={{display:"grid", gridTemplateRows:"1fr 2fr 1fr"}}>
            <div></div>
            <div className="card-pockets">
              <div className="card-pocket"></div>
              <div className="card-pocket"></div>
              <div className="card-pocket"></div>
              <div className="card-pocket"></div>
              <div className="card-pocket"></div>
            </div>
            <div className="left-pocket"></div>
          </div>

          {/* Orta kısım - Ring mekanizması */}
          <div className="binder-middle">
            <div className="ring-mechanism">
             
              <div className="rings-group">
                <div className="ring-wrapper">
                  <div className="ring-ring"></div>
                </div>
                <div className="ring-wrapper">
                  <div className="ring-ring"></div>
                </div>
                <div className="ring-wrapper">
                  <div className="ring-ring"></div>
                </div>
                <div className="ring-wrapper">
                  <div className="ring-ring"></div>
                </div>
                <div className="ring-wrapper">
                  <div className="ring-ring"></div>
                </div>
                <div className="ring-wrapper">
                  <div className="ring-ring"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Sağ taraf - Arka cepler */}
          <div className="binder-right">
            <div className="right-pockets"></div>
            <div className="binder-flap">
              <div className="magnetic-buckle"></div>
            </div>
          </div>

          {/* Sayfalar - Spread / 3D çevirme (key = page.id → React instance korunur) */}
          {flip ? (
            <>
              {renderBinderPage({
                page: flip.underLeft,
                position: 'left',
                zIndex: 1000,
                interactive: false,
              })}
              {renderBinderPage({
                page: flip.underRight,
                position: 'right',
                zIndex: 1001,
                interactive: false,
              })}
              {renderBinderPage({
                page: flip.sheet,
                position: 'right',
                zIndex: 1200,
                interactive: false,
                flipMode: true,
              })}
            </>
          ) : (
            <>
              {renderBinderPage({
                page: leftPage,
                position: 'left',
                zIndex: 1000,
                interactive: true,
              })}
              {renderBinderPage({
                page: rightPage,
                position: 'right',
                zIndex: 1001,
                interactive: true,
              })}
            </>
          )}

          {/* Sayfa navigasyon butonları */}
          {pages.length > 0 && (
            <div className="page-navigation">
              <button 
                type="button"
                className="nav-button nav-prev"
                onClick={requestPrevPage}
                disabled={currentSpreadIndex === 0 || Boolean(flip)}
                title={t('binder.prevPage')}
                aria-label={t('binder.prevPage')}
              >
                ‹
              </button>
              <div className="page-counter" aria-live="polite">
                {(() => {
                  // Mevcut spread'deki sayfa numaralarını göster (sol-sağ birlikte)
                  const pageNumbers = [];
                  if (leftPageNumber !== null) {
                    pageNumbers.push(leftPageNumber);
                  }
                  if (rightPageNumber !== null) {
                    pageNumbers.push(rightPageNumber);
                  }
                  if (pageNumbers.length > 0) {
                    return `${t('binder.pageNumber')} ${pageNumbers.join('-')}`;
                  } else {
                    return '-';
                  }
                })()}
              </div>
              <button 
                type="button"
                className="nav-button nav-next"
                onClick={requestNextPage}
                disabled={currentSpreadIndex >= maxSpreadIndex || Boolean(flip)}
                title={t('binder.nextPage')}
                aria-label={t('binder.nextPage')}
              >
                ›
              </button>
            </div>
          )}

          {pages.length === 0 && (
            <div className="binder-empty-state" role="status">
              <p className="binder-empty-title">{t('empty.collectionTitle')}</p>
              <p className="binder-empty-desc">{t('empty.collectionDesc')}</p>
              {onAddPage && (
                <button
                  type="button"
                  className="binder-empty-cta"
                  onClick={onAddPage}
                >
                  {t('empty.addFirstPage')}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
      
      {/* Grid düzenleme modalı - Sağ taraftan açılan menü */}
      {editingGridPageId && (
        <>
          {/* Overlay backdrop */}
          <div className="grid-edit-backdrop" onClick={onGridSizeCancel}></div>
          <div className="grid-edit-modal">
            <div className="grid-edit-content">
              <div className="grid-edit-header">
                <h3>{t('binder.editGrid')}</h3>
                <button 
                  className="grid-edit-close" 
                  onClick={onGridSizeCancel}
                  title={t('binder.cancel')}
                >
                  ×
                </button>
              </div>
              <textarea
                value={editingGridSize}
                onChange={(e) => onGridSizeChange && onGridSizeChange(e.target.value)}
                placeholder={'2x2\nveya\n2\n3\n2'}
                className="grid-edit-input grid-edit-textarea"
                rows={4}
                autoFocus
              />
              <div className="grid-edit-buttons">
                <button onClick={onGridSizeSave} className="save-button">{t('binder.save')}</button>
                <button onClick={onGridSizeCancel} className="cancel-button">{t('binder.cancel')}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Binder;
