import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';
import './SettingsBar.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { loadDefaultGallery } from '../utils/defaultGallery';
import { parseGalleryText } from '../utils/galleryParse';
import { fetchDriveGallery, DriveGalleryError } from '../utils/driveGallery';
import { parseDriveFolderId } from '../utils/driveGalleryParse';
import { normalizeDriveImageUrl } from '../utils/driveImageUrl';
import GalleryWithFolders from './GalleryWithFolders';
import { GALLERY_UI_CONTEXT } from '../utils/galleryUiState';
import { isValidGridSize, normalizeGridSizeInput } from '../utils/gridLayout';

const COLOR_PRESETS = [
  '#E6E6E6', '#FFFFFF', '#000000', '#A0A0A0', '#878787',
  '#D7D7DC', '#8B4513', '#5F9EA0', '#C4A484', '#2F4F4F',
  '#FFB6C1', '#87CEEB', '#F0E68C', '#90EE90', '#DDA0DD',
];

const normalizeHex = (value) => {
  if (!value) return '#000000';
  let hex = String(value).trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return hex.toUpperCase();
  }
  return '#000000';
};

const SettingsBar = ({ 
  binderColor, 
  ringColor,
  containerColor,
  gridStitchColor = '#D7D7DC',
  binderType,
  widthRatio,
  heightRatio,
  gridSize,
  pageType,
  defaultBackImage,
  onColorChange, 
  onRingColorChange,
  onContainerColorChange,
  onGridStitchColorChange,
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
  footerVisible = true,
  onToggleFooter,
  binders = [],
  selectedBinderId = null,
  onSelectBinder,
  onCreateBinder,
  onDeleteBinder,
  onRenameBinder,
  cloudEnabled = false,
  cloudBinderIds,
  savingBinderIds,
  onSaveBinderToCloud,
  onShareBinder,
  onExportBinder,
  onImportBinder,
  binderUsedImages = null,
  readOnly = false,
  // null → gizli; 'dirty' → kaydedilmemiş değişiklik (aktif); 'saving' | 'saved' → pasif
  cloudSaveState = null,
  onCloudSaveNow
}) => {
  const binderImportInputRef = useRef(null);
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
  const [showBackImageUrlInput, setShowBackImageUrlInput] = useState(false);
  const [backImageUrlInput, setBackImageUrlInput] = useState('');
  const [showBackImageGallery, setShowBackImageGallery] = useState(false);
  const [showBackImageDefaultGallery, setShowBackImageDefaultGallery] = useState(false);
  const [showBackImageOptions, setShowBackImageOptions] = useState(false);
  const [defaultGalleryUrls, setDefaultGalleryUrls] = useState([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerType, setColorPickerType] = useState(null); // 'binder', 'ring', 'background', 'gridStitch'
  const [colorPickerValue, setColorPickerValue] = useState('#000000');
  const [showBinderMenu, setShowBinderMenu] = useState(false);
  const [editingBinderId, setEditingBinderId] = useState(null);
  const [editingBinderName, setEditingBinderName] = useState('');
  const [mobileSettingsExpanded, setMobileSettingsExpanded] = useState(false);
  const [driveFolderInput, setDriveFolderInput] = useState('');
  const [driveGalleryLoading, setDriveGalleryLoading] = useState(false);
  const [showGallerySettingsModal, setShowGallerySettingsModal] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [galleryDownloadControls, setGalleryDownloadControls] = useState(null);
  const handleGalleryDownloadControls = useCallback((next) => {
    setGalleryDownloadControls((prev) => {
      if (!next) return prev ? null : prev;
      if (
        prev &&
        prev.canZip === next.canZip &&
        prev.count === next.count &&
        prev.busy === next.busy
      ) {
        // downloadZip her seferinde yeni fonksiyon olabilir; prev'i koru
        return prev;
      }
      return next;
    });
  }, []);
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const update = () => setIsMobileLayout(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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

  const closeGallerySettingsModal = () => {
    setShowGallerySettingsModal(false);
    setShowBackImageOptions(false);
    setShowBackImageGallery(false);
    setShowBackImageDefaultGallery(false);
    setShowBackImageUrlInput(false);
    setBackImageUrlInput('');
    setGalleryDownloadControls(null);
  };

  const renderGalleryHeaderActions = (onCloseClick) => (
    <div className="gallery-settings-header-actions">
      {galleryDownloadControls?.canZip && (
        <button
          type="button"
          className="gallery-zip-btn gallery-zip-btn--header"
          onClick={() => galleryDownloadControls.downloadZip?.()}
          disabled={galleryDownloadControls.busy}
          title={t('settings.galleryZipDownload', { count: galleryDownloadControls.count })}
          aria-label={t('settings.galleryZipDownload', { count: galleryDownloadControls.count })}
        >
          {galleryDownloadControls.busy ? '…' : '⬇'}
          <span className="gallery-zip-btn-count">{galleryDownloadControls.count}</span>
        </button>
      )}
      <button
        type="button"
        className="gallery-settings-panel-close"
        onClick={onCloseClick}
      >
        ×
      </button>
    </div>
  );

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
      closeGallerySettingsModal();
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
        closeGallerySettingsModal();
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
    closeGallerySettingsModal();
  };


  const handleBackImageDefaultGallerySelect = (e, item) => {
    e.stopPropagation();
    e.preventDefault();
    
    const url = typeof item === 'string' ? item : item.url;
    if (onDefaultBackImageChange) {
      onDefaultBackImageChange(url);
    }
    setShowBackImageDefaultGallery(false);
    closeGallerySettingsModal();
  };
  
  const applyGalleryItems = (items) => {
    if (!onGalleryUrlsChange || !Array.isArray(items) || items.length === 0) return;

    const normalizedItems = items.map((item) => {
      if (!item || typeof item === 'string') return item;
      const url = item.url ? normalizeDriveImageUrl(item.url) : item.url;
      return url === item.url ? item : { ...item, url };
    });

    onGalleryUrlsChange(normalizedItems);
    if (onImageInputModeChange) {
      onImageInputModeChange('gallery');
    }
  };

  const handleTextFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const items = parseGalleryText(text);
        applyGalleryItems(items);
      };
      reader.readAsText(file);
    } else {
      alert(t('settings.invalidTextFile'));
    }
    e.target.value = '';
  };

  const getDriveGalleryErrorMessage = (error) => {
    const code = error instanceof DriveGalleryError ? error.code : error?.code;
    switch (code) {
      case 'INVALID_FOLDER':
        return t('settings.driveGalleryInvalidFolder');
      case 'NO_IMAGES':
        return t('settings.driveGalleryNoImages');
      case 'FOLDER_NOT_FOUND':
      case 'FOLDER_ACCESS_DENIED':
        return t('settings.driveGalleryAccessDenied');
      case 'MISSING_API_KEY':
        return t('settings.driveGalleryMissingKey');
      default:
        return t('settings.driveGalleryFailed');
    }
  };

  const handleDriveGalleryLoad = async () => {
    const input = driveFolderInput.trim();
    if (!input) {
      alert(t('settings.driveGalleryInvalidFolder'));
      return;
    }
    if (!parseDriveFolderId(input)) {
      alert(t('settings.driveGalleryInvalidFolder'));
      return;
    }

    setDriveGalleryLoading(true);
    try {
      const { items, count } = await fetchDriveGallery(input);
      applyGalleryItems(items);
      alert(t('settings.driveGallerySuccess', { count }));
      setDriveFolderInput('');
    } catch (error) {
      console.error('Drive galeri yüklenirken hata:', error);
      alert(getDriveGalleryErrorMessage(error));
    } finally {
      setDriveGalleryLoading(false);
    }
  };

  const handleDriveGalleryKeyDown = (e) => {
    if (e.key === 'Enter' && !driveGalleryLoading) {
      e.preventDefault();
      handleDriveGalleryLoad();
    }
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

  const handleBinderItemSelect = (binderId) => {
    if (editingBinderId === binderId) return;
    if (binderId !== selectedBinderId) {
      onSelectBinder && onSelectBinder(binderId);
    }
    setShowBinderMenu(false);
  };

  const openColorPicker = (type, value) => {
    setColorPickerType(type);
    setColorPickerValue(normalizeHex(value));
    setShowColorPicker(true);
  };

  const applyColorPicker = () => {
    const nextColor = normalizeHex(colorPickerValue);
    if (colorPickerType === 'binder') {
      onColorChange && onColorChange(nextColor);
    } else if (colorPickerType === 'ring') {
      onRingColorChange && onRingColorChange(nextColor);
    } else if (colorPickerType === 'background') {
      onContainerColorChange && onContainerColorChange(nextColor);
    } else if (colorPickerType === 'gridStitch') {
      onGridStitchColorChange && onGridStitchColorChange(nextColor);
    }
    setShowColorPicker(false);
  };

  // Görünüm modalı içindeki renk satırı: etiket + renk kutusu
  const renderColorRow = (type, value, onDesktopChange, labelKey) => {
    const label = t(labelKey).replace(/:\s*$/, '');
    const inputId = `appearance-color-${type}`;
    return (
      <div className="appearance-row" key={type}>
        <label className="appearance-row-label" htmlFor={inputId}>{label}</label>
        {isMobileLayout ? (
          <button
            type="button"
            id={inputId}
            className="color-swatch-btn appearance-swatch"
            style={{ backgroundColor: normalizeHex(value) }}
            onClick={() => openColorPicker(type, value)}
            aria-label={label}
          >
            <span className="appearance-swatch-hex">{normalizeHex(value)}</span>
          </button>
        ) : (
          <div className="appearance-color-field">
            <input
              id={inputId}
              type="color"
              value={normalizeHex(value)}
              onChange={(e) => onDesktopChange && onDesktopChange(e.target.value)}
              className="settings-control color-input"
            />
            <span className="appearance-swatch-hex">{normalizeHex(value)}</span>
          </div>
        )}
      </div>
    );
  };

  const renderBinderMenu = (extraClassName = '') => (
    <div className={`binder-menu${extraClassName ? ` ${extraClassName}` : ''}`}>
      <div className="binder-menu-section binder-menu-section--actions">
        <p className="binder-menu-section-label">{t('binder.menuActions')}</p>
        <button
          className="binder-menu-item binder-menu-item--primary"
          onClick={() => {
            onCreateBinder && onCreateBinder();
            setShowBinderMenu(false);
          }}
        >
          + {t('binder.newBinder')}
        </button>
        <div className="binder-menu-action-row">
          <button
            className="binder-menu-item binder-menu-item--secondary"
            onClick={() => {
              onExportBinder && onExportBinder();
              setShowBinderMenu(false);
            }}
            disabled={!selectedBinderId}
          >
            ⬇ {t('binder.exportBinder')}
          </button>
          <button
            className="binder-menu-item binder-menu-item--secondary"
            onClick={() => {
              binderImportInputRef.current?.click();
            }}
            disabled={readOnly}
            title={readOnly ? t('binder.viewOnlyShort') : undefined}
          >
            ⬆ {t('binder.importBinder')}
          </button>
        </div>
        <button
          className="binder-menu-item binder-menu-item--danger"
          onClick={() => {
            onDeleteAllPages && onDeleteAllPages();
            setShowBinderMenu(false);
          }}
          disabled={pagesCount === 0 || readOnly}
          title={readOnly ? t('binder.viewOnlyShort') : t('settings.deletePagesHelp')}
        >
          🗑 {t('settings.deletePages')}
        </button>
      </div>

      <input
        ref={binderImportInputRef}
        type="file"
        accept=".json,.binder.json,application/json"
        className="binder-import-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onImportBinder) {
            onImportBinder(file);
            setShowBinderMenu(false);
          }
          e.target.value = '';
        }}
      />

      <div className="binder-menu-divider" role="separator" />

      <div className="binder-menu-section binder-menu-section--list">
        <p className="binder-menu-section-label">{t('binder.menuBinders')}</p>
        {binders.map(binder => (
          <div
            key={binder.id}
            className={`binder-menu-item-wrapper${binder.id === selectedBinderId ? ' binder-menu-item-wrapper--selected' : ''}`}
            onClick={() => handleBinderItemSelect(binder.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleBinderItemSelect(binder.id);
              }
            }}
            role="button"
            tabIndex={0}
            title={t('binder.selectBinder')}
          >
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
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleBinderNameSave}
                  title={t('binder.save')}
                >
                  ✓
                </button>
                <button
                  className="binder-edit-action-btn binder-edit-cancel-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleBinderNameCancel}
                  title={t('binder.cancel')}
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="binder-menu-item-content">
                <span className="binder-menu-item-text">{binder.name}</span>
                {cloudEnabled && onSaveBinderToCloud && (
                  <span className="binder-menu-cloud-controls">
                    {binder.shared ? (
                      // Benimle paylaşılan binder: sahibi + yetkiyi göster, paylaş butonu yok
                      <span
                        className="binder-menu-cloud-badge binder-menu-cloud-badge--shared"
                        title={`${t('binder.sharedBinder')} · @${binder.ownerUsername || '?'} · ${
                          binder.role === 'view' ? t('share.roleView') : t('share.roleEdit')
                        }`}
                      >
                        {binder.role === 'view' ? '👁' : '👥'} @{binder.ownerUsername || '?'}
                      </span>
                    ) : cloudBinderIds?.has(binder.id) ? (
                      <>
                        <span className="binder-menu-cloud-badge" title={t('binder.cloudSaved')}>
                          ☁️ {t('binder.cloudSavedShort')}
                        </span>
                        {onShareBinder && (
                          <button
                            type="button"
                            className="binder-menu-cloud-share-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShareBinder(binder.id);
                            }}
                            title={t('share.shareBinder')}
                          >
                            ↗ {t('share.shareShort')}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="binder-menu-cloud-save-btn"
                        disabled={savingBinderIds?.has(binder.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSaveBinderToCloud(binder.id);
                        }}
                        title={t('binder.saveToCloud')}
                      >
                        {savingBinderIds?.has(binder.id) ? '⟳' : '☁'} {t('binder.saveToCloudShort')}
                      </button>
                    )}
                  </span>
                )}
                <div className="binder-menu-item-actions">
                  {!(binder.shared && binder.role === 'view') && (
                    <button
                      className="binder-menu-action-btn binder-menu-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBinderId(binder.id);
                        setEditingBinderName(binder.name);
                      }}
                      title={t('binder.renameBinder')}
                    >
                      ✎
                    </button>
                  )}
                  {binders.length > 1 && (
                    <button
                      className="binder-menu-action-btn binder-menu-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const confirmKey = binder.shared
                          ? 'binder.leaveSharedConfirm'
                          : 'binder.deleteBinderConfirm';
                        if (window.confirm(t(confirmKey))) {
                          onDeleteBinder && onDeleteBinder(binder.id);
                          setShowBinderMenu(false);
                        }
                      }}
                      title={binder.shared ? t('binder.leaveShared') : t('binder.deleteBinder')}
                    >
                      {binder.shared ? '⏏' : '🗑'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className={`settings-bar${mobileSettingsExpanded ? ' settings-bar--expanded' : ''}${
        readOnly ? ' settings-bar--read-only' : ''
      }`}
    >
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

      {onToggleFooter && (
        <div className="setting-item">
          <button
            type="button"
            className={`footer-toggle-btn ${footerVisible ? 'footer-toggle-btn--on' : 'footer-toggle-btn--off'}`}
            onClick={onToggleFooter}
            title={footerVisible ? t('footer.hideFooter') : t('footer.showFooter')}
            aria-pressed={footerVisible}
          >
            <span className="footer-toggle-glyph" aria-hidden="true" />
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
        
        {/* Binder menüsü — masaüstü: dropdown */}
        {showBinderMenu && !isMobileLayout && renderBinderMenu()}
      </div>

      {/* Buluta kaydet: kaydedilmemiş değişiklik varsa aktif */}
      {cloudSaveState && (
        <div className="setting-item">
          <button
            type="button"
            className={`settings-control action-button cloud-save-now-btn cloud-save-now-btn--${cloudSaveState}`}
            disabled={cloudSaveState !== 'dirty'}
            onClick={() => onCloudSaveNow && onCloudSaveNow()}
            title={
              cloudSaveState === 'dirty'
                ? t('binder.unsavedChanges')
                : cloudSaveState === 'saving'
                  ? t('binder.saving')
                  : t('binder.allSaved')
            }
            aria-live="polite"
          >
            {cloudSaveState === 'dirty' ? '💾 ' : cloudSaveState === 'saving' ? '⟳ ' : '✓ '}
            <span className="cloud-save-now-label">
              {cloudSaveState === 'dirty'
                ? t('binder.saveNow')
                : cloudSaveState === 'saving'
                  ? t('binder.saving')
                  : t('binder.saved')}
            </span>
          </button>
        </div>
      )}

      <div className="setting-item settings-add-page-mobile">
        <button
          className="settings-control action-button settings-add-page-btn"
          onClick={() => onAddPage()}
          disabled={!gridSize || readOnly}
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
      {/* Görünüm: zarf tipi + renkler tek modalda */}
      <div className="setting-item">
        <button
          type="button"
          className="settings-control icon-button appearance-btn"
          onClick={() => setShowAppearanceModal(true)}
          title={t('settings.appearanceHelp')}
        >
          🎨
          <span className="icon-button-label">{t('settings.appearance')}</span>
          <span className="appearance-btn-swatches" aria-hidden="true">
            <i style={{ backgroundColor: normalizeHex(binderColor) }} />
            <i style={{ backgroundColor: normalizeHex(ringColor) }} />
            <i style={{ backgroundColor: normalizeHex(containerColor) }} />
          </span>
        </button>
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
            if (value === '') {
              onGridSizeChange('2x2');
            } else if (isValidGridSize(value)) {
              onGridSizeChange(normalizeGridSizeInput(value));
            } else {
              onGridSizeChange('2x2');
            }
          }}
          placeholder="2x2 / 3-2 / 2-3-2"
          className="settings-control grid-input"
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
        <button
          type="button"
          className="settings-control icon-button gallery-settings-btn"
          onClick={() => setShowGallerySettingsModal(true)}
          title={t('settings.gallerySettingsHelp')}
        >
          🖼️
          <span className="icon-button-label">{t('settings.gallerySettings')}</span>
          {galleryUrls.length > 0 && (
            <span className="gallery-settings-count">{galleryUrls.length}</span>
          )}
          {defaultBackImage && (
            <span className="gallery-settings-back-indicator" title={t('settings.backImageHelp')}>✓</span>
          )}
        </button>
      </div>
      
      <div className="setting-item settings-add-page-desktop">
        <button
          className="settings-control action-button"
          onClick={() => onAddPage()}
          disabled={!gridSize || readOnly}
        >
          {t('settings.addPage')}
        </button>
      </div>

      </div>

      {/* Görünüm modalı: zarf tipi + renkler */}
      {showAppearanceModal && createPortal(
        <div
          className={isMobileLayout ? 'gallery-settings-overlay' : 'back-image-modal-overlay'}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAppearanceModal(false);
            }
          }}
        >
          <div
            className={isMobileLayout ? 'gallery-settings-panel' : 'back-image-modal-content gallery-settings-modal-content'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gallery-settings-panel-header">
              <span className="gallery-settings-header-spacer" aria-hidden="true" />
              <h3>{t('settings.appearance')}</h3>
              <button
                type="button"
                className="gallery-settings-panel-close"
                onClick={() => setShowAppearanceModal(false)}
                aria-label={t('binder.cancel')}
              >
                ×
              </button>
            </div>
            <div className="gallery-settings-modal-body appearance-body">
              <div className="appearance-row">
                <label className="appearance-row-label" htmlFor="appearance-binder-type">
                  {t('settings.binderType')}
                </label>
                <select
                  id="appearance-binder-type"
                  value={binderType}
                  onChange={(e) => onBinderTypeChange && onBinderTypeChange(e.target.value)}
                  className="settings-control compact-select appearance-type-select"
                  title={t('settings.tipHelp')}
                >
                  <option value="leather">{t('binderType.leather')}</option>
                  <option value="transparent">{t('binderType.transparent')}</option>
                  <option value="denim">{t('binderType.denim')}</option>
                </select>
              </div>
              <div className="appearance-divider" role="separator" />
              {renderColorRow('binder', binderColor, onColorChange, 'settings.binder')}
              {renderColorRow('ring', ringColor, onRingColorChange, 'settings.ring')}
              {renderColorRow('background', containerColor, onContainerColorChange, 'settings.background')}
              {renderColorRow('gridStitch', gridStitchColor, onGridStitchColorChange, 'settings.gridStitch')}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Galeri ayarları modal */}
      {showGallerySettingsModal && createPortal(
        <div
          className={isMobileLayout ? 'gallery-settings-overlay' : 'back-image-modal-overlay'}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeGallerySettingsModal();
            }
          }}
        >
          <div
            className={isMobileLayout ? 'gallery-settings-panel' : 'back-image-modal-content gallery-settings-modal-content'}
            onClick={(e) => e.stopPropagation()}
          >
            {showBackImageGallery ? (
              <>
                <div className="gallery-settings-panel-header">
                  <button
                    type="button"
                    className="gallery-settings-back-btn"
                    onClick={() => setShowBackImageGallery(false)}
                    aria-label={t('settings.galleryBack')}
                  >
                    ←
                  </button>
                  <h3>{t('settings.selectFromGallery')}</h3>
                  {renderGalleryHeaderActions(closeGallerySettingsModal)}
                </div>
                <GalleryWithFolders
                  embedded
                  variant="back-image"
                  items={galleryUrls}
                  onSelect={handleBackImageGallerySelect}
                  binderUsedImages={binderUsedImages}
                  stateContext={GALLERY_UI_CONTEXT.BACK_CUSTOM}
                  binderId={selectedBinderId}
                  onDownloadControls={handleGalleryDownloadControls}
                />
              </>
            ) : showBackImageDefaultGallery ? (
              <>
                <div className="gallery-settings-panel-header">
                  <button
                    type="button"
                    className="gallery-settings-back-btn"
                    onClick={() => setShowBackImageDefaultGallery(false)}
                    aria-label={t('settings.galleryBack')}
                  >
                    ←
                  </button>
                  <h3>{t('settings.selectFromDefaultGallery') || 'Select from Default Gallery'}</h3>
                  {renderGalleryHeaderActions(closeGallerySettingsModal)}
                </div>
                <GalleryWithFolders
                  embedded
                  variant="back-image"
                  items={defaultGalleryUrls}
                  onSelect={handleBackImageDefaultGallerySelect}
                  binderUsedImages={binderUsedImages}
                  stateContext={GALLERY_UI_CONTEXT.BACK_DEFAULT}
                  onDownloadControls={handleGalleryDownloadControls}
                />
              </>
            ) : showBackImageOptions ? (
              <>
                <div className="gallery-settings-panel-header">
                  <button
                    type="button"
                    className="gallery-settings-back-btn"
                    onClick={() => {
                      setShowBackImageOptions(false);
                      setShowBackImageUrlInput(false);
                      setBackImageUrlInput('');
                    }}
                    aria-label={t('settings.galleryBack')}
                  >
                    ←
                  </button>
                  <h3>{t('settings.backImageHelp')}</h3>
                  <button
                    type="button"
                    className="gallery-settings-panel-close"
                    onClick={closeGallerySettingsModal}
                  >
                    ×
                  </button>
                </div>
                <div className="back-image-modal-options">
                  <input
                    ref={backImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBackImageSelect}
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="back-image-modal-option"
                    onClick={handleBackImageFileClick}
                  >
                    📷 {t('settings.uploadFile')}
                  </button>
                  <button
                    type="button"
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
                      type="button"
                      className="back-image-modal-option"
                      onClick={() => setShowBackImageGallery(true)}
                    >
                      🖼️ {t('settings.selectFromGallery')}
                    </button>
                  )}
                  {defaultGalleryUrls.length > 0 && (
                    <button
                      type="button"
                      className="back-image-modal-option"
                      onClick={() => setShowBackImageDefaultGallery(true)}
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
                        type="button"
                        className="back-image-url-btn"
                        onClick={handleBackImageUrlSubmit}
                        title={t('settings.apply')}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
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
            ) : (
              <>
                <div className="gallery-settings-panel-header">
                  <span className="gallery-settings-header-spacer" aria-hidden="true" />
                  <h3>{t('settings.gallerySettings')}</h3>
                  <button
                    type="button"
                    className="gallery-settings-panel-close"
                    onClick={closeGallerySettingsModal}
                  >
                    ×
                  </button>
                </div>
                <div className="gallery-settings-modal-body">
                  <div className="gallery-settings-section">
                    <label className="gallery-settings-label" htmlFor="gallery-image-input-mode">
                      {t('settings.imageInputMode')}
                    </label>
                    <select
                      id="gallery-image-input-mode"
                      value={imageInputMode}
                      onChange={(e) => onImageInputModeChange && onImageInputModeChange(e.target.value)}
                      className="settings-control image-input-select gallery-settings-select"
                      title={t('settings.imageInputModeHelp')}
                    >
                      <option value="file">📷 {t('settings.uploadFile')}</option>
                      <option value="url">🔗 {t('settings.enterUrl')}</option>
                      {galleryUrls.length > 0 && <option value="gallery">🖼️ {t('settings.selectFromGallery')}</option>}
                      <option value="defaultGallery">⭐ {t('settings.selectFromDefaultGallery') || 'Select from Default Gallery'}</option>
                    </select>
                    {galleryUrls.length > 0 && (
                      <p className="gallery-settings-hint">
                        {t('settings.galleryCount', { count: galleryUrls.length })}
                      </p>
                    )}
                  </div>

                  <div className="gallery-settings-section">
                    <span className="gallery-settings-label">{t('settings.loadTextFile')}</span>
                    <input
                      ref={textFileInputRef}
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleTextFileSelect}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="back-image-modal-option gallery-settings-action-btn"
                      onClick={() => textFileInputRef.current?.click()}
                      title={t('settings.loadTextFileHelp')}
                    >
                      📄 {t('settings.loadTextFile')}
                    </button>
                    <p className="gallery-settings-hint">{t('settings.loadTextFileHelp')}</p>
                  </div>

                  <div className="gallery-settings-section">
                    <label className="gallery-settings-label" htmlFor="gallery-drive-folder-input">
                      {t('settings.driveGalleryLabel')}
                    </label>
                    <input
                      id="gallery-drive-folder-input"
                      type="url"
                      className="settings-control drive-gallery-input drive-gallery-input--full"
                      value={driveFolderInput}
                      onChange={(e) => setDriveFolderInput(e.target.value)}
                      onKeyDown={handleDriveGalleryKeyDown}
                      placeholder={t('settings.driveGalleryPlaceholder')}
                      title={t('settings.driveGalleryHelp')}
                      disabled={driveGalleryLoading}
                      aria-label={t('settings.driveGalleryPlaceholder')}
                    />
                    <button
                      type="button"
                      className="back-image-modal-option gallery-settings-action-btn drive-gallery-load-btn"
                      onClick={handleDriveGalleryLoad}
                      disabled={driveGalleryLoading || !driveFolderInput.trim()}
                      title={t('settings.driveGalleryHelp')}
                    >
                      {driveGalleryLoading ? '…' : `📁 ${t('settings.driveGalleryLoad')}`}
                    </button>
                    <p className="gallery-settings-hint">{t('settings.driveGalleryHelp')}</p>
                  </div>

                  <div className="gallery-settings-section gallery-settings-section--back-image">
                    <span className="gallery-settings-label">{t('settings.backImage')}</span>
                    <div className="back-image-controls">
                      <button
                        type="button"
                        className="settings-control icon-button"
                        onClick={() => {
                          setShowBackImageUrlInput(false);
                          setBackImageUrlInput('');
                          setShowBackImageOptions(true);
                        }}
                        title={t('settings.backImageHelp')}
                      >
                        {defaultBackImage ? '✓' : '📷'}
                      </button>
                      {defaultBackImage && (
                        <button
                          type="button"
                          className="settings-control icon-button remove-button"
                          onClick={() => onDefaultBackImageChange && onDefaultBackImageChange(null)}
                          title={t('settings.remove')}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

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
              <h3>{
                colorPickerType === 'binder' ? t('settings.binder')
                  : colorPickerType === 'ring' ? t('settings.ring')
                  : colorPickerType === 'gridStitch' ? t('settings.gridStitch')
                  : t('settings.background')
              }</h3>
              <button
                className="color-picker-close"
                onClick={() => setShowColorPicker(false)}
              >
                ×
              </button>
            </div>
            <div className="color-picker-body">
              <div className="color-picker-preview" style={{ backgroundColor: normalizeHex(colorPickerValue) }} />
              <div className="color-picker-main">
                <HexColorPicker
                  color={normalizeHex(colorPickerValue)}
                  onChange={setColorPickerValue}
                  className="color-picker-wheel"
                />
              </div>
              <div className="color-picker-presets" role="listbox" aria-label={t('settings.customColor')}>
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`color-picker-preset${normalizeHex(colorPickerValue) === preset ? ' color-picker-preset--active' : ''}`}
                    style={{ backgroundColor: preset }}
                    onClick={() => setColorPickerValue(preset)}
                    aria-label={preset}
                  />
                ))}
              </div>
              <div className="color-picker-custom">
                <label htmlFor="color-picker-hex-input">{t('settings.customColor')}</label>
                <input
                  id="color-picker-hex-input"
                  type="text"
                  value={colorPickerValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      setColorPickerValue(value.toUpperCase());
                    }
                  }}
                  placeholder="#000000"
                  className="color-picker-hex-input"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="color-picker-actions">
                <button
                  type="button"
                  className="color-picker-btn color-picker-btn-cancel"
                  onClick={() => setShowColorPicker(false)}
                >
                  {t('binder.cancel')}
                </button>
                <button
                  type="button"
                  className="color-picker-btn color-picker-btn-apply"
                  onClick={applyColorPicker}
                >
                  {t('settings.apply')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Binder menüsü dışına tıklandığında kapat — masaüstü */}
      {showBinderMenu && !isMobileLayout && (
        <div
          className="binder-menu-backdrop"
          onClick={() => setShowBinderMenu(false)}
        />
      )}

      {/* Binder menüsü — mobil: tam panel */}
      {showBinderMenu && isMobileLayout && createPortal(
        <div
          className="binder-menu-mobile-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBinderMenu(false);
            }
          }}
        >
          <div className="binder-menu-mobile-panel" onClick={(e) => e.stopPropagation()}>
            <div className="binder-menu-mobile-header">
              <h3>{t('binder.selectBinder')}</h3>
              <button
                type="button"
                className="binder-menu-mobile-close"
                onClick={() => setShowBinderMenu(false)}
                aria-label={t('binder.cancel')}
              >
                ×
              </button>
            </div>
            {renderBinderMenu('binder-menu--mobile')}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SettingsBar;
