import React, { useMemo, useEffect, useRef, useState } from 'react';
import './Binder.css';
import Page from './Page';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const Binder = ({ 
  binderColor, 
  ringColor,
  containerColor = '#ffffff',
  binderType = 'leather',
  widthRatio = 1.8, 
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
  imageInputMode = 'file',
  galleryUrls = [],
  isFullscreen = false,
  onToggleFullscreen,
  onAddPage
}) => {
  const { language } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const touchStartRef = useRef(null);
  const touchEndRef = useRef(null);


  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Touch sürükleme ile sayfa değiştirme
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    touchEndRef.current = null;
    touchStartRef.current = e.touches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchEndRef.current = e.touches[0].clientX;
  };

  const onTouchEnd = () => {
    // Galeri açıkken sürükle bırak ile sayfa değiştirmeyi engelle
    if (document.body.classList.contains('gallery-modal-open')) {
      return;
    }
    
    if (!touchStartRef.current || !touchEndRef.current) return;
    
    const distance = touchStartRef.current - touchEndRef.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && onNextPage) {
      // Sağdan sola sürükleme - sonraki sayfa
      onNextPage();
    }
    if (isRightSwipe && onPrevPage) {
      // Soldan sağa sürükleme - önceki sayfa
      onPrevPage();
    }
  };

  const binderAspectRatio = widthRatio / heightRatio;
  const containerAspectRatio = containerSize.width / containerSize.height;
  
  // Container'ın aspect ratio'suna göre maksimum boyutu seç
  const useFullWidth = containerAspectRatio > binderAspectRatio;
  
  const wrapperStyle = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { width: '95%', height: '95%' };
    }
    
    const scale = 0.95; // Biraz küçült
    
    if (useFullWidth) {
      // Container daha geniş, height'ı 95% yap, width'i aspect ratio'ya göre hesapla
      return {
        height: `${scale * 100}%`,
        width: `${(binderAspectRatio / containerAspectRatio) * scale * 100}%`
      };
    } else {
      // Container daha yüksek, width'i 95% yap, height'i aspect ratio'ya göre hesapla
      return {
        width: `${scale * 100}%`,
        height: `${(containerAspectRatio / binderAspectRatio) * scale * 100}%`
      };
    }
  }, [useFullWidth, containerSize, binderAspectRatio]);
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
  
  const leftPageNumber = leftPagePhysicalIndex !== null ? leftPagePhysicalIndex * 2 + 2 : null; // Arka yüz
  const rightPageNumber = rightPagePhysicalIndex !== null ? rightPagePhysicalIndex * 2 + 1 : null; // Ön yüz

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
            className="fullscreen-add-page-btn"
            onClick={onAddPage}
            title={t('binder.addPage')}
          >
            +
          </button>
          {/* Sağda ekran küçültme butonu */}
          <button
            className="fullscreen-exit-btn"
            onClick={onToggleFullscreen}
            title={t('binder.exitFullscreen')}
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
        <div className={`binder binder-type-${binderType}`}>
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

          {/* Sayfalar - Spread mantığına göre render */}
          {/* Sol sayfa (arka yüz) */}
          {leftPage && (
            <div 
              key={`left-${leftPage.id}-${currentSpreadIndex}`}
              className="binder-page left-page page-interactive page-flip-animation"
              style={{
                zIndex: 1000,
                pointerEvents: 'auto'
              }}
            >
              <button
                className="binder-page-select-button button-holes-side"
                onClick={(e) => {
                  e.stopPropagation();
                  const pageIndex = pages.findIndex(p => p.id === leftPage.id);
                  if (pageIndex !== -1) {
                    const isSelected = selectedPageIndex === pageIndex;
                    if (isSelected) {
                      onPageGridEdit && onPageGridEdit(leftPage.id, leftPage.gridSize || '2x2');
                    } else {
                      onPageSelect && onPageSelect(leftPage.id);
                    }
                  }
                }}
                title={t('binder.selectPage')}
              >
                {selectedPageIndex !== null && pages[selectedPageIndex]?.id === leftPage.id ? '⚙' : '○'}
              </button>
              <button
                className="binder-page-delete-button button-holes-side"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(t('binder.deleteConfirm'))) {
                    onDeletePage && onDeletePage(leftPage.id);
                  }
                }}
                title={t('binder.deletePage')}
              >
                ×
              </button>
              <Page 
                page={leftPage} 
                gridSize={leftPage.gridSize || '2x2'} 
                coverSide="left"
                pageType={pageType}
                defaultBackImage={defaultBackImage}
                isSelected={selectedPageIndex !== null && pages[selectedPageIndex]?.id === leftPage.id}
                isFlipped={false}
                pagePosition="left"
                pointerEvents="auto"
                pageZIndex={1000}
                frontPageNumber={null}
                backPageNumber={leftPageNumber}
                leafNumber={currentSpreadIndex}
                isTopPage={true}
                imageInputMode={imageInputMode}
                galleryUrls={galleryUrls}
                onUpdate={onPageUpdate}
                onGridEdit={() => onPageGridEdit && onPageGridEdit(leftPage.id, leftPage.gridSize || '2x2')}
              />
            </div>
          )}
          
          {/* Sağ sayfa (ön yüz) */}
          {rightPage && (
            <div 
              key={`right-${rightPage.id}-${currentSpreadIndex}`}
              className="binder-page right-page page-interactive page-flip-animation"
              style={{
                zIndex: 1001,
                pointerEvents: 'auto'
              }}
            >
              <button
                className="binder-page-select-button button-holes-side"
                onClick={(e) => {
                  e.stopPropagation();
                  const pageIndex = pages.findIndex(p => p.id === rightPage.id);
                  if (pageIndex !== -1) {
                    const isSelected = selectedPageIndex === pageIndex;
                    if (isSelected) {
                      onPageGridEdit && onPageGridEdit(rightPage.id, rightPage.gridSize || '2x2');
                    } else {
                      onPageSelect && onPageSelect(rightPage.id);
                    }
                  }
                }}
                title={t('binder.selectPage')}
              >
                {selectedPageIndex !== null && pages[selectedPageIndex]?.id === rightPage.id ? '⚙' : '○'}
              </button>
              <button
                className="binder-page-delete-button button-holes-side"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(t('binder.deleteConfirm'))) {
                    onDeletePage && onDeletePage(rightPage.id);
                  }
                }}
                title={t('binder.deletePage')}
              >
                ×
              </button>
              <Page 
                page={rightPage} 
                gridSize={rightPage.gridSize || '2x2'} 
                coverSide="right"
                pageType={pageType}
                defaultBackImage={defaultBackImage}
                isSelected={selectedPageIndex !== null && pages[selectedPageIndex]?.id === rightPage.id}
                isFlipped={false}
                pagePosition="right"
                pointerEvents="auto"
                pageZIndex={1001}
                imageInputMode={imageInputMode}
                galleryUrls={galleryUrls}
                frontPageNumber={rightPageNumber}
                backPageNumber={null}
                leafNumber={currentSpreadIndex + 1}
                isTopPage={true}
                onUpdate={onPageUpdate}
                onGridEdit={() => onPageGridEdit && onPageGridEdit(rightPage.id, rightPage.gridSize || '2x2')}
              />
            </div>
          )}

          {/* Sayfa navigasyon butonları */}
          {pages.length > 0 && (
            <div className="page-navigation">
              <button 
                className="nav-button nav-prev"
                onClick={onPrevPage}
                disabled={currentSpreadIndex === 0}
                title={t('binder.prevPage')}
              >
                ‹
              </button>
              <div className="page-counter">
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
                className="nav-button nav-next"
                onClick={onNextPage}
                disabled={currentSpreadIndex >= maxSpreadIndex}
                title={t('binder.nextPage')}
              >
                ›
              </button>
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
              <input
                type="text"
                value={editingGridSize}
                onChange={(e) => onGridSizeChange && onGridSizeChange(e.target.value)}
                placeholder="2x2"
                className="grid-edit-input"
                pattern="\d+x\d+"
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
