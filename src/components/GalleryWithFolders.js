import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import {
  GALLERY_ALL_KEY,
  getGalleryFolderList,
  getItemFileLabel,
  truncateGalleryName,
} from '../utils/galleryParse';
import { isGalleryItemInBinder } from '../utils/binderImages';
import {
  loadGalleryUiState,
  saveGalleryUiState,
  validateSavedFolder,
} from '../utils/galleryUiState';
import './GalleryFolders.css';

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
}) => {
  const { language } = useLanguage();
  const t = (key, params) => {
    let translation = getTranslation(key, language);
    if (params) {
      Object.keys(params).forEach((param) => {
        translation = translation.replace(`{${param}}`, params[param]);
      });
    }
    return translation;
  };
  const untitledLabel = t('settings.galleryUntitledFile');
  const allLabel = t('settings.galleryAll');

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateRestored, setStateRestored] = useState(false);

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
    const q = searchTerm.trim().toLowerCase();
    if (!q) return folderList;
    return folderList.filter((f) => f.name.toLowerCase().includes(q));
  }, [folderList, searchTerm]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return displayItems;
    return displayItems.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(q);
      const fileMatch =
        selectedFolder === GALLERY_ALL_KEY &&
        item.fileLabel.toLowerCase().includes(q);
      return nameMatch || fileMatch;
    });
  }, [displayItems, searchTerm, selectedFolder]);

  const isBackImage = variant === 'back-image';
  const prefix = isBackImage ? 'back-image-gallery' : 'gallery';
  const inBinderLabel = t('settings.galleryInBinder');

  const handleSelectFolder = (folderKey) => {
    setSelectedFolder(folderKey);
    setSearchTerm('');
  };

  const handleBackToFolders = () => {
    setSelectedFolder(null);
    setSearchTerm('');
  };

  const handleItemClick = (e, item) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(e, item.raw);
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
    <div className={isBackImage ? 'back-image-gallery-grid' : 'gallery-grid'}>
      {filteredItems.map((item, index) => {
        const displayName = truncateGalleryName(item.name);
        const showFileBadge =
          selectedFolder === GALLERY_ALL_KEY && item.fileLabel;
        const isInBinder = isGalleryItemInBinder(item.raw, binderUsedImages);
        const itemTitle = [
          item.name || `Gallery ${index + 1}`,
          isInBinder ? inBinderLabel : null,
        ]
          .filter(Boolean)
          .join(' — ');

        return (
          <div
            key={`${item.url}-${index}`}
            className={[
              isBackImage ? 'back-image-gallery-item' : 'gallery-item',
              isInBinder ? 'gallery-item--in-binder' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(e) => handleItemClick(e, item)}
            onMouseDown={(e) => e.stopPropagation()}
            title={itemTitle}
          >
            {isInBinder && (
              <span className="gallery-item-in-binder-badge" title={inBinderLabel}>
                ✓
              </span>
            )}
            <img
              src={item.url}
              alt={item.name || `Gallery ${index + 1}`}
              draggable="false"
              onError={(e) => {
                e.target.style.display = 'none';
                const err = e.target.nextElementSibling;
                if (err?.classList?.contains(`${prefix}-item-error`)) {
                  err.style.display = 'flex';
                }
              }}
              onLoad={(e) => {
                e.target.style.display = 'block';
              }}
            />
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
              {t('settings.imageLoadError')}
            </div>
          </div>
        );
      })}
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
          onClick={(e) => {
            e.stopPropagation();
            handleSelectFolder(folder.name);
          }}
        >
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
      {selectedFolder === null ? renderFolderList() : renderImageGrid()}
    </>
  );
};

export default GalleryWithFolders;
