import React, { useRef, useState, useEffect } from 'react';
import './SettingsBar.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

// localStorage kullanım yüzdesini hesapla
const getLocalStorageUsagePercent = () => {
  try {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    const estimatedLimit = 5 * 1024 * 1024; // 5MB
    return (total / estimatedLimit) * 100;
  } catch (e) {
    return 0;
  }
};

// Toplam resim sayısını hesapla
const getTotalImageCount = () => {
  let count = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key) && key.startsWith('binder-image-')) {
      count++;
    }
  }
  return count;
};

const SettingsBar = ({ 
  binderColor, 
  ringColor,
  containerColor,
  binderType,
  widthRatio,
  heightRatio,
  gridSize,
  pageType,
  defaultBackImage,
  onColorChange, 
  onRingColorChange,
  onContainerColorChange,
  onBinderTypeChange,
  onWidthRatioChange,
  onHeightRatioChange,
  onGridSizeChange,
  onPageTypeChange,
  onDefaultBackImageChange,
  onAddPage,
  onResetAllPages,
  pagesCount = 0,
  imageInputMode = 'file',
  onImageInputModeChange,
  galleryUrls = [],
  onGalleryUrlsChange
}) => {
  const { language } = useLanguage();
  const t = (key, params) => {
    let translation = getTranslation(key, language);
    if (params) {
      Object.keys(params).forEach(param => {
        translation = translation.replace(`{${param}}`, params[param]);
      });
    }
    return translation;
  };
  const backImageInputRef = useRef(null);
  const textFileInputRef = useRef(null);
  const [storageUsage, setStorageUsage] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  
  // localStorage durumunu periyodik olarak güncelle
  useEffect(() => {
    const updateStorageInfo = () => {
      setStorageUsage(getLocalStorageUsagePercent());
      setImageCount(getTotalImageCount());
    };
    
    updateStorageInfo();
    const interval = setInterval(updateStorageInfo, 2000); // Her 2 saniyede bir güncelle
    
    return () => clearInterval(interval);
  }, []);

  const handleBackImageSelect = (e) => {
    const file = e.target.files[0];
    if (file && onDefaultBackImageChange) {
      onDefaultBackImageChange(file);
    }
  };
  
  const handleTextFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        // Her satırı parse et: URL | Resim Adı formatı
        const items = text.split('\n')
          .map(line => line.trim())
          .filter(line => {
            // Boş satırları filtrele ve URL kontrolü yap
            if (!line) return false;
            // URL | Name formatında veya sadece URL olabilir
            const urlPart = line.split('|')[0].trim();
            return urlPart && (urlPart.startsWith('http://') || urlPart.startsWith('https://'));
          })
          .map(line => {
            const parts = line.split('|').map(p => p.trim());
            const url = parts[0].trim();
            const name = parts.slice(1).join('|').trim(); // Birden fazla | varsa birleştir
            return { url, name };
          });
        if (onGalleryUrlsChange) {
          onGalleryUrlsChange(items);
          // localStorage'a kaydet
          try {
            localStorage.setItem('binder-gallery-urls', JSON.stringify(items));
          } catch (e) {
            console.error('Galeri URL\'leri kaydedilirken hata:', e);
          }
          // Galeri moduna geç
          if (onImageInputModeChange) {
            onImageInputModeChange('gallery');
          }
        }
      };
      reader.readAsText(file);
    } else {
      alert(t('settings.invalidTextFile'));
    }
  };
  return (
    <div className="settings-bar">
      <div className="setting-item">
        <select
          value={binderType}
          onChange={(e) => onBinderTypeChange && onBinderTypeChange(e.target.value)}
          className="settings-control compact-select"
          title={t('settings.tipHelp')}
        >
          <option value="leather">{t('binderType.leather')}</option>
          <option value="transparent">{t('binderType.transparent')}</option>
          <option value="denim">{t('binderType.denim')}</option>
        </select>
      </div>
      
      <div className="setting-item">
        <div className="color-input-wrapper" data-tooltip={t('settings.binder')}>
          <input
            type="color"
            value={binderColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="settings-control color-input"
          />
        </div>
      </div>
      
      <div className="setting-item">
        <div className="color-input-wrapper" data-tooltip={t('settings.ring')}>
          <input
            type="color"
            value={ringColor}
            onChange={(e) => onRingColorChange(e.target.value)}
            className="settings-control color-input"
          />
        </div>
      </div>
      
      <div className="setting-item">
        <div className="color-input-wrapper" data-tooltip={t('settings.background')}>
          <input
            type="color"
            value={containerColor}
            onChange={(e) => onContainerColorChange(e.target.value)}
            className="settings-control color-input"
          />
        </div>
      </div>
      
      <div className="setting-item">
        <span className="setting-label" title={t('settings.widthHelp')}>{t('settings.width')}</span>
        <input
          type="number"
          value={widthRatio === '' ? '' : widthRatio}
          onChange={(e) => {
            const value = e.target.value;
            // Boş string'e izin ver (tamamen silip sıfırdan yazabilmek için)
            if (value === '') {
              onWidthRatioChange('');
            } else {
              onWidthRatioChange(value);
            }
          }}
          onKeyDown={(e) => {
            // Ok tuşlarını yakala ve sayfa değiştirmeyi engelle
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.stopPropagation();
            }
          }}
          onBlur={(e) => {
            // Focus kaybolduğunda, eğer boşsa varsayılan değeri kullan
            if (e.target.value === '') {
              onWidthRatioChange(2);
            }
          }}
          min="0.5"
          max="5"
          step="0.1"
          className="settings-control ratio-input"
          title={t('settings.widthHelp')}
        />
      </div>
      
      <div className="setting-item">
        <span className="setting-label" title={t('settings.heightHelp')}>{t('settings.height')}</span>
        <input
          type="number"
          value={heightRatio === '' ? '' : heightRatio}
          onChange={(e) => {
            const value = e.target.value;
            // Boş string'e izin ver (tamamen silip sıfırdan yazabilmek için)
            if (value === '') {
              onHeightRatioChange('');
            } else {
              onHeightRatioChange(value);
            }
          }}
          onKeyDown={(e) => {
            // Ok tuşlarını yakala ve sayfa değiştirmeyi engelle
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.stopPropagation();
            }
          }}
          onBlur={(e) => {
            // Focus kaybolduğunda, eğer boşsa varsayılan değeri kullan
            if (e.target.value === '') {
              onHeightRatioChange(1);
            }
          }}
          min="0.5"
          max="5"
          step="0.1"
          className="settings-control ratio-input"
          title={t('settings.heightHelp')}
        />
      </div>
      
      <div className="setting-item">
        <span className="setting-label" title={t('settings.gridHelp')}>{t('settings.grid')}</span>
        <input
          type="text"
          value={gridSize}
          onChange={(e) => onGridSizeChange(e.target.value)}
          onKeyDown={(e) => {
            // Ok tuşlarını yakala ve sayfa değiştirmeyi engelle
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.stopPropagation();
            }
          }}
          onBlur={(e) => {
            const value = e.target.value.trim();
            // Focus kaybolduğunda format kontrolü yap
            if (value === '') {
              // Boşsa varsayılan değeri kullan
              onGridSizeChange('2x2');
            } else if (!/^\d+x\d+$/.test(value)) {
              // Geçersiz format ise varsayılan değere dön
              onGridSizeChange('2x2');
            } else {
              // Geçerli format ise olduğu gibi bırak
              onGridSizeChange(value);
            }
          }}
          placeholder="2x2"
          className="settings-control grid-input"
          pattern="\d+x\d+"
          title={t('settings.gridHelp')}
        />
      </div>
      
      <div className="setting-item">
        <select
          value={pageType}
          onChange={(e) => onPageTypeChange(e.target.value)}
          className="settings-control compact-select"
          title={t('settings.pageTypeHelp')}
        >
          <option value="mat">{t('pageType.mat')}</option>
          <option value="glossy">{t('pageType.glossy')}</option>
          <option value="holo">{t('pageType.holo')}</option>
        </select>
      </div>
      
      <div className="setting-item">
        <span className="setting-label">{t('settings.imageInputMode')}</span>
        <select
          value={imageInputMode}
          onChange={(e) => onImageInputModeChange && onImageInputModeChange(e.target.value)}
          className="settings-control image-input-select"
          title={t('settings.imageInputModeHelp')}
        >
          <option value="file">📷 {t('settings.uploadFile')}</option>
          <option value="url">🔗 {t('settings.enterUrl')}</option>
          {galleryUrls.length > 0 && <option value="gallery">🖼️ {t('settings.selectFromGallery')}</option>}
        </select>
        {galleryUrls.length > 0 && (
          <span className="gallery-count" title={t('settings.galleryCount', { count: galleryUrls.length })}>
            ({galleryUrls.length})
          </span>
        )}
      </div>
      
      <div className="setting-item">
        <input
          ref={textFileInputRef}
          type="file"
          accept=".txt,text/plain"
          onChange={handleTextFileSelect}
          style={{ display: 'none' }}
        />
        <button
          className="settings-control icon-button"
          onClick={() => textFileInputRef.current?.click()}
          title={t('settings.loadTextFileHelp')}
        >
          📄 {t('settings.loadTextFile')}
        </button>
      </div>
      
      <div className="setting-item">
        <div className="back-image-controls">
          <input
            ref={backImageInputRef}
            type="file"
            accept="image/*"
            onChange={handleBackImageSelect}
            style={{ display: 'none' }}
          />
          <button
            className="settings-control icon-button"
            onClick={() => backImageInputRef.current?.click()}
            title={t('settings.backImageHelp')}
          >
            {defaultBackImage ? '✓' : '📷'}
          </button>
          {defaultBackImage && (
            <button
              className="settings-control icon-button remove-button"
              onClick={() => onDefaultBackImageChange && onDefaultBackImageChange(null)}
              title={t('settings.remove')}
            >
              ×
            </button>
          )}
        </div>
      </div>
      
      <div className="setting-item">
        <button
          className="settings-control action-button"
          onClick={() => onAddPage()}
          disabled={!gridSize}
        >
          {t('settings.addPage')}
        </button>
      </div>
      
      {pagesCount > 0 && (
        <div className="setting-item">
          <button
            className="settings-control action-button danger-button"
            onClick={() => onResetAllPages && onResetAllPages()}
          >
            {t('settings.resetAll')}
          </button>
        </div>
      )}
      
      {/* localStorage durum göstergesi */}
      <div className="setting-item storage-info">
        <div className="storage-label">{t('storage.usage')}:</div>
        <div className="storage-bar-container">
          <div 
            className={`storage-bar ${storageUsage >= 90 ? 'storage-critical' : storageUsage >= 75 ? 'storage-warning' : ''}`}
            style={{ width: `${Math.min(100, storageUsage)}%` }}
          ></div>
        </div>
        <div className="storage-text">
          {storageUsage.toFixed(1)}% • {t('storage.pages')}: {pagesCount} • {t('storage.images')}: {imageCount}
        </div>
      </div>
      
    </div>
  );
};

export default SettingsBar;
