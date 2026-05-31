import React, { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import {
  GALLERY_ALL_KEY,
  getGalleryFolderList,
  getItemFileLabel,
  truncateGalleryName,
} from '../utils/galleryParse';
import './GalleryFolders.css';

const GalleryWithFolders = ({
  items = [],
  onSelect,
  variant = 'gallery',
  title,
  onClose,
  embedded = false,
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

        return (
          <div
            key={`${item.url}-${index}`}
            className={isBackImage ? 'back-image-gallery-item' : 'gallery-item'}
            onClick={(e) => handleItemClick(e, item)}
            onMouseDown={(e) => e.stopPropagation()}
            title={item.name || `Gallery ${index + 1}`}
          >
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
