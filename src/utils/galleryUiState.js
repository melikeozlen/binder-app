import { GALLERY_ALL_KEY } from './galleryParse';

const STORAGE_KEY = 'binder-gallery-ui-state';

export const GALLERY_UI_CONTEXT = {
  DEFAULT: 'default',
  CUSTOM: 'custom',
  BACK_DEFAULT: 'backDefault',
  BACK_CUSTOM: 'backCustom',
};

const getStateKey = (contextId, binderId = null) => {
  if (contextId === GALLERY_UI_CONTEXT.CUSTOM || contextId === GALLERY_UI_CONTEXT.BACK_CUSTOM) {
    return binderId ? `${contextId}:${binderId}` : contextId;
  }
  return contextId;
};

const loadAllStates = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveAllStates = (states) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch (error) {
    console.error('Galeri arayüz durumu kaydedilemedi:', error);
  }
};

export const loadGalleryUiState = (contextId, binderId = null) => {
  const key = getStateKey(contextId, binderId);
  const states = loadAllStates();
  const saved = states[key];
  if (!saved || typeof saved !== 'object') {
    return { selectedFolder: null, searchTerm: '' };
  }
  return {
    selectedFolder: saved.selectedFolder ?? null,
    searchTerm: saved.searchTerm || '',
  };
};

export const saveGalleryUiState = (contextId, binderId, { selectedFolder, searchTerm }) => {
  const key = getStateKey(contextId, binderId);
  const states = loadAllStates();
  states[key] = {
    selectedFolder: selectedFolder ?? null,
    searchTerm: searchTerm || '',
  };
  saveAllStates(states);
};

export const validateSavedFolder = (folder, folderList) => {
  if (folder === null || folder === undefined) return null;
  if (folder === GALLERY_ALL_KEY) return GALLERY_ALL_KEY;
  if (folderList.some((entry) => entry.name === folder)) return folder;
  return null;
};
