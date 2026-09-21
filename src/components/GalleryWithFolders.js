import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { getTranslation } from '../utils/translations';
import {
  GALLERY_ALL_KEY,
  getGalleryFolderList,
  getItemFileLabel,
  truncateGalleryName,
  matchesGallerySearch,
} from '../utils/galleryParse';
import { isGalleryItemInBinder } from '../utils/binderImages';
import {
  loadGalleryUiState,
  saveGalleryUiState,
  validateSavedFolder,
} from '../utils/galleryUiState';
import { downloadGalleryImage, downloadGalleryZip } from '../utils/galleryDownload';
import { trackEvent } from '../utils/analytics';
import LazyGalleryImage from './LazyGalleryImage';
import './GalleryFolders.css';

const GALLERY_BATCH_SIZE = 48;

const fill = (text, params) =>
  Object.entries(params || {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), text);

/** Tek galeri kutucuğu — indirme state'i yerel; diğerleri yeniden render olmaz */
const GalleryTile = memo(function GalleryTile({
  item,
  index,
  isBackImage,
  showFileBadge,
  isInBinder,
  inBinderLabel,
  imageLoadErrorLabel,
  downloadLabel,
  onSelect,
  onDownloaded,
  onDownloadFailed,
}) {
  const [busy, setBusy] = useState(false);
  const imgWrapRef = useRef(null);
  const prefix = isBackImage ? 'back-image-gallery' : 'gallery';
  const displayName = truncateGalleryName(item.name);
  const itemTitle = [item.name || `Gallery ${index + 1}`, isInBinder ? inBinderLabel : null]
    .filter(Boolean)
    .join(' — ');

  const handleImageError = (e) => {
    e.target.style.display = 'none';
    const err = e.target.parentElement?.querySelector(`.${prefix}-item-error`);
    if (err) err.style.display = 'flex';
  };

  const handleImageLoad = (e) => {
    e.target.style.display = 'block';
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const imgEl = imgWrapRef.current?.querySelector('img') || null;
      await downloadGalleryImage(item, index, imgEl);
      onDownloaded?.();
    } catch {
      onDownloadFailed?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        isBackImage ? 'back-image-gallery-item' : 'gallery-item',
        isInBinder ? 'gallery-item--in-binder' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onSelect(e, item.raw);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={itemTitle}
    >
      {isInBinder && (
        <span className="gallery-item-in-binder-badge" title={inBinderLabel}>
          ✓
        </span>
      )}
      <button
        type="button"
        className={`gallery-item-download${busy ? ' gallery-item-download--busy' : ''}`}
        onClick={handleDownload}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={busy}
        title={downloadLabel}
        aria-label={downloadLabel}
      >
        {busy ? '…' : '↓'}
      </button>
      <div className="gallery-item-media" ref={imgWrapRef}>
        <LazyGalleryImage
          src={item.url}
          alt={item.name || `Gallery ${index + 1}`}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      </div>
      {(item.name || showFileBadge) && (
        <div
          className={isBackImage ? 'back-image-gallery-item-name' : 'gallery-item-name'}
          title={item.name || item.fileLabel}
        >
          {showFileBadge && (
            <span className="gallery-item-file-badge">{item.fileLabel}</span>
          )}
          {item.name && <span>{displayName}</span>}
        </div>
      )}
      <div
        className={isBackImage ? 'back-image-gallery-item-error' : 'gallery-item-error'}
        style={{ display: 'none' }}
      >
        {imageLoadErrorLabel}
      </div>
    </div>
  );
});

const GalleryWithFolders = ({
  items = [],
  onSelect,
  variant = 'gallery',
  title,
  onClose,
  embedded = false,
  binderUsedImages = null,
  stateContext = 'default',
  binderId = null,
  onDownloadControls = null,
}) => {
  const { language } = useLanguage();
  const { notify } = useToast();
  const t = useCallback(
    (key, params) => fill(getTranslation(key, language), params),
    [language]
  );
  const untitledLabel = t('settings.galleryUntitledFile');
  const allLabel = t('settings.galleryAll');

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateRestored, setStateRestored] = useState(false);
  const [visibleCount, setVisibleCount] = useState(GALLERY_BATCH_SIZE);
  const [zipBusy, setZipBusy] = useState(false);
  const gridRef = useRef(null);
  const loadMoreRef = useRef(null);
  const onDownloadControlsRef = useRef(onDownloadControls);
  onDownloadControlsRef.current = onDownloadControls;

  const normalizedItems = useMemo(
    () =>
      items.map((item) => {
        const url = typeof item === 'string' ? item : item.url;
        const name = typeof item === 'string' ? '' : item.name || '';
        const fileLabel = getItemFileLabel(item, untitledLabel);
        return { url, name, fileLabel, raw: item };
      }),
    [items, untitledLabel]
  );

  const folderList = useMemo(
    () => getGalleryFolderList(items, untitledLabel),
    [items, untitledLabel]
  );

  useEffect(() => {
    if (stateRestored || items.length === 0) return;

    const saved = loadGalleryUiState(stateContext, binderId);
    const validFolder = validateSavedFolder(saved.selectedFolder, folderList);
    setSelectedFolder(validFolder);
    setSearchTerm(saved.searchTerm || '');
    setStateRestored(true);
  }, [items, folderList, stateContext, binderId, stateRestored]);

  useEffect(() => {
    if (!stateRestored) return;
    saveGalleryUiState(stateContext, binderId, { selectedFolder, searchTerm });
  }, [selectedFolder, searchTerm, stateContext, binderId, stateRestored]);

  const displayItems = useMemo(() => {
    if (selectedFolder === null) return [];
    if (selectedFolder === GALLERY_ALL_KEY) return normalizedItems;
    return normalizedItems.filter((item) => item.fileLabel === selectedFolder);
  }, [selectedFolder, normalizedItems]);

  const filteredFolders = useMemo(() => {
    if (!searchTerm.trim()) return folderList;
    return folderList.filter((f) => matchesGallerySearch(f.name, searchTerm));
  }, [folderList, searchTerm]);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return displayItems;
    return displayItems.filter((item) => {
      const nameMatch = matchesGallerySearch(item.name, searchTerm);
      const fileMatch =
        selectedFolder === GALLERY_ALL_KEY &&
        matchesGallerySearch(item.fileLabel, searchTerm);
      return nameMatch || fileMatch;
    });
  }, [displayItems, searchTerm, selectedFolder]);

  useEffect(() => {
    setVisibleCount(GALLERY_BATCH_SIZE);
    if (gridRef.current) {
      gridRef.current.scrollTop = 0;
    }
  }, [selectedFolder, searchTerm]);

  useEffect(() => {
    const root = gridRef.current;
    const sentinel = loadMoreRef.current;
    if (!root || !sentinel || visibleCount >= filteredItems.length) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) =>
            Math.min(count + GALLERY_BATCH_SIZE, filteredItems.length)
          );
        }
      },
      { root, rootMargin: '500px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredItems.length, visibleCount]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const zipName = useMemo(() => {
    if (selectedFolder === null) return 'gallery';
    if (selectedFolder === GALLERY_ALL_KEY) return 'gallery-all';
    return selectedFolder;
  }, [selectedFolder]);

  const filteredItemsRef = useRef(filteredItems);
  filteredItemsRef.current = filteredItems;
  const zipNameRef = useRef(zipName);
  zipNameRef.current = zipName;

  const handleZipDownload = useCallback(async () => {
    if (zipBusy || filteredItemsRef.current.length === 0) return;
    setZipBusy(true);
    try {
      const result = await downloadGalleryZip(filteredItemsRef.current, {
        zipName: zipNameRef.current,
      });
      if (result.ok === 0) {
        notify({ kind: 'error', text: t('settings.galleryDownloadFailed') });
      } else if (result.failed > 0) {
        notify({
          kind: 'warning',
          text: t('settings.galleryZipPartial', {
            ok: result.ok,
            failed: result.failed,
          }),
        });
      } else {
        notify({
          kind: 'success',
          text: t('settings.galleryZipSuccess', { count: result.ok }),
        });
      }
      trackEvent('zip_download', { count: result.ok });
    } catch {
      notify({ kind: 'error', text: t('settings.galleryDownloadFailed') });
    } finally {
      setZipBusy(false);
    }
  }, [zipBusy, notify, t]);

  const handleZipDownloadRef = useRef(handleZipDownload);
  handleZipDownloadRef.current = handleZipDownload;

  // Embedded header ZIP: cleanup'ta null atma → buton flash olmasın
  useEffect(() => {
    const publish = onDownloadControlsRef.current;
    if (!publish) return undefined;
    const canZip = selectedFolder !== null && filteredItems.length > 0;
    publish({
      canZip,
      count: filteredItems.length,
      busy: zipBusy,
      downloadZip: () => handleZipDownloadRef.current(),
    });
    return undefined;
  }, [selectedFolder, filteredItems.length, zipBusy]);

  useEffect(
    () => () => {
      onDownloadControlsRef.current?.(null);
    },
    []
  );

  const onDownloaded = useCallback(() => {
    notify({ kind: 'success', text: t('settings.galleryImageDownloaded') });
    trackEvent('image_download');
  }, [notify, t]);

  const onDownloadFailed = useCallback(() => {
    notify({ kind: 'error', text: t('settings.galleryDownloadFailed') });
  }, [notify, t]);

  const getFolderAccentHue = (folderName) => {
    let hash = 0;
    for (let i = 0; i < folderName.length; i += 1) {
      hash = folderName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hues = [330, 280, 220, 185, 155, 45, 15, 260];
    return hues[Math.abs(hash) % hues.length];
  };

  const isBackImage = variant === 'back-image';
  const inBinderLabel = t('settings.galleryInBinder');
  const downloadLabel = t('settings.galleryImageDownload');
  const imageLoadErrorLabel = t('settings.imageLoadError');

  const handleSelectFolder = (folderKey) => {
    setSelectedFolder(folderKey);
    setSearchTerm('');
  };

  const handleBackToFolders = () => {
    setSelectedFolder(null);
    setSearchTerm('');
  };

  const zipButton = (className = 'gallery-zip-btn') => {
    if (selectedFolder === null || filteredItems.length === 0) return null;
    return (
      <button
        type="button"
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          handleZipDownload();
        }}
        disabled={zipBusy}
        title={t('settings.galleryZipDownload', { count: filteredItems.length })}
        aria-label={t('settings.galleryZipDownload', { count: filteredItems.length })}
      >
        {zipBusy ? '…' : '↓'}
        <span className="gallery-zip-btn-count">{filteredItems.length}</span>
      </button>
    );
  };

  const searchInput = (
    <>
      {selectedFolder !== null && (
        <button
          type="button"
          className="gallery-folder-back"
          onClick={(e) => {
            e.stopPropagation();
            handleBackToFolders();
          }}
        >
          ← {t('settings.galleryBackToFolders')}
        </button>
      )}
      <input
        type="text"
        className={isBackImage ? 'back-image-gallery-search-input' : 'gallery-search-input'}
        placeholder={
          selectedFolder === null
            ? t('settings.searchFolders')
            : t('settings.searchGallery')
        }
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {searchTerm && (
        <button
          type="button"
          className={
            isBackImage ? 'gallery-folder-search-clear-embedded' : 'gallery-search-clear'
          }
          onClick={(e) => {
            e.stopPropagation();
            setSearchTerm('');
          }}
          title={t('settings.clear')}
        >
          ×
        </button>
      )}
    </>
  );

  const searchBlock = isBackImage ? (
    <div className="back-image-gallery-search gallery-folder-search-embedded">
      {searchInput}
    </div>
  ) : (
    <div className="gallery-search-container">
      <div className="gallery-search-wrapper">{searchInput}</div>
    </div>
  );

  const renderImageGrid = () => (
    <div
      ref={gridRef}
      className={isBackImage ? 'back-image-gallery-grid' : 'gallery-grid'}
    >
      {visibleItems.map((item, index) => (
        <GalleryTile
          key={`${item.url}-${index}`}
          item={item}
          index={index}
          isBackImage={isBackImage}
          showFileBadge={selectedFolder === GALLERY_ALL_KEY && Boolean(item.fileLabel)}
          isInBinder={isGalleryItemInBinder(item.raw, binderUsedImages)}
          inBinderLabel={inBinderLabel}
          imageLoadErrorLabel={imageLoadErrorLabel}
          downloadLabel={downloadLabel}
          onSelect={onSelect}
          onDownloaded={onDownloaded}
          onDownloadFailed={onDownloadFailed}
        />
      ))}
      {visibleCount < filteredItems.length && (
        <div
          ref={loadMoreRef}
          className="gallery-load-more-sentinel"
          aria-hidden="true"
        />
      )}
    </div>
  );

  const renderFolderList = () => (
    <div className="gallery-folder-grid">
      <button
        type="button"
        className="gallery-folder-card gallery-folder-card--all"
        onClick={(e) => {
          e.stopPropagation();
          handleSelectFolder(GALLERY_ALL_KEY);
        }}
      >
        <span className="gallery-folder-card-icon" aria-hidden="true">✦</span>
        <span className="gallery-folder-card-name">{allLabel}</span>
        <span className="gallery-folder-card-count">
          {t('settings.galleryCount', { count: normalizedItems.length })}
        </span>
      </button>
      {filteredFolders.map((folder) => (
        <button
          key={folder.name}
          type="button"
          className="gallery-folder-card"
          style={{ '--folder-accent': `${getFolderAccentHue(folder.name)}` }}
          onClick={(e) => {
            e.stopPropagation();
            handleSelectFolder(folder.name);
          }}
        >
          <span className="gallery-folder-card-tab" aria-hidden="true" />
          <span className="gallery-folder-card-icon" aria-hidden="true">📁</span>
          <span className="gallery-folder-card-name" title={folder.name}>
            {folder.name}
          </span>
          <span className="gallery-folder-card-count">
            {t('settings.galleryCount', { count: folder.count })}
          </span>
        </button>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <>
        {searchBlock}
        {selectedFolder === null ? renderFolderList() : renderImageGrid()}
      </>
    );
  }

  return (
    <>
      <div className="gallery-header">
        <h3>
          {selectedFolder === null
            ? title
            : selectedFolder === GALLERY_ALL_KEY
              ? allLabel
              : selectedFolder}
        </h3>
        {searchBlock}
        <div className="gallery-header-actions">
          {zipButton()}
          {onClose && (
            <button
              type="button"
              className="gallery-close"
              onClick={onClose}
              title={t('binder.cancel')}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {selectedFolder === null ? renderFolderList() : renderImageGrid()}
    </>
  );
};

export default GalleryWithFolders;
