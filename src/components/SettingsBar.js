import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './SettingsBar.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { loadDefaultGallery } from '../utils/defaultGallery';
import { parseGalleryText } from '../utils/galleryParse';
import GalleryWithFolders from './GalleryWithFolders';
import { GALLERY_UI_CONTEXT } from '../utils/galleryUiState';

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
  onDeleteAllPages,
  pagesCount = 0,
  imageInputMode = 'defaultGallery',
  onImageInputModeChange,
  galleryUrls = [],
  onGalleryUrlsChange,
  isFullscreen = false,
  onToggleFullscreen,
  binders = [],
  selectedBinderId = null,
  onSelectBinder,
  onCreateBinder,
  onDeleteBinder,
  onRenameBinder,
  binderUsedImages = null
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
  const widthUpIntervalRef = useRef(null);
  const widthDownIntervalRef = useRef(null);
  const heightUpIntervalRef = useRef(null);
  const heightDownIntervalRef = useRef(null);
  const widthRatioRef = useRef(widthRatio);
  const heightRatioRef = useRef(heightRatio);
  const [showBackImageModal, setShowBackImageModal] = useState(false);
  const [showBackImageUrlInput, setShowBackImageUrlInput] = useState(false);
  const [backImageUrlInput, setBackImageUrlInput] = useState('');
  const [showBackImageGallery, setShowBackImageGallery] = useState(false);
  const [showBackImageDefaultGallery, setShowBackImageDefaultGallery] = useState(false);
  const [defaultGalleryUrls, setDefaultGalleryUrls] = useState([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerType, setColorPickerType] = useState(null); // 'binder', 'ring', 'background'
  const [colorPickerValue, setColorPickerValue] = useState('#000000');
  const [showBinderMenu, setShowBinderMenu] = useState(false);
  const [editingBinderId, setEditingBinderId] = useState(null);
  const [editingBinderName, setEditingBinderName] = useState('');
  const [mobileSettingsExpanded, setMobileSettingsExpanded] = useState(false);
  
  // widthRatio ve heightRatio ref'lerini güncelle
  useEffect(() => {
    widthRatioRef.current = widthRatio;
  }, [widthRatio]);

  useEffect(() => {
    heightRatioRef.current = heightRatio;
  }, [heightRatio]);


  // Interval'ları temizle
  useEffect(() => {
    return () => {
      if (widthUpIntervalRef.current) clearInterval(widthUpIntervalRef.current);
      if (widthDownIntervalRef.current) clearInterval(widthDownIntervalRef.current);
      if (heightUpIntervalRef.current) clearInterval(heightUpIntervalRef.current);
      if (heightDownIntervalRef.current) clearInterval(heightDownIntervalRef.current);
    };
  }, []);

  // Default gallery'yi yükle
  useEffect(() => {
    const loadGallery = async () => {
      const items = await loadDefaultGallery('cortis-pc.txt');
      setDefaultGalleryUrls(items);
    };
    loadGallery();
  }, []);

  // Basılı tutma için yardımcı fonksiyonlar
  const startWidthIncrease = () => {
    // İlk tıklamada hemen çalış
    const current = parseFloat(widthRatioRef.current) || 1.9;
    const newValue = Math.min(5, parseFloat((current + 0.01).toFixed(2)));
    onWidthRatioChange(newValue);
    
    // Sonra hızlı tekrarla
    widthUpIntervalRef.current = setInterval(() => {
      const current = parseFloat(widthRatioRef.current) || 1.9;
      const newValue = Math.min(5, parseFloat((current + 0.01).toFixed(2)));
      onWidthRatioChange(newValue);
    }, 50); // 50ms = çok hızlı
  };

  const stopWidthIncrease = () => {
    if (widthUpIntervalRef.current) {
      clearInterval(widthUpIntervalRef.current);
      widthUpIntervalRef.current = null;
    }
  };

  const startWidthDecrease = () => {
    // İlk tıklamada hemen çalış
    const current = parseFloat(widthRatioRef.current) || 1.9;
    const newValue = Math.max(0.5, parseFloat((current - 0.01).toFixed(2)));
    onWidthRatioChange(newValue);
    
    // Sonra hızlı tekrarla
    widthDownIntervalRef.current = setInterval(() => {
      const current = parseFloat(widthRatioRef.current) || 1.9;
      const newValue = Math.max(0.5, parseFloat((current - 0.01).toFixed(2)));
      onWidthRatioChange(newValue);
    }, 50); // 50ms = çok hızlı
  };

  const stopWidthDecrease = () => {
    if (widthDownIntervalRef.current) {
      clearInterval(widthDownIntervalRef.current);
      widthDownIntervalRef.current = null;
    }
  };

  const startHeightIncrease = () => {
    // İlk tıklamada hemen çalış
    const current = parseFloat(heightRatioRef.current) || 1;
    const newValue = Math.min(5, parseFloat((current + 0.01).toFixed(2)));
    onHeightRatioChange(newValue);
    
    // Sonra hızlı tekrarla
    heightUpIntervalRef.current = setInterval(() => {
      const current = parseFloat(heightRatioRef.current) || 1;
      const newValue = Math.min(5, parseFloat((current + 0.01).toFixed(2)));
      onHeightRatioChange(newValue);
    }, 50); // 50ms = çok hızlı
  };

  const stopHeightIncrease = () => {
    if (heightUpIntervalRef.current) {
      clearInterval(heightUpIntervalRef.current);
      heightUpIntervalRef.current = null;
    }
  };

  const startHeightDecrease = () => {
    // İlk tıklamada hemen çalış
    const current = parseFloat(heightRatioRef.current) || 1;
    const newValue = Math.max(0.5, parseFloat((current - 0.01).toFixed(2)));
    onHeightRatioChange(newValue);
    
    // Sonra hızlı tekrarla
    heightDownIntervalRef.current = setInterval(() => {
      const current = parseFloat(heightRatioRef.current) || 1;
      const newValue = Math.max(0.5, parseFloat((current - 0.01).toFixed(2)));
      onHeightRatioChange(newValue);
    }, 50); // 50ms = çok hızlı
  };

  const stopHeightDecrease = () => {
    if (heightDownIntervalRef.current) {
      clearInterval(heightDownIntervalRef.current);
      heightDownIntervalRef.current = null;
    }
  };

  const handleBackImageSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file && file instanceof File && onDefaultBackImageChange) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onDefaultBackImageChange(event.target.result);
      };
      reader.onerror = () => {
        console.error('Dosya okuma hatası');
      };
      reader.readAsDataURL(file);
    }
    // Modal'ı sadece dosya seçildiyse kapat
    if (file) {
      setShowBackImageModal(false);
    }
    // Input'un value'sunu temizle ki aynı dosya tekrar seçilebilsin
    e.target.value = '';
  };

  const handleBackImageFileClick = () => {
    setTimeout(() => {
      backImageInputRef.current?.click();
    }, 100);
  };

  const handleBackImageUrlSubmit = () => {
    const trimmedUrl = backImageUrlInput.trim();
    if (trimmedUrl) {
      if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://') || trimmedUrl.startsWith('data:image')) {
        if (onDefaultBackImageChange) {
          onDefaultBackImageChange(trimmedUrl);
        }
        setBackImageUrlInput('');
        setShowBackImageModal(false);
      } else {
        alert(t('settings.invalidUrl'));
      }
    }
  };

  const handleBackImageGallerySelect = (e, item) => {
    e.stopPropagation();
    e.preventDefault();
    
    const url = typeof item === 'string' ? item : item.url;
    if (onDefaultBackImageChange) {
      onDefaultBackImageChange(url);
    }
    setShowBackImageGallery(false);
    setShowBackImageModal(false);
  };


  const handleBackImageDefaultGallerySelect = (e, item) => {
    e.stopPropagation();
    e.preventDefault();
    
    const url = typeof item === 'string' ? item : item.url;
    if (onDefaultBackImageChange) {
      onDefaultBackImageChange(url);
    }
    setShowBackImageDefaultGallery(false);
    setShowBackImageModal(false);
  };
  
  const handleTextFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const items = parseGalleryText(text);
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
    // Input'un value'sunu temizle ki aynı dosya tekrar seçilebilsin
    e.target.value = '';
  };
  const handleBinderNameSave = () => {
    if (editingBinderId && editingBinderName.trim()) {
      onRenameBinder && onRenameBinder(editingBinderId, editingBinderName.trim());
      setEditingBinderId(null);
      setEditingBinderName('');
    }
  };
  
  const handleBinderNameCancel = () => {
    setEditingBinderId(null);
    setEditingBinderName('');
  };
  
  const handleBinderNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBinderNameSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleBinderNameCancel();
    }
  };

  return (
    <div className={`settings-bar${mobileSettingsExpanded ? ' settings-bar--expanded' : ''}`}>
      <div className="settings-bar-primary">
      {/* Fullscreen butonu - En solda */}
      {onToggleFullscreen && (
        <div className="setting-item">
          <button
            className="fullscreen-toggle-btn-left"
            onClick={onToggleFullscreen}
            title={isFullscreen ? t('binder.exitFullscreen') : t('binder.enterFullscreen')}
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>
        </div>
      )}
      
      {/* Binder seçimi ve yönetimi */}
      <div className="setting-item binder-selector">
        <div className="binder-selector-wrapper">
          <select
            value={selectedBinderId || ''}
            onChange={(e) => onSelectBinder && onSelectBinder(e.target.value)}
            className="settings-control binder-select"
            title={t('binder.selectBinder')}
          >
            {binders.map(binder => (
              <option key={binder.id} value={binder.id}>
                {binder.name}
              </option>
            ))}
          </select>
          <button
            className="binder-menu-btn"
            onClick={() => setShowBinderMenu(!showBinderMenu)}
            title={t('binder.selectBinder')}
          >
            ⋮
          </button>
        </div>
        
        {/* Binder menüsü */}
        {showBinderMenu && (
          <div className="binder-menu">
            <button
              className="binder-menu-item"
              onClick={() => {
                onCreateBinder && onCreateBinder();
                setShowBinderMenu(false);
              }}
            >
              + {t('binder.newBinder')}
            </button>
            {binders.map(binder => (
              <div key={binder.id} className="binder-menu-item-wrapper">
                {editingBinderId === binder.id ? (
                  <div className="binder-edit-input-wrapper">
                    <input
                      type="text"
                      value={editingBinderName}
                      onChange={(e) => setEditingBinderName(e.target.value)}
                      onKeyDown={handleBinderNameKeyDown}
                      onBlur={handleBinderNameSave}
                      className="binder-edit-input"
                      placeholder={t('binder.binderNamePlaceholder')}
                      autoFocus
                    />
                    <button
                      className="binder-edit-action-btn binder-edit-save-btn"
                      onClick={handleBinderNameSave}
                      title={t('binder.save')}
                    >
                      ✓
                    </button>
                    <button
                      className="binder-edit-action-btn binder-edit-cancel-btn"
                      onClick={handleBinderNameCancel}
                      title={t('binder.cancel')}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="binder-menu-item-content">
                    <span className="binder-menu-item-text">{binder.name}</span>
                    <div className="binder-menu-item-actions">
                      <button
                        className="binder-menu-action-btn binder-menu-edit-btn"
                        onClick={() => {
                          setEditingBinderId(binder.id);
                          setEditingBinderName(binder.name);
                        }}
                        title={t('binder.renameBinder')}
                      >
                        ✎
                      </button>
                      {binders.length > 1 && (
                        <button
                          className="binder-menu-action-btn binder-menu-delete-btn"
                          onClick={() => {
                            if (window.confirm(t('binder.deleteBinderConfirm'))) {
                              onDeleteBinder && onDeleteBinder(binder.id);
                              setShowBinderMenu(false);
                            }
                          }}
                          title={t('binder.deleteBinder')}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="setting-item settings-add-page-mobile">
        <button
          className="settings-control action-button settings-add-page-btn"
          onClick={() => onAddPage()}
          disabled={!gridSize}
        >
          {t('settings.addPage')}
        </button>
      </div>

      <div className="setting-item settings-mobile-toggle-item">
        <button
          type="button"
          className="settings-mobile-toggle-btn"
          onClick={() => setMobileSettingsExpanded((v) => !v)}
          title={mobileSettingsExpanded ? t('settings.showLess') : t('settings.moreSettings')}
          aria-expanded={mobileSettingsExpanded}
        >
          {mobileSettingsExpanded ? '▲' : '▼'}
        </button>
      </div>
      </div>

      <div className="settings-bar-secondary">
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
            onClick={(e) => {
              if (window.innerWidth <= 1024) {
                e.preventDefault();
                setColorPickerType('binder');
                setColorPickerValue(binderColor);
                setShowColorPicker(true);
              }
            }}
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
            onClick={(e) => {
              if (window.innerWidth <= 1024) {
                e.preventDefault();
                setColorPickerType('ring');
                setColorPickerValue(ringColor);
                setShowColorPicker(true);
              }
            }}
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
            onClick={(e) => {
              if (window.innerWidth <= 1024) {
                e.preventDefault();
                setColorPickerType('background');
                setColorPickerValue(containerColor);
                setShowColorPicker(true);
              }
            }}
            className="settings-control color-input"
          />
        </div>
      </div>
      
      <div className="setting-item">
        <span className="setting-label" title={t('settings.widthHelp')}>{t('settings.width')}</span>
        <div className="ratio-input-wrapper">
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
                onWidthRatioChange(1.9);
              } else {
                // Değeri 2 ondalık basamağa yuvarla
                const numValue = parseFloat(e.target.value);
                if (!isNaN(numValue)) {
                  const rounded = parseFloat(numValue.toFixed(2));
                  onWidthRatioChange(Math.max(0.5, Math.min(5, rounded)));
                }
              }
            }}
            min="0.5"
            max="5"
            step="0.01"
            className="settings-control ratio-input"
            title={t('settings.widthHelp')}
          />
          <div className="ratio-buttons">
            <button
              type="button"
              className="ratio-btn ratio-btn-up"
              onMouseDown={(e) => {
                e.preventDefault();
                startWidthIncrease();
              }}
              onMouseUp={stopWidthIncrease}
              onMouseLeave={stopWidthIncrease}
              onTouchStart={(e) => {
                e.preventDefault();
                startWidthIncrease();
              }}
              onTouchEnd={stopWidthIncrease}
              title={t('settings.increase')}
            >
              ▲
            </button>
            <button
              type="button"
              className="ratio-btn ratio-btn-down"
              onMouseDown={(e) => {
                e.preventDefault();
                startWidthDecrease();
              }}
              onMouseUp={stopWidthDecrease}
              onMouseLeave={stopWidthDecrease}
              onTouchStart={(e) => {
                e.preventDefault();
                startWidthDecrease();
              }}
              onTouchEnd={stopWidthDecrease}
              title={t('settings.decrease')}
            >
              ▼
            </button>
          </div>
        </div>
      </div>
      
      <div className="setting-item">
        <span className="setting-label" title={t('settings.heightHelp')}>{t('settings.height')}</span>
        <div className="ratio-input-wrapper">
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
              } else {
                // Değeri 2 ondalık basamağa yuvarla
                const numValue = parseFloat(e.target.value);
                if (!isNaN(numValue)) {
                  const rounded = parseFloat(numValue.toFixed(2));
                  onHeightRatioChange(Math.max(0.5, Math.min(5, rounded)));
                }
              }
            }}
            min="0.5"
            max="5"
            step="0.01"
            className="settings-control ratio-input"
            title={t('settings.heightHelp')}
          />
          <div className="ratio-buttons">
            <button
              type="button"
              className="ratio-btn ratio-btn-up"
              onMouseDown={(e) => {
                e.preventDefault();
                startHeightIncrease();
              }}
              onMouseUp={stopHeightIncrease}
              onMouseLeave={stopHeightIncrease}
              onTouchStart={(e) => {
                e.preventDefault();
                startHeightIncrease();
              }}
              onTouchEnd={stopHeightIncrease}
              title={t('settings.increase')}
            >
              ▲
            </button>
            <button
              type="button"
              className="ratio-btn ratio-btn-down"
              onMouseDown={(e) => {
                e.preventDefault();
                startHeightDecrease();
              }}
              onMouseUp={stopHeightDecrease}
              onMouseLeave={stopHeightDecrease}
              onTouchStart={(e) => {
                e.preventDefault();
                startHeightDecrease();
              }}
              onTouchEnd={stopHeightDecrease}
              title={t('settings.decrease')}
            >
              ▼
            </button>
          </div>
        </div>
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
          <option value="defaultGallery">⭐ {t('settings.selectFromDefaultGallery') || 'Select from Default Gallery'}</option>
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
          📄 <span className="icon-button-label">{t('settings.loadTextFile')}</span>
        </button>
      </div>
      
      <div className="setting-item">
        <div className="back-image-controls">
          <input
            ref={backImageInputRef}
            type="file"
            accept="image/*"
            onChange={handleBackImageSelect}
            onClick={(e) => {
              // Input'a tıklandığında event'i durdurma, sadece onChange'de işle
              e.stopPropagation();
            }}
            style={{ display: 'none' }}
          />
          <button
            className="settings-control icon-button"
            onClick={() => setShowBackImageModal(true)}
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

      {/* Default Back Image Modal */}
      {showBackImageModal && createPortal(
        <div 
          className="back-image-modal-overlay"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setShowBackImageModal(false);
                        setShowBackImageGallery(false);
                        setShowBackImageDefaultGallery(false);
                        setShowBackImageUrlInput(false);
                        setBackImageUrlInput('');
                      }
                    }}
        >
          <div className="back-image-modal-content" onClick={(e) => e.stopPropagation()}>
            {!showBackImageGallery && !showBackImageDefaultGallery ? (
              <>
                <div className="back-image-modal-header">
                  <h3>{t('settings.backImageHelp')}</h3>
                  <button
                    className="back-image-modal-close"
                    onClick={() => {
                      setShowBackImageModal(false);
                      setShowBackImageUrlInput(false);
                      setShowBackImageGallery(false);
                      setShowBackImageDefaultGallery(false);
                      setBackImageUrlInput('');
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="back-image-modal-options">
                  <button
                    className="back-image-modal-option"
                    onClick={handleBackImageFileClick}
                  >
                    📷 {t('settings.uploadFile')}
                  </button>
                  <button
                    className="back-image-modal-option"
                    onClick={() => {
                      setShowBackImageUrlInput(true);
                      setBackImageUrlInput('');
                    }}
                  >
                    🔗 {t('settings.enterUrl')}
                  </button>
                  {galleryUrls.length > 0 && (
                    <button
                      className="back-image-modal-option"
                      onClick={() => {
                        setShowBackImageGallery(true);
                      }}
                    >
                      🖼️ {t('settings.selectFromGallery')}
                    </button>
                  )}
                  {defaultGalleryUrls.length > 0 && (
                    <button
                      className="back-image-modal-option"
                      onClick={() => {
                        setShowBackImageDefaultGallery(true);
                      }}
                    >
                      ⭐ {t('settings.selectFromDefaultGallery') || 'Select from Default Gallery'}
                    </button>
                  )}
                </div>
                {showBackImageUrlInput && (
                  <div className="back-image-url-input-container">
                    <input
                      type="text"
                      value={backImageUrlInput}
                      onChange={(e) => setBackImageUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBackImageUrlSubmit();
                        } else if (e.key === 'Escape') {
                          setShowBackImageUrlInput(false);
                          setBackImageUrlInput('');
                        }
                      }}
                      placeholder={t('settings.imageUrlPlaceholder')}
                      className="back-image-url-input"
                      autoFocus
                    />
                    <div className="back-image-url-buttons">
                      <button
                        className="back-image-url-btn"
                        onClick={handleBackImageUrlSubmit}
                        title={t('settings.apply')}
                      >
                        ✓
                      </button>
                      <button
                        className="back-image-url-btn"
                        onClick={() => {
                          setShowBackImageUrlInput(false);
                          setBackImageUrlInput('');
                        }}
                        title={t('binder.cancel')}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : showBackImageGallery ? (
              <>
                <div className="back-image-modal-header">
                  <h3>{t('settings.selectFromGallery')}</h3>
                  <button
                    className="back-image-modal-close"
                    onClick={() => {
                      setShowBackImageGallery(false);
                    }}
                  >
                    ×
                  </button>
                </div>
                <GalleryWithFolders
                  embedded
                  variant="back-image"
                  items={galleryUrls}
                  onSelect={handleBackImageGallerySelect}
                  binderUsedImages={binderUsedImages}
                  stateContext={GALLERY_UI_CONTEXT.BACK_CUSTOM}
                  binderId={selectedBinderId}
                />
              </>
            ) : (
              <>
                <div className="back-image-modal-header">
                  <h3>{t('settings.selectFromDefaultGallery') || 'Select from Default Gallery'}</h3>
                  <button
                    className="back-image-modal-close"
                    onClick={() => {
                      setShowBackImageDefaultGallery(false);
                    }}
                  >
                    ×
                  </button>
                </div>
                <GalleryWithFolders
                  embedded
                  variant="back-image"
                  items={defaultGalleryUrls}
                  onSelect={handleBackImageDefaultGallerySelect}
                  binderUsedImages={binderUsedImages}
                  stateContext={GALLERY_UI_CONTEXT.BACK_DEFAULT}
                />
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      
      <div className="setting-item settings-add-page-desktop">
        <button
          className="settings-control action-button"
          onClick={() => onAddPage()}
          disabled={!gridSize}
        >
          {t('settings.addPage')}
        </button>
      </div>

      <div className="setting-item">
        <button
          className="settings-control action-button danger-button"
          onClick={() => onDeleteAllPages && onDeleteAllPages()}
          disabled={pagesCount === 0}
          title={t('settings.deletePages') || 'Sayfaları Sil'}
        >
          {t('settings.deletePages') || 'Sayfaları Sil'}
        </button>
      </div>
      </div>

      {/* Renk Seçici Modal - Mobil için */}
      {showColorPicker && createPortal(
        <div 
          className="color-picker-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowColorPicker(false);
            }
          }}
        >
          <div className="color-picker-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="color-picker-header">
              <h3>{colorPickerType === 'binder' ? t('settings.binder') : colorPickerType === 'ring' ? t('settings.ring') : t('settings.background')}</h3>
              <button
                className="color-picker-close"
                onClick={() => setShowColorPicker(false)}
              >
                ×
              </button>
            </div>
            <div className="color-picker-body">
              <div className="color-picker-main">
                <input
                  type="color"
                  value={colorPickerValue}
                  onChange={(e) => setColorPickerValue(e.target.value)}
                  className="color-picker-input-large"
                />
              </div>
              <div className="color-picker-custom">
                <label>{t('settings.customColor')}</label>
                <input
                  type="text"
                  value={colorPickerValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      setColorPickerValue(value);
                    }
                  }}
                  placeholder="#000000"
                  className="color-picker-hex-input"
                />
              </div>
              <div className="color-picker-actions">
                <button
                  className="color-picker-btn color-picker-btn-cancel"
                  onClick={() => setShowColorPicker(false)}
                >
                  {t('binder.cancel')}
                </button>
                <button
                  className="color-picker-btn color-picker-btn-apply"
                  onClick={() => {
                    if (colorPickerType === 'binder') {
                      onColorChange(colorPickerValue);
                    } else if (colorPickerType === 'ring') {
                      onRingColorChange(colorPickerValue);
                    } else if (colorPickerType === 'background') {
                      onContainerColorChange(colorPickerValue);
                    }
                    setShowColorPicker(false);
                  }}
                >
                  {t('settings.apply')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Binder menüsü dışına tıklandığında kapat */}
      {showBinderMenu && (
        <div 
          className="binder-menu-backdrop"
          onClick={() => setShowBinderMenu(false)}
        />
      )}
    </div>
  );
};

export default SettingsBar;
