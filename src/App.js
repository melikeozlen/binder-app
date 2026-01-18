import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './App.css';
import SettingsBar from './components/SettingsBar';
import PageOrderBar from './components/PageOrderBar';
import Binder from './components/Binder';
import Footer from './components/Footer';
import { useLanguage } from './contexts/LanguageContext';
import { getTranslation } from './utils/translations';
import {
  saveImageToIndexedDB,
  loadImageFromIndexedDB,
  removeImageFromIndexedDB,
  removeAllImagesForBinder,
  saveDefaultBackImageToIndexedDB,
  loadDefaultBackImageFromIndexedDB,
  removeDefaultBackImageFromIndexedDB,
  migrateImagesFromLocalStorage,
  cleanupAllImagesFromLocalStorage
} from './utils/indexedDB.js';

// Binder yönetimi için localStorage helper fonksiyonları
const BINDERS_LIST_KEY = 'binders-list';
const SELECTED_BINDER_KEY = 'selected-binder-id';

// Binder listesini yükle
const loadBindersList = () => {
  try {
    const saved = localStorage.getItem(BINDERS_LIST_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Binder listesi yüklenirken hata:', e);
  }
  return [];
};

// Binder listesini kaydet
const saveBindersList = (binders) => {
  try {
    localStorage.setItem(BINDERS_LIST_KEY, JSON.stringify(binders));
  } catch (e) {
    console.error('Binder listesi kaydedilirken hata:', e);
  }
};

// Seçili binder ID'sini yükle
const loadSelectedBinderId = () => {
  try {
    return localStorage.getItem(SELECTED_BINDER_KEY);
  } catch (e) {
    console.error('Seçili binder ID yüklenirken hata:', e);
  }
  return null;
};

// Seçili binder ID'sini kaydet
const saveSelectedBinderId = (binderId) => {
  try {
    if (binderId) {
      localStorage.setItem(SELECTED_BINDER_KEY, binderId);
    } else {
      localStorage.removeItem(SELECTED_BINDER_KEY);
    }
  } catch (e) {
    console.error('Seçili binder ID kaydedilirken hata:', e);
  }
};

// Binder için key prefix oluştur
const getBinderKeyPrefix = (binderId) => {
  return `binder-${binderId}-`;
};

// Eski localStorage verilerini yeni sisteme migrate et
const migrateToMultiBinder = async () => {
  try {
    // Eğer zaten binder listesi varsa, migration yapma
    const existingBinders = loadBindersList();
    if (existingBinders.length > 0) {
      return;
    }

    // Eski verileri kontrol et
    const oldPagesList = localStorage.getItem('binder-pages-list');
    const oldSettings = localStorage.getItem('binder-settings');
    
    if (oldPagesList || oldSettings) {
      // Yeni bir binder oluştur ve eski verileri ona taşı
      const defaultBinderId = `binder-${Date.now()}`;
      const defaultBinderName = 'Binder 1';
      
      // Binder listesine ekle
      const newBinder = {
        id: defaultBinderId,
        name: defaultBinderName,
        createdAt: Date.now()
      };
      saveBindersList([newBinder]);
      saveSelectedBinderId(defaultBinderId);
      
      // Eski sayfa listesini yeni key'e taşı
      if (oldPagesList) {
        localStorage.setItem(`${getBinderKeyPrefix(defaultBinderId)}pages-list`, oldPagesList);
        localStorage.removeItem('binder-pages-list');
      }
      
      // Eski ayarları yeni key'e taşı
      if (oldSettings) {
        localStorage.setItem(`${getBinderKeyPrefix(defaultBinderId)}settings`, oldSettings);
        localStorage.removeItem('binder-settings');
      }
      
      // Eski sayfa verilerini yeni key'lere taşı
      const pageIds = oldPagesList ? JSON.parse(oldPagesList) : [];
      pageIds.forEach(pageId => {
        const oldPageKey = `binder-page-${pageId}`;
        const oldPageData = localStorage.getItem(oldPageKey);
        if (oldPageData) {
          localStorage.setItem(`${getBinderKeyPrefix(defaultBinderId)}page-${pageId}`, oldPageData);
          localStorage.removeItem(oldPageKey);
        }
      });
      
      // Eski resim verilerini IndexedDB'ye taşı (localStorage'a değil!)
      const imageKeys = [];
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key) && key.startsWith('binder-image-')) {
          imageKeys.push(key);
        }
      }
      // Resimleri IndexedDB'ye taşı
      await Promise.all(imageKeys.map(async (oldImageKey) => {
        const imageData = localStorage.getItem(oldImageKey);
        if (imageData && imageData.startsWith('data:image')) {
          try {
            // Resim key'ini çıkar
            const imageKey = oldImageKey.replace('binder-image-', '');
            // IndexedDB'ye kaydet
            await saveImageToIndexedDB(imageKey, imageData, defaultBinderId);
            // localStorage'dan sil
            localStorage.removeItem(oldImageKey);
          } catch (e) {
            console.error(`Resim ${oldImageKey} migration sırasında hata:`, e);
          }
        }
      }));
      
      // Eski galeri URL'lerini yeni key'e taşı
      const oldGalleryUrls = localStorage.getItem('binder-gallery-urls');
      if (oldGalleryUrls) {
        localStorage.setItem(`${getBinderKeyPrefix(defaultBinderId)}gallery-urls`, oldGalleryUrls);
        localStorage.removeItem('binder-gallery-urls');
      }
      
      // Eski default back image'ı IndexedDB'ye taşı (localStorage'a değil!)
      const oldDefaultBackImage = localStorage.getItem('binder-default-back-image');
      if (oldDefaultBackImage && oldDefaultBackImage.startsWith('data:image')) {
        try {
          await saveDefaultBackImageToIndexedDB(oldDefaultBackImage, defaultBinderId);
          localStorage.removeItem('binder-default-back-image');
        } catch (e) {
          console.error('Default back image migration sırasında hata:', e);
        }
      }
      
      console.log('Eski veriler yeni binder sistemine taşındı:', defaultBinderId);
    }
  } catch (e) {
    console.error('Migration sırasında hata:', e);
  }
};

// localStorage helper fonksiyonları
const loadSettings = (binderId) => {
  try {
    const key = binderId ? `${getBinderKeyPrefix(binderId)}settings` : 'binder-settings';
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Ayarlar yüklenirken hata:', e);
  }
  return null;
};

const saveSettings = (settings, binderId) => {
  try {
    // defaultBackImage'ı localStorage'a kaydetme (büyük olabilir)
    const settingsToSave = { ...settings };
    delete settingsToSave.defaultBackImage;
    const key = binderId ? `${getBinderKeyPrefix(binderId)}settings` : 'binder-settings';
    localStorage.setItem(key, JSON.stringify(settingsToSave));
  } catch (e) {
    console.error('Ayarlar kaydedilirken hata:', e);
  }
};

// Galeri URL'lerini localStorage'dan yükle
const loadGalleryUrls = (binderId) => {
  try {
    const key = binderId ? `${getBinderKeyPrefix(binderId)}gallery-urls` : 'binder-gallery-urls';
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Eski format (sadece URL array) için migration
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        return parsed.map(url => ({ url, name: '' }));
      }
      return parsed;
    }
  } catch (e) {
    console.error('Galeri URL\'leri yüklenirken hata:', e);
  }
  return [];
};

// Galeri URL'lerini localStorage'a kaydet
const saveGalleryUrls = (urls, binderId) => {
  try {
    const key = binderId ? `${getBinderKeyPrefix(binderId)}gallery-urls` : 'binder-gallery-urls';
    localStorage.setItem(key, JSON.stringify(urls));
  } catch (e) {
    console.error('Galeri URL\'leri kaydedilirken hata:', e);
  }
};

// Varsayılan arka plan resmini IndexedDB'den yükle
const loadDefaultBackImage = async (binderId) => {
  try {
    // Önce IndexedDB'den dene
    const imageData = await loadDefaultBackImageFromIndexedDB(binderId);
    if (imageData) {
      return imageData;
    }
    
    // IndexedDB'de yoksa localStorage'dan dene (geriye dönük uyumluluk için - sadece migration sırasında)
    const key = binderId ? `${getBinderKeyPrefix(binderId)}default-back-image` : 'binder-default-back-image';
    const localStorageData = localStorage.getItem(key);
    if (localStorageData && localStorageData.startsWith('data:image')) {
      // localStorage'dan IndexedDB'ye taşı ve localStorage'dan sil
      try {
        await saveDefaultBackImageToIndexedDB(localStorageData, binderId);
        localStorage.removeItem(key);
      } catch (e) {
        console.error('Default back image migration sırasında hata:', e);
      }
      return localStorageData;
    }
    
    return null;
  } catch (e) {
    console.error('Varsayılan arka plan resmi yüklenirken hata:', e);
    return null;
  }
};

// Varsayılan arka plan resmini IndexedDB'ye kaydet
const saveDefaultBackImage = async (imageData, binderId) => {
  try {
    if (imageData) {
      // Resim çok büyükse uyarı ver (IndexedDB'de limit çok daha yüksek)
      const imageSize = imageData.length;
      const maxSize = 5 * 1024 * 1024; // 5MB max (IndexedDB için daha yüksek limit)
      
      if (imageSize > maxSize) {
        console.warn(`Varsayılan arka plan resmi çok büyük (${(imageSize / 1024 / 1024).toFixed(2)}MB), sıkıştırılmalı.`);
      }
      
      // IndexedDB'ye kaydet
      await saveDefaultBackImageToIndexedDB(imageData, binderId);
      
      // localStorage'dan da sil (artık kullanmıyoruz)
      const key = binderId ? `${getBinderKeyPrefix(binderId)}default-back-image` : 'binder-default-back-image';
      localStorage.removeItem(key);
    } else {
      // Resim null ise IndexedDB'den sil
      await removeDefaultBackImageFromIndexedDB(binderId);
      
      // localStorage'dan da sil
      const key = binderId ? `${getBinderKeyPrefix(binderId)}default-back-image` : 'binder-default-back-image';
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.error('Varsayılan arka plan resmi kaydedilirken hata:', e);
  }
};

// Eski localStorage'dan defaultBackImage'ı temizle (migration)
const cleanupDefaultBackImage = () => {
  try {
    const saved = localStorage.getItem('binder-settings');
    if (saved) {
      const settings = JSON.parse(saved);
      if (settings.defaultBackImage) {
        // defaultBackImage'ı kaldır ve kaydet
        delete settings.defaultBackImage;
        localStorage.setItem('binder-settings', JSON.stringify(settings));
        console.log('Eski defaultBackImage localStorage\'dan temizlendi');
      }
    }
  } catch (e) {
    console.error('defaultBackImage temizlenirken hata:', e);
  }
};

// Tek bir sayfayı localStorage'dan yükle
const loadPage = async (pageId, binderId) => {
  // Önce yeni formatı dene (resimler ayrı key'lerde)
  const page = await loadPageWithSeparateImages(pageId, binderId);
  if (page) {
    return page;
  }
  
  // Eski formatı dene (geriye dönük uyumluluk)
  try {
    const key = binderId ? `${getBinderKeyPrefix(binderId)}page-${pageId}` : `binder-page-${pageId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const pageData = JSON.parse(saved);
      return {
        id: pageData.id,
        cover: pageData.cover || 'right',
        isCover: pageData.isCover || false,
        gridSize: pageData.gridSize || '2x2',
        content: pageData.content || {},
        backContent: pageData.backContent || {},
        rotatedImages: pageData.rotatedImages || {},
        transparent: pageData.transparent !== undefined ? pageData.transparent : false
      };
    }
  } catch (e) {
    console.error(`Sayfa ${pageId} yüklenirken hata:`, e);
  }
  return null;
};

// localStorage boyutunu kontrol et (yaklaşık 5MB limit)
const getLocalStorageSize = () => {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length + key.length;
    }
  }
  return total;
};

// localStorage'ın kullanılabilir alanını tahmin et - Şu an kullanılmıyor
// eslint-disable-next-line no-unused-vars
const getAvailableLocalStorageSpace = () => {
  try {
    // Test için küçük bir veri ekle
    const testKey = '__localStorage_test__';
    const testValue = 'test';
    localStorage.setItem(testKey, testValue);
    localStorage.removeItem(testKey);
    
    // Tahmini limit: 5MB (5 * 1024 * 1024 bytes)
    // Her karakter 1 byte, ama base64 encoding için 4/3 katı
    const estimatedLimit = 5 * 1024 * 1024; // 5MB
    const currentSize = getLocalStorageSize();
    return estimatedLimit - currentSize;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      return 0;
    }
    return 5 * 1024 * 1024; // Varsayılan limit
  }
};

// localStorage kullanım yüzdesini hesapla
const getLocalStorageUsagePercent = () => {
  const estimatedLimit = 5 * 1024 * 1024; // 5MB
  const currentSize = getLocalStorageSize();
  return (currentSize / estimatedLimit) * 100;
};

// Resim limitleri
const MAX_PAGES = 50; // Maksimum sayfa sayısı

// Resimleri IndexedDB'ye kaydet (sayfa verisini küçük tutmak için)
const saveImageToStorage = async (imageKey, imageData, binderId) => {
  try {
    const imageSize = imageData.length;
    
    // Resim çok büyükse uyarı ver (IndexedDB'de limit çok daha yüksek ama yine de uyarı verelim)
    const maxImageSize = 5 * 1024 * 1024; // 5MB max per image (IndexedDB için daha yüksek limit)
    if (imageSize > maxImageSize) {
      console.warn(`Resim ${imageKey} çok büyük (${(imageSize / 1024 / 1024).toFixed(2)}MB), daha fazla sıkıştırılmalı.`);
    }
    
    // IndexedDB'ye kaydet
    await saveImageToIndexedDB(imageKey, imageData, binderId);
  } catch (e) {
    console.error(`Resim ${imageKey} IndexedDB'ye kaydedilemedi:`, e);
    throw e;
  }
};

// Resmi IndexedDB'den yükle
const loadImageFromStorage = async (imageKey, binderId) => {
  try {
    // Önce IndexedDB'den dene
    const imageData = await loadImageFromIndexedDB(imageKey, binderId);
    if (imageData) {
      return imageData;
    }
    
    // IndexedDB'de yoksa localStorage'dan dene (geriye dönük uyumluluk için - sadece migration sırasında)
    const key = binderId ? `${getBinderKeyPrefix(binderId)}image-${imageKey}` : `binder-image-${imageKey}`;
    const localStorageData = localStorage.getItem(key);
    if (localStorageData && localStorageData.startsWith('data:image')) {
      // localStorage'dan IndexedDB'ye taşı ve localStorage'dan sil
      try {
        await saveImageToIndexedDB(imageKey, localStorageData, binderId);
        localStorage.removeItem(key);
      } catch (e) {
        console.error(`Resim ${imageKey} migration sırasında hata:`, e);
      }
      return localStorageData;
    }
    
    return null;
  } catch (e) {
    console.error(`Resim ${imageKey} yüklenirken hata:`, e);
    return null;
  }
};

// Resmi IndexedDB'den sil
const removeImageFromStorage = async (imageKey, binderId) => {
  try {
    // IndexedDB'den sil
    await removeImageFromIndexedDB(imageKey, binderId);
    
    // localStorage'dan da sil (geriye dönük uyumluluk için)
    const key = binderId ? `${getBinderKeyPrefix(binderId)}image-${imageKey}` : `binder-image-${imageKey}`;
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`Resim ${imageKey} silinirken hata:`, e);
  }
};

// Otomatik localStorage temizleme (kullanıcıya uyarı göstermeden) - Şu an kullanılmıyor
// eslint-disable-next-line no-unused-vars
const autoCleanupLocalStorage = (binderId, aggressive = false) => {
  try {
    const usagePercent = getLocalStorageUsagePercent();
    const targetPercent = aggressive ? 70 : 80; // Agresif modda %70'e, normalde %80'e düşür
    
    if (usagePercent < targetPercent) {
      return; // Zaten yeterli alan var
    }
    
    if (!binderId) return; // Binder ID yoksa temizleme yapma
    
    // Tüm sayfa ID'lerini al
    const pagesListKey = `${getBinderKeyPrefix(binderId)}pages-list`;
    const pagesList = localStorage.getItem(pagesListKey);
    if (!pagesList) return;
    
    const pageIds = JSON.parse(pagesList);
    const usedImageKeys = new Set();
    const imagePrefix = getBinderKeyPrefix(binderId);
    
    // Kullanılan resim referanslarını topla
    pageIds.forEach(pageId => {
      try {
        const pageDataKey = `${imagePrefix}page-${pageId}`;
        const pageData = localStorage.getItem(pageDataKey);
        if (pageData) {
          const page = JSON.parse(pageData);
          const content = page.content || {};
          const backContent = page.backContent || {};
          
          Object.values(content).forEach(value => {
            if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
              usedImageKeys.add(value.replace('__IMAGE_REF__', ''));
            }
          });
          
          Object.values(backContent).forEach(value => {
            if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
              usedImageKeys.add(value.replace('__IMAGE_REF__', ''));
            }
          });
        }
      } catch (e) {
        console.error(`Sayfa ${pageId} yüklenirken hata:`, e);
      }
    });
    
    // Tüm resim key'lerini bul ve kullanılmayanları topla
    const allImageKeys = [];
    const imageKeyPrefix = `${imagePrefix}image-`;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key) && key.startsWith(imageKeyPrefix)) {
        const imageKey = key.replace(imageKeyPrefix, '');
        if (!usedImageKeys.has(imageKey)) {
          const imageData = localStorage.getItem(key);
          if (imageData) {
            allImageKeys.push({
              key: imageKey,
              fullKey: key,
              size: imageData.length,
              timestamp: parseInt(imageKey.split('-')[0]) || 0 // Sayfa ID'den timestamp çıkar
            });
          }
        }
      }
    }
    
    // Kullanılmayan resimleri boyuta göre sırala (büyükten küçüğe)
    allImageKeys.sort((a, b) => b.size - a.size);
    
    // En büyük kullanılmayan resimleri sil
    let freedSpace = 0;
    const targetSize = (5 * 1024 * 1024) * (targetPercent / 100); // Hedef boyut
    const currentSize = getLocalStorageSize();
    const needToFree = currentSize - targetSize;
    
    for (let i = 0; i < allImageKeys.length && freedSpace < needToFree; i++) {
      removeImageFromStorage(allImageKeys[i].key, binderId);
      freedSpace += allImageKeys[i].size;
    }
    
    // Agresif modda ve hala yeterli alan yoksa, en eski resimleri de sil
    if (aggressive && getLocalStorageUsagePercent() >= 85) {
      // Kullanılan resimleri de timestamp'e göre sırala
      const usedImages = [];
      usedImageKeys.forEach(imageKey => {
        const imageData = loadImageFromStorage(imageKey, binderId);
        if (imageData) {
          usedImages.push({
            key: imageKey,
            fullKey: `${imageKeyPrefix}${imageKey}`,
            size: imageData.length,
            timestamp: parseInt(imageKey.split('-')[0]) || 0
          });
        }
      });
      
      // En eski resimleri sırala (timestamp'e göre)
      usedImages.sort((a, b) => a.timestamp - b.timestamp);
      
      // En eski %10 resmi sil (agresif temizleme)
      const toDelete = Math.ceil(usedImages.length * 0.1);
      for (let i = 0; i < toDelete && getLocalStorageUsagePercent() >= 80; i++) {
        removeImageFromStorage(usedImages[i].key, binderId);
      }
    }
  } catch (e) {
    console.error('Otomatik temizleme sırasında hata:', e);
  }
};

// Sayfadaki kullanılmayan resimleri temizle
const cleanupUnusedImages = async (pageId, newContentRefs, newBackContentRefs, binderId) => {
  try {
    // Eski sayfa verisini yükle
    const key = binderId ? `${getBinderKeyPrefix(binderId)}page-${pageId}` : `binder-page-${pageId}`;
    const oldPageData = localStorage.getItem(key);
    if (!oldPageData) return;
    
    const oldPage = JSON.parse(oldPageData);
    const oldContent = oldPage.content || {};
    const oldBackContent = oldPage.backContent || {};
    
    // Eski content'teki resim referanslarını topla
    const oldImageKeys = new Set();
    Object.values(oldContent).forEach(value => {
      if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
        const imageKey = value.replace('__IMAGE_REF__', '');
        oldImageKeys.add(imageKey);
      }
    });
    
    Object.values(oldBackContent).forEach(value => {
      if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
        const imageKey = value.replace('__IMAGE_REF__', '');
        oldImageKeys.add(imageKey);
      }
    });
    
    // Yeni content'teki resim referanslarını topla
    const newImageKeys = new Set();
    Object.values(newContentRefs).forEach(value => {
      if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
        const imageKey = value.replace('__IMAGE_REF__', '');
        newImageKeys.add(imageKey);
      }
    });
    
    Object.values(newBackContentRefs).forEach(value => {
      if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
        const imageKey = value.replace('__IMAGE_REF__', '');
        newImageKeys.add(imageKey);
      }
    });
    
    // Kullanılmayan resimleri sil
    for (const imageKey of oldImageKeys) {
      if (!newImageKeys.has(imageKey)) {
        await removeImageFromStorage(imageKey, binderId);
      }
    }
  } catch (e) {
    console.error(`Sayfa ${pageId} için resim temizleme sırasında hata:`, e);
  }
};

// Sayfa içeriğindeki resimleri ayrı key'lere kaydet ve referansları değiştir
const savePageWithSeparateImages = async (page, binderId) => {
  try {
    // Content'teki resimleri ayrı key'lere kaydet
    const contentWithRefs = {};
    for (const key of Object.keys(page.content || {})) {
      const value = page.content[key];
      if (value && typeof value === 'string' && value.startsWith('data:image')) {
        // Bu bir resim, ayrı key'e kaydet
        const imageKey = `${page.id}-content-${key}`;
        try {
          await saveImageToStorage(imageKey, value, binderId);
          // Referans olarak sakla
          contentWithRefs[key] = `__IMAGE_REF__${imageKey}`;
        } catch (e) {
          // Kaydedilemediyse, küçük resimler için orijinal değeri sakla
          const imageSize = value.length;
          if (imageSize < 50 * 1024) { // 50KB'den küçükse direkt kaydet
            contentWithRefs[key] = value;
          } else {
            console.warn(`Resim ${imageKey} kaydedilemedi, atlandı.`);
            contentWithRefs[key] = null;
          }
        }
      } else {
        contentWithRefs[key] = value;
      }
    }
    
    // BackContent'teki resimleri ayrı key'lere kaydet
    const backContentWithRefs = {};
    for (const key of Object.keys(page.backContent || {})) {
      const value = page.backContent[key];
      if (value && typeof value === 'string' && value.startsWith('data:image')) {
        // Bu bir resim, ayrı key'e kaydet
        const imageKey = `${page.id}-back-${key}`;
        try {
          await saveImageToStorage(imageKey, value, binderId);
          // Referans olarak sakla
          backContentWithRefs[key] = `__IMAGE_REF__${imageKey}`;
        } catch (e) {
          // Kaydedilemediyse, küçük resimler için orijinal değeri sakla
          const imageSize = value.length;
          if (imageSize < 50 * 1024) { // 50KB'den küçükse direkt kaydet
            backContentWithRefs[key] = value;
          } else {
            console.warn(`Resim ${imageKey} kaydedilemedi, atlandı.`);
            backContentWithRefs[key] = null;
          }
        }
      } else {
        backContentWithRefs[key] = value;
      }
    }
    
    // Sayfa verisini referanslarla kaydet
    const pageData = {
      id: page.id,
      cover: page.cover || 'right',
      isCover: page.isCover || false,
      gridSize: page.gridSize || '2x2',
      content: contentWithRefs,
      backContent: backContentWithRefs,
      rotatedImages: page.rotatedImages || {},
      transparent: page.transparent !== undefined ? page.transparent : false,
      order: page.order !== undefined ? page.order : page.id // Eski sayfalar için ID'yi order olarak kullan
    };
    
    // Önce eski resimleri temizle (sayfada artık kullanılmayan resimler)
    await cleanupUnusedImages(page.id, contentWithRefs, backContentWithRefs, binderId);
    
    const pageDataString = JSON.stringify(pageData);
    
    // Her sayfa için ayrı key'e kaydet
    const pageKey = binderId ? `${getBinderKeyPrefix(binderId)}page-${page.id}` : `binder-page-${page.id}`;
    try {
      localStorage.setItem(pageKey, pageDataString);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.error('localStorage dolu! Sayfa kaydedilemedi.');
        throw e;
      } else {
        throw e;
      }
    }
  } catch (e) {
    console.error(`Sayfa ${page.id} kaydedilirken hata:`, e);
    if (e.name === 'QuotaExceededError') {
      console.error('localStorage dolu! Bazı veriler kaydedilemedi.');
      alert('localStorage dolu! Bazı veriler kaydedilemedi. Lütfen bazı resimleri silin veya tarayıcı verilerini temizleyin.');
    }
  }
};

// Sayfa verisini yükle ve resim referanslarını geri yükle
const loadPageWithSeparateImages = async (pageId, binderId) => {
  try {
    const key = binderId ? `${getBinderKeyPrefix(binderId)}page-${pageId}` : `binder-page-${pageId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const pageData = JSON.parse(saved);
      
      // Content'teki referansları geri yükle
      const content = {};
      for (const key of Object.keys(pageData.content || {})) {
        const value = pageData.content[key];
        // Null değerleri atla (kaydedilmemiş resimler)
        if (value === null) {
          continue;
        }
        if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
          // Bu bir referans, resmi yükle
          const imageKey = value.replace('__IMAGE_REF__', '');
          const imageData = await loadImageFromStorage(imageKey, binderId);
          if (imageData) {
            content[key] = imageData;
          }
        } else if (value) {
          content[key] = value;
        }
      }
      
      // BackContent'teki referansları geri yükle
      const backContent = {};
      for (const key of Object.keys(pageData.backContent || {})) {
        const value = pageData.backContent[key];
        // Null değerleri atla (kaydedilmemiş resimler)
        if (value === null) {
          continue;
        }
        if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
          // Bu bir referans, resmi yükle
          const imageKey = value.replace('__IMAGE_REF__', '');
          const imageData = await loadImageFromStorage(imageKey, binderId);
          if (imageData) {
            backContent[key] = imageData;
          }
        } else if (value) {
          backContent[key] = value;
        }
      }
      
      return {
        id: pageData.id,
        cover: pageData.cover || 'right',
        isCover: pageData.isCover || false,
        gridSize: pageData.gridSize || '2x2',
        content: content,
        backContent: backContent,
        rotatedImages: pageData.rotatedImages || {},
        transparent: pageData.transparent !== undefined ? pageData.transparent : false,
        order: pageData.order !== undefined ? pageData.order : pageData.id // Eski sayfalar için ID'yi order olarak kullan
      };
    }
  } catch (e) {
    console.error(`Sayfa ${pageId} yüklenirken hata:`, e);
  }
  return null;
};

// Tek bir sayfayı localStorage'a kaydet
const savePage = async (page, binderId) => {
  // Resimleri ayrı key'lere kaydet
  await savePageWithSeparateImages(page, binderId);
};

// Tüm sayfaları localStorage'dan yükle - her sayfa için ayrı key'den
const loadAllPages = async (binderId) => {
  try {
    if (!binderId) return [];
    
    // Sayfa listesini yükle
    const pagesListKey = `${getBinderKeyPrefix(binderId)}pages-list`;
    const savedList = localStorage.getItem(pagesListKey);
    if (savedList) {
      const pageIds = JSON.parse(savedList);
      // Her sayfayı ayrı key'den yükle
      const pagePromises = pageIds.map(id => loadPage(id, binderId));
      let pages = (await Promise.all(pagePromises)).filter(Boolean);
      
      // Eğer sayfalarda order yoksa, ID'ye göre sıralayıp order ekle (migration)
      let hasOrder = pages.some(p => p.order !== undefined);
      if (!hasOrder && pages.length > 0) {
        // Önce ID'ye göre sırala
        const sortedForMigration = [...pages].sort((a, b) => a.id - b.id);
        // Sonra 0'dan başlayarak order ekle
        pages = sortedForMigration.map((page, index) => ({
          ...page,
          order: index + 1
        }));
        // Order'ı kaydet
        await Promise.all(pages.map(page => savePage(page, binderId)));
      }
      
      return pages;
    }
  } catch (e) {
    console.error('Sayfalar yüklenirken hata:', e);
  }
  return [];
};

// Tüm sayfaları localStorage'a kaydet - her sayfa için ayrı key'e
const saveAllPages = async (pages, binderId) => {
  try {
    if (!binderId) return;
    
    // Her sayfayı ayrı key'e kaydet
    await Promise.all(pages.map(page => savePage(page, binderId)));
    
    // Sayfa listesini kaydet (sadece ID'ler)
    const pageIds = pages.map(p => p.id);
    const pagesListKey = `${getBinderKeyPrefix(binderId)}pages-list`;
    localStorage.setItem(pagesListKey, JSON.stringify(pageIds));
  } catch (e) {
    console.error('Sayfalar kaydedilirken hata:', e);
    if (e.name === 'QuotaExceededError') {
      console.error('localStorage dolu! Bazı veriler kaydedilemedi.');
    }
  }
};

function App() {
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
  
  // Migration: Eski verileri yeni sisteme taşı
  useEffect(() => {
    const runMigrations = async () => {
      // Önce multi-binder migration'ı yap (resimleri IndexedDB'ye taşır)
      await migrateToMultiBinder();
      cleanupDefaultBackImage();
      
      // IndexedDB'ye migration yap (tüm binder'lar için)
      const bindersList = loadBindersList();
      let totalMigrated = 0;
      
      for (const binder of bindersList) {
        const count = await migrateImagesFromLocalStorage(binder.id);
        totalMigrated += count;
      }
      // Default binder için de migration yap
      const defaultCount = await migrateImagesFromLocalStorage(null);
      totalMigrated += defaultCount;
      
      // Migration sonrası localStorage'da kalan tüm resimleri temizle
      const cleanedCount = cleanupAllImagesFromLocalStorage();
      
      if (totalMigrated > 0 || cleanedCount > 0) {
        console.log(`Migration tamamlandı: ${totalMigrated} resim taşındı, ${cleanedCount} resim temizlendi`);
      }
      
      // İlk yüklemede sayfaları ve defaultBackImage'ı yükle
      // selectedBinderId henüz tanımlanmadığı için burada kullanılamaz
      // Bu kısım selectedBinderId tanımlandıktan sonraki useEffect'te yapılacak
    };
    
    runMigrations();
  }, []);

  // Splash screen'i kaldır
  useEffect(() => {
    const splashScreen = document.getElementById('splash-screen');
    if (splashScreen) {
      // Kısa bir gecikme sonrası fade out
      const timer = setTimeout(() => {
        splashScreen.classList.add('hidden');
        // Animasyon bitince DOM'dan kaldır
        setTimeout(() => {
          if (splashScreen.parentNode) {
            splashScreen.parentNode.removeChild(splashScreen);
          }
        }, 500); // fade out animasyon süresi
      }, 800); // 800ms göster
      
      return () => clearTimeout(timer);
    }
  }, []);
  
  // Binder yönetimi
  const [binders, setBinders] = useState(() => {
    const bindersList = loadBindersList();
    if (bindersList.length === 0) {
      // Hiç binder yoksa, yeni bir tane oluştur
      const newBinderId = `binder-${Date.now()}`;
      const newBinder = {
        id: newBinderId,
        name: t('binder.defaultBinderName', { number: 1 }),
        createdAt: Date.now()
      };
      saveBindersList([newBinder]);
      saveSelectedBinderId(newBinderId);
      return [newBinder];
    }
    return bindersList;
  });
  
  const [selectedBinderId, setSelectedBinderId] = useState(() => {
    const saved = loadSelectedBinderId();
    if (saved) {
      // Seçili binder hala listede var mı kontrol et
      const bindersList = loadBindersList();
      if (bindersList.find(b => b.id === saved)) {
        return saved;
      }
    }
    // Seçili binder yoksa veya bulunamazsa, ilk binder'ı seç
    const bindersList = loadBindersList();
    if (bindersList.length > 0) {
      const firstBinderId = bindersList[0].id;
      saveSelectedBinderId(firstBinderId);
      return firstBinderId;
    }
    return null;
  });
  
  // Seçili binder değiştiğinde kaydet
  useEffect(() => {
    if (selectedBinderId) {
      saveSelectedBinderId(selectedBinderId);
    }
  }, [selectedBinderId]);

  // Seçili binder değiştiğinde sayfaları ve defaultBackImage'ı yükle
  useEffect(() => {
    const loadBinderData = async () => {
      if (selectedBinderId) {
        const loadedPages = await loadAllPages(selectedBinderId);
        setPages(loadedPages);
        const loadedDefaultBackImage = await loadDefaultBackImage(selectedBinderId);
        setDefaultBackImage(loadedDefaultBackImage);
      }
    };
    loadBinderData();
  }, [selectedBinderId]);
  
  // localStorage'dan ayarları yükle (seçili binder'a göre)
  const savedSettings = selectedBinderId ? loadSettings(selectedBinderId) : null;
  const [binderColor, setBinderColor] = useState(savedSettings?.binderColor || '#E6E6E6');
  const [ringColor, setRingColor] = useState(savedSettings?.ringColor || '#A0A0A0');
  const [containerColor, setContainerColor] = useState(savedSettings?.containerColor || '#ffffff');
  const [binderType, setBinderType] = useState(savedSettings?.binderType || 'leather');
  const [widthRatio, setWidthRatio] = useState(savedSettings?.widthRatio || 2);
  const [heightRatio, setHeightRatio] = useState(savedSettings?.heightRatio || 1);
  
  // widthRatio ve heightRatio state'lerini string veya number olarak yönetebilmek için
  // localStorage'a kaydederken sayısal değerleri kullan
  const [gridSize, setGridSize] = useState(savedSettings?.gridSize || '2x2');
  const [pageType, setPageType] = useState(savedSettings?.pageType || 'mat');
  const [imageInputMode, setImageInputMode] = useState(savedSettings?.imageInputMode || 'file'); // 'file', 'url' veya 'gallery'
  const [galleryUrls, setGalleryUrls] = useState(() => selectedBinderId ? loadGalleryUrls(selectedBinderId) : []); // Text dosyasından yüklenen URL'ler
  // defaultBackImage IndexedDB'den yükle (async olduğu için başlangıçta null)
  const [defaultBackImage, setDefaultBackImage] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pages, setPages] = useState([]);
  
  // Binder değiştiğinde ayarları ve sayfaları yükle
  useEffect(() => {
    const loadBinderData = async () => {
      if (selectedBinderId) {
        const settings = loadSettings(selectedBinderId);
        if (settings) {
          setBinderColor(settings.binderColor || '#E6E6E6');
          setRingColor(settings.ringColor || '#A0A0A0');
          setContainerColor(settings.containerColor || '#ffffff');
          setBinderType(settings.binderType || 'leather');
          setWidthRatio(settings.widthRatio || 2);
          setHeightRatio(settings.heightRatio || 1);
          setGridSize(settings.gridSize || '2x2');
          setPageType(settings.pageType || 'mat');
          setImageInputMode(settings.imageInputMode || 'file');
        }
        setGalleryUrls(loadGalleryUrls(selectedBinderId));
        const loadedDefaultBackImage = await loadDefaultBackImage(selectedBinderId);
        setDefaultBackImage(loadedDefaultBackImage);
        const loadedPages = await loadAllPages(selectedBinderId);
        setPages(loadedPages);
        setCurrentSpreadIndex(0);
        setSelectedPageIndex(null);
      }
    };
    
    loadBinderData();
  }, [selectedBinderId]);
  // Sayfaları order alanına göre sırala (yoksa ID'ye göre - geriye dönük uyumluluk)
  const sortedPages = useMemo(() => {
    return [...pages].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.id;
      const orderB = b.order !== undefined ? b.order : b.id;
      return orderA - orderB;
    });
  }, [pages]);
  
  // Spread (yaprak çifti) mantığı:
  // Spread 0: left=null (kapak), right=page[0] (front)
  // Spread 1: left=page[0] (back), right=page[1] (front)
  // Spread N: left=page[N-1] (back), right=page[N] (front)
  // Max spread: pages.length (son spread'de sadece sol sayfa var, sağ kapak)
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);
  const maxSpreadIndex = Math.max(0, sortedPages.length); // En fazla pages.length spread olabilir
  
  const [selectedPageIndex, setSelectedPageIndex] = useState(null);
  const [editingGridPageId, setEditingGridPageId] = useState(null);
  const [editingGridSize, setEditingGridSize] = useState('');
  const saveTimeoutRef = useRef(null); // Debounce için timeout ref'i
  
  
  // Mevcut spread'deki sayfaları hesapla
  const currentSpread = useMemo(() => {
    const leftPageIndex = currentSpreadIndex > 0 ? currentSpreadIndex - 1 : null;
    const rightPageIndex = currentSpreadIndex < sortedPages.length ? currentSpreadIndex : null;
    
    return {
      leftPageId: leftPageIndex !== null ? sortedPages[leftPageIndex].id : null,
      rightPageId: rightPageIndex !== null ? sortedPages[rightPageIndex].id : null,
      leftPageIndex,
      rightPageIndex
    };
  }, [currentSpreadIndex, sortedPages]);

  // Ayarları localStorage'a kaydet (defaultBackImage hariç - localStorage'da yer kaplamasın)
  useEffect(() => {
    if (!selectedBinderId) return;
    
    // Boş string değerleri varsayılan değerlerle değiştir
    const widthRatioToSave = widthRatio === '' ? 2 : widthRatio;
    const heightRatioToSave = heightRatio === '' ? 1 : heightRatio;
    
    // defaultBackImage'ı localStorage'a kaydetme (büyük olabilir, sadece state'te tut)
    const settingsToSave = {
      binderColor,
      ringColor,
      widthRatio: widthRatioToSave,
      heightRatio: heightRatioToSave,
      gridSize,
      pageType,
      imageInputMode,
      // defaultBackImage: localStorage'a kaydetme
      containerColor,
      binderType
    };
    
    saveSettings(settingsToSave, selectedBinderId);
  }, [binderColor, ringColor, widthRatio, heightRatio, gridSize, pageType, imageInputMode, containerColor, binderType, selectedBinderId]); // defaultBackImage dependency'den çıkarıldı

  // Sayfaları localStorage'a kaydet - debounce ile optimize edilmiş
  useEffect(() => {
    if (!selectedBinderId) return;
    
    // Önceki timeout'u temizle
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Yeni timeout oluştur - 500ms sonra kaydet (kullanıcı yazmayı bitirdikten sonra)
    saveTimeoutRef.current = setTimeout(async () => {
      if (pages.length > 0) {
        // Tüm sayfaları güncel sırasıyla ve tam detaylı verilerle kaydet
        // Her sayfa için ayrı key'e kaydedilecek
        await saveAllPages(pages, selectedBinderId);
      } else {
        // Sayfa yoksa localStorage'dan temizle
        try {
          const pagesListKey = `${getBinderKeyPrefix(selectedBinderId)}pages-list`;
          localStorage.removeItem(pagesListKey);
        } catch (e) {
          console.error('Sayfa listesi silinirken hata:', e);
        }
      }
    }, 500); // 500ms debounce - kullanıcı yazmayı bitirdikten sonra kaydet
    
    // Cleanup: component unmount olduğunda timeout'u temizle
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [pages, selectedBinderId]);

  const handleColorChange = (color) => {
    setBinderColor(color);
  };

  const handleRingColorChange = (color) => {
    setRingColor(color);
  };

  const handleContainerColorChange = (color) => {
    setContainerColor(color);
  };

  const handleBinderTypeChange = (type) => {
    setBinderType(type);
  };

  const handleWidthRatioChange = (value) => {
    // Boş string'e izin ver (tamamen silip sıfırdan yazabilmek için)
    if (value === '') {
      setWidthRatio('');
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setWidthRatio(numValue);
      }
    }
  };

  const handleHeightRatioChange = (value) => {
    // Boş string'e izin ver (tamamen silip sıfırdan yazabilmek için)
    if (value === '') {
      setHeightRatio('');
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setHeightRatio(numValue);
      }
    }
  };

  const handleGridSizeChange = (value) => {
    // Yazarken geçici olarak geçersiz formatları da kabul et
    // Böylece kullanıcı tamamen silip sıfırdan yazabilir
    // Geçerli format kontrolü onBlur'da yapılacak
    setGridSize(value);
  };

  const handlePageTypeChange = (type) => {
    setPageType(type);
  };

  const handleDefaultBackImageChange = (fileOrUrl) => {
    if (!selectedBinderId) return;
    
    if (fileOrUrl === null || !fileOrUrl) {
      setDefaultBackImage(null);
      saveDefaultBackImage(null, selectedBinderId); // IndexedDB'den sil
      return;
    }
    // Eğer string ise (URL veya base64), direkt kullan
    if (typeof fileOrUrl === 'string') {
      setDefaultBackImage(fileOrUrl);
      saveDefaultBackImage(fileOrUrl, selectedBinderId); // IndexedDB'ye kaydet
      return;
    }
    // Eğer File objesi ise, FileReader ile oku
    if (fileOrUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageData = event.target.result;
        setDefaultBackImage(imageData);
        await saveDefaultBackImage(imageData, selectedBinderId); // IndexedDB'ye kaydet
      };
      reader.onerror = () => {
        console.error('Dosya okuma hatası');
      };
      reader.readAsDataURL(fileOrUrl);
    }
  };
  
  // Binder yönetimi fonksiyonları
  const handleCreateBinder = () => {
    const newBinderId = `binder-${Date.now()}`;
    const binderNumber = binders.length + 1;
    const newBinder = {
      id: newBinderId,
      name: t('binder.defaultBinderName', { number: binderNumber }),
      createdAt: Date.now()
    };
    const updatedBinders = [...binders, newBinder];
    setBinders(updatedBinders);
    saveBindersList(updatedBinders);
    setSelectedBinderId(newBinderId);
  };
  
  const handleDeleteBinder = async (binderId) => {
    if (window.confirm(t('binder.deleteBinderConfirm'))) {
      // Binder'ın tüm verilerini sil
      const prefix = getBinderKeyPrefix(binderId);
      const keysToRemove = [];
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key) && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // IndexedDB'den de tüm resimleri sil
      try {
        await removeAllImagesForBinder(binderId);
        await removeDefaultBackImageFromIndexedDB(binderId);
      } catch (e) {
        console.error('IndexedDB temizleme sırasında hata:', e);
      }
      
      // Binder'ı listeden çıkar
      const updatedBinders = binders.filter(b => b.id !== binderId);
      setBinders(updatedBinders);
      saveBindersList(updatedBinders);
      
      // Eğer silinen binder seçiliyse, başka bir binder seç
      if (selectedBinderId === binderId) {
        if (updatedBinders.length > 0) {
          setSelectedBinderId(updatedBinders[0].id);
        } else {
          // Hiç binder kalmadıysa yeni bir tane oluştur
          handleCreateBinder();
        }
      }
    }
  };
  
  const handleRenameBinder = (binderId, newName) => {
    const updatedBinders = binders.map(b => 
      b.id === binderId ? { ...b, name: newName.trim() || t('binder.defaultBinderName', { number: 1 }) } : b
    );
    setBinders(updatedBinders);
    saveBindersList(updatedBinders);
  };
  
  const handleSelectBinder = (binderId) => {
    setSelectedBinderId(binderId);
  };

  // Spread değiştiğinde selectedPageIndex'i güncelle
  useEffect(() => {
    if (currentSpread.rightPageId) {
      const rightPageIndex = sortedPages.findIndex(p => p.id === currentSpread.rightPageId);
      if (rightPageIndex !== -1) {
        // Array'deki index'i bul (sortedPages değil, pages array'inde)
        const pageIndex = pages.findIndex(p => p.id === currentSpread.rightPageId);
        if (pageIndex !== -1) {
          setSelectedPageIndex(pageIndex);
        }
      }
    } else if (currentSpread.leftPageId) {
      const leftPageIndex = pages.findIndex(p => p.id === currentSpread.leftPageId);
      if (leftPageIndex !== -1) {
        setSelectedPageIndex(leftPageIndex);
      }
    }
  }, [currentSpreadIndex, sortedPages, pages, currentSpread]);

  const handleAddPage = () => {
    if (!gridSize) return;
    
    // Sayfa limiti kontrolü
    if (pages.length >= MAX_PAGES) {
      alert(t('binder.maxPagesReached', { max: MAX_PAGES }));
      return;
    }
    
    // localStorage kullanım kontrolü
    const usagePercent = getLocalStorageUsagePercent();
    if (usagePercent >= 95) {
      alert(t('binder.storageAlmostFull'));
      return;
    }
    
    // Mevcut spread'deki sayfayı bul (sağ sayfa varsa onu, yoksa sol sayfayı kullan)
    const currentPageId = currentSpread.rightPageId || currentSpread.leftPageId;
    
    let newOrder = 1;
    let pagesToUpdate = [...pages];
    
    if (currentPageId && sortedPages.length > 0) {
      // Mevcut sayfanın sıralı listedeki index'ini bul
      const currentPageIndex = sortedPages.findIndex(p => p.id === currentPageId);
      if (currentPageIndex !== -1) {
        // Mevcut sayfanın order'ını al
        const currentPage = sortedPages[currentPageIndex];
        const currentOrder = currentPage.order !== undefined ? currentPage.order : currentPage.id;
        
        // Mevcut sayfanın hemen sonrasına ekle
        // Eğer sonraki sayfa varsa, onun order'ı ile mevcut order arasında bir değer kullan
        if (currentPageIndex < sortedPages.length - 1) {
          const nextPage = sortedPages[currentPageIndex + 1];
          const nextOrder = nextPage.order !== undefined ? nextPage.order : nextPage.id;
          const orderDiff = nextOrder - currentOrder;
          
          // Eğer order farkı çok küçükse (0.01'den küçük), tüm sonraki sayfaları yeniden numaralandır
          if (orderDiff < 0.01) {
            // Tüm sonraki sayfaların order'larını 1 artır
            pagesToUpdate = pagesToUpdate.map(p => {
              const pOrder = p.order !== undefined ? p.order : p.id;
              if (pOrder > currentOrder) {
                return { ...p, order: pOrder + 1 };
              }
              return p;
            });
            newOrder = currentOrder + 1;
          } else {
            // İki order arasında bir değer hesapla (ortada)
            newOrder = currentOrder + orderDiff / 2;
          }
        } else {
          // Son sayfadan sonra ekleniyor
          newOrder = currentOrder + 1;
        }
      }
    } else {
      // Hiç sayfa yoksa veya mevcut sayfa bulunamazsa, sona ekle
      if (sortedPages.length > 0) {
        const lastPage = sortedPages[sortedPages.length - 1];
        const lastOrder = lastPage.order !== undefined ? lastPage.order : lastPage.id;
        newOrder = lastOrder + 1;
      } else {
        newOrder = 1;
      }
    }
    
    // Yeni sayfa için tam detaylı obje oluştur (tüm alanlar dahil)
    const newPage = {
      id: Date.now(),
      cover: 'right',
      isCover: false,
      gridSize: gridSize,
      content: {},
      backContent: {},
      rotatedImages: {},
      transparent: false,
      order: newOrder
    };
    
    // Yeni sayfayı ekle (güncellenmiş sayfalar listesine)
    const newPages = [...pagesToUpdate, newPage];
    setPages(newPages);
    
    // Yeni sayfa eklendiğinde, onu gösteren spread'e geç
    const newSortedPages = [...newPages].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.id;
      const orderB = b.order !== undefined ? b.order : b.id;
      return orderA - orderB;
    });
    const newPageIndex = newSortedPages.findIndex(p => p.id === newPage.id);
    if (newPageIndex !== -1) {
      // Yeni sayfa sağda görünecek spread'e geç
      setCurrentSpreadIndex(newPageIndex);
    }
    
    // Hemen kaydet (yeni sayfa eklendiğinde)
    if (selectedBinderId) {
      saveAllPages(newPages, selectedBinderId).catch(e => {
        console.error('Sayfalar kaydedilirken hata:', e);
      });
    }
  };

  const handleDeletePage = async (pageId) => {
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;
    
    // Sayfayı sil
    const newPages = pages.filter(p => p.id !== pageId);
    setPages(newPages);
    
    // localStorage'dan sayfayı sil ve resimleri IndexedDB'den sil
    try {
      if (selectedBinderId) {
        const pageKey = `${getBinderKeyPrefix(selectedBinderId)}page-${pageId}`;
        const pageDataString = localStorage.getItem(pageKey);
        
        // Sayfa verisinden resim referanslarını bul
        const imageKeysToDelete = [];
        if (pageDataString) {
          try {
            const pageData = JSON.parse(pageDataString);
            const content = pageData.content || {};
            const backContent = pageData.backContent || {};
            
            // Content'teki resim referanslarını bul
            Object.values(content).forEach(value => {
              if (value && typeof value === 'string') {
                if (value.startsWith('__IMAGE_REF__')) {
                  const imageKey = value.replace('__IMAGE_REF__', '');
                  imageKeysToDelete.push(imageKey);
                } else if (value.startsWith('data:image')) {
                  // Eğer direkt base64 ise, key oluştur
                  const key = Object.keys(content).find(k => content[k] === value);
                  if (key) {
                    imageKeysToDelete.push(`${pageId}-content-${key}`);
                  }
                }
              }
            });
            
            // BackContent'teki resim referanslarını bul
            Object.values(backContent).forEach(value => {
              if (value && typeof value === 'string') {
                if (value.startsWith('__IMAGE_REF__')) {
                  const imageKey = value.replace('__IMAGE_REF__', '');
                  imageKeysToDelete.push(imageKey);
                } else if (value.startsWith('data:image')) {
                  // Eğer direkt base64 ise, key oluştur
                  const key = Object.keys(backContent).find(k => backContent[k] === value);
                  if (key) {
                    imageKeysToDelete.push(`${pageId}-back-${key}`);
                  }
                }
              }
            });
          } catch (e) {
            console.error(`Sayfa ${pageId} verisi parse edilemedi:`, e);
          }
        }
        
        // State'teki sayfa verisinden de resim referanslarını kontrol et (ekstra güvenlik için)
        const page = pages[pageIndex];
        if (page) {
          // Content'teki resimleri kontrol et
          Object.values(page.content || {}).forEach(value => {
            if (value && typeof value === 'string') {
              if (value.startsWith('__IMAGE_REF__')) {
                const imageKey = value.replace('__IMAGE_REF__', '');
                if (!imageKeysToDelete.includes(imageKey)) {
                  imageKeysToDelete.push(imageKey);
                }
              } else if (value.startsWith('data:image')) {
                // Direkt base64 ise, key oluştur
                const key = Object.keys(page.content || {}).find(k => page.content[k] === value);
                if (key) {
                  const imageKey = `${pageId}-content-${key}`;
                  if (!imageKeysToDelete.includes(imageKey)) {
                    imageKeysToDelete.push(imageKey);
                  }
                }
              }
            }
          });
          
          // BackContent'teki resimleri kontrol et
          Object.values(page.backContent || {}).forEach(value => {
            if (value && typeof value === 'string') {
              if (value.startsWith('__IMAGE_REF__')) {
                const imageKey = value.replace('__IMAGE_REF__', '');
                if (!imageKeysToDelete.includes(imageKey)) {
                  imageKeysToDelete.push(imageKey);
                }
              } else if (value.startsWith('data:image')) {
                // Direkt base64 ise, key oluştur
                const key = Object.keys(page.backContent || {}).find(k => page.backContent[k] === value);
                if (key) {
                  const imageKey = `${pageId}-back-${key}`;
                  if (!imageKeysToDelete.includes(imageKey)) {
                    imageKeysToDelete.push(imageKey);
                  }
                }
              }
            }
          });
        }
        
        // Tüm resimleri IndexedDB'den sil
        if (imageKeysToDelete.length > 0) {
          await Promise.all(imageKeysToDelete.map(key => removeImageFromStorage(key, selectedBinderId)));
        }
        
        // Sayfa verisini localStorage'dan sil
        localStorage.removeItem(pageKey);
        
        // Sayfa listesini güncelle
        if (newPages.length > 0) {
          const pageIds = newPages.map(p => p.id);
          const pagesListKey = `${getBinderKeyPrefix(selectedBinderId)}pages-list`;
          localStorage.setItem(pagesListKey, JSON.stringify(pageIds));
        } else {
          const pagesListKey = `${getBinderKeyPrefix(selectedBinderId)}pages-list`;
          localStorage.removeItem(pagesListKey);
        }
      }
    } catch (e) {
      console.error(`Sayfa ${pageId} silinirken hata:`, e);
    }
    
    // Seçili sayfa indeksini güncelle
    if (selectedPageIndex !== null) {
      if (selectedPageIndex >= newPages.length) {
        setSelectedPageIndex(newPages.length - 1);
      } else if (selectedPageIndex > pageIndex) {
        setSelectedPageIndex(selectedPageIndex - 1);
      }
    }
    
    // Spread index'ini güncelle (silinen sayfa spread'deyse)
    const newSortedPages = [...newPages].sort((a, b) => a.id - b.id);
    const deletedPageIndex = sortedPages.findIndex(p => p.id === pageId);
    if (deletedPageIndex !== -1) {
      // Silinen sayfa spread'deyse, spread'i ayarla
      if (currentSpreadIndex > deletedPageIndex) {
        // Silinen sayfa mevcut spread'den önceyse, spread index'i azalt
        setCurrentSpreadIndex(prev => Math.max(0, prev - 1));
      } else if (currentSpreadIndex === deletedPageIndex && deletedPageIndex < sortedPages.length - 1) {
        // Silinen sayfa mevcut spread'deyse ve son sayfa değilse, aynı spread'de kal
        // (bir sonraki sayfa sağa geçer)
      } else if (currentSpreadIndex > newSortedPages.length) {
        // Spread index çok büyükse, maksimuma ayarla
        setCurrentSpreadIndex(Math.max(0, newSortedPages.length));
      }
    }
  };

  // Tüm sayfaları sil (resimleri de sil)
  const handleDeleteAllPages = async () => {
    if (pages.length === 0 || !selectedBinderId) return;
    
    if (window.confirm(t('binder.deletePagesConfirm'))) {
      try {
        const prefix = getBinderKeyPrefix(selectedBinderId);
        
        // Tüm sayfaların resimlerini topla ve sil
        const imageKeysToDelete = new Set();
        for (const page of pages) {
          const pageKey = `${prefix}page-${page.id}`;
          const pageDataString = localStorage.getItem(pageKey);
          
          if (pageDataString) {
            try {
              const pageData = JSON.parse(pageDataString);
              const content = pageData.content || {};
              const backContent = pageData.backContent || {};
              
              // Content'teki resim referanslarını bul
              Object.values(content).forEach(value => {
                if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
                  const imageKey = value.replace('__IMAGE_REF__', '');
                  imageKeysToDelete.add(imageKey);
                }
              });
              
              // BackContent'teki resim referanslarını bul
              Object.values(backContent).forEach(value => {
                if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
                  const imageKey = value.replace('__IMAGE_REF__', '');
                  imageKeysToDelete.add(imageKey);
                }
              });
            } catch (e) {
              console.error(`Sayfa ${page.id} verisi parse edilemedi:`, e);
            }
          }
          
          // State'teki sayfa verisinden de kontrol et
          const content = page.content || {};
          const backContent = page.backContent || {};
          Object.values(content).forEach(value => {
            if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
              const imageKey = value.replace('__IMAGE_REF__', '');
              imageKeysToDelete.add(imageKey);
            }
          });
          Object.values(backContent).forEach(value => {
            if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
              const imageKey = value.replace('__IMAGE_REF__', '');
              imageKeysToDelete.add(imageKey);
            }
          });
          
          // Sayfa verisini sil
          localStorage.removeItem(pageKey);
        }
        
        // Tüm resimleri IndexedDB'den sil
        if (imageKeysToDelete.size > 0) {
          await Promise.all(Array.from(imageKeysToDelete).map(key => removeImageFromStorage(key, selectedBinderId)));
        }
        
        // Sayfa listesini sil
        const pagesListKey = `${prefix}pages-list`;
        localStorage.removeItem(pagesListKey);
        
        // State'leri temizle
        setPages([]);
        setSelectedPageIndex(null);
        setCurrentSpreadIndex(0);
      } catch (e) {
        console.error('Sayfalar silinirken hata:', e);
      }
    }
  };

  // Tüm sayfaları tek seferde sil - Şu an kullanılmıyor
  // eslint-disable-next-line no-unused-vars
  const handleResetAllPages = async () => {
    if (pages.length === 0) return;
    
    if (window.confirm(t('binder.resetConfirm'))) {
      // Tüm sayfaları ve resimlerini sil
      try {
        if (!selectedBinderId) return;
        
        const prefix = getBinderKeyPrefix(selectedBinderId);
        
        // Önce tüm sayfaların resimlerini sil
        const imageKeysToDelete = new Set();
        for (const page of pages) {
          // Sayfa verisini yükle (resim referanslarını bulmak için)
          const pageDataKey = `${prefix}page-${page.id}`;
          const pageData = localStorage.getItem(pageDataKey);
          if (pageData) {
            try {
              const pageObj = JSON.parse(pageData);
              const content = pageObj.content || {};
              const backContent = pageObj.backContent || {};
              
              // Content'teki resim referanslarını bul
              Object.values(content).forEach(value => {
                if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
                  const imageKey = value.replace('__IMAGE_REF__', '');
                  imageKeysToDelete.add(imageKey);
                }
              });
              
              // BackContent'teki resim referanslarını bul
              Object.values(backContent).forEach(value => {
                if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
                  const imageKey = value.replace('__IMAGE_REF__', '');
                  imageKeysToDelete.add(imageKey);
                }
              });
            } catch (e) {
              console.error(`Sayfa ${page.id} verisi parse edilemedi:`, e);
            }
          }
          
          // State'teki sayfa verisinden de kontrol et
          const content = page.content || {};
          const backContent = page.backContent || {};
          Object.values(content).forEach(value => {
            if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
              const imageKey = value.replace('__IMAGE_REF__', '');
              imageKeysToDelete.add(imageKey);
            }
          });
          Object.values(backContent).forEach(value => {
            if (value && typeof value === 'string' && value.startsWith('__IMAGE_REF__')) {
              const imageKey = value.replace('__IMAGE_REF__', '');
              imageKeysToDelete.add(imageKey);
            }
          });
          
          // Sayfa verisini sil
          localStorage.removeItem(pageDataKey);
        }
        
        // Tüm resimleri IndexedDB'den sil
        if (imageKeysToDelete.size > 0) {
          await Promise.all(Array.from(imageKeysToDelete).map(key => removeImageFromStorage(key, selectedBinderId)));
        }
        
        // Binder'a ait tüm resimleri de sil (ekstra güvenlik için - kullanılmayan resimler)
        await removeAllImagesForBinder(selectedBinderId);
        
        // Default back image'ı da sil
        await removeDefaultBackImageFromIndexedDB(selectedBinderId);
        
        // Sayfa listesini sil
        const pagesListKey = `${prefix}pages-list`;
        localStorage.removeItem(pagesListKey);
        
        // Galeri URL'lerini temizle
        const galleryUrlsKey = `${prefix}gallery-urls`;
        localStorage.removeItem(galleryUrlsKey);
        
        setDefaultBackImage(null);
        setGalleryUrls([]);
      } catch (e) {
        console.error('Sayfalar silinirken hata:', e);
      }
      
      // State'leri temizle
      setPages([]);
      setSelectedPageIndex(null);
      setCurrentSpreadIndex(0);
    }
  };

  // Sayfa güncellendiğinde hem state'i hem localStorage'ı güncelle
  const handlePageUpdate = (updatedPage) => {
    // Sayfa ID kontrolü - eğer sayfa ID yoksa veya geçersizse güncelleme yapma
    if (!updatedPage || !updatedPage.id) {
      console.warn('Geçersiz sayfa güncellemesi:', updatedPage);
      return;
    }
    
    // pages state'ini güncelle
    setPages(prevPages => {
      // Önce sayfanın var olup olmadığını kontrol et
      const pageIndex = prevPages.findIndex(p => p.id === updatedPage.id);
      if (pageIndex === -1) {
        console.warn(`Sayfa ${updatedPage.id} bulunamadı, güncelleme yapılamıyor`);
        return prevPages;
      }
      
      // Mevcut sayfanın order bilgisini koru
      const currentPage = prevPages[pageIndex];
      const preservedOrder = currentPage.order !== undefined ? currentPage.order : currentPage.id;
      
      // Tüm sayfa verilerini içeren tam bir sayfa objesi oluştur (order bilgisini koru)
      const fullPageData = {
        id: updatedPage.id,
        cover: updatedPage.cover !== undefined ? updatedPage.cover : currentPage.cover || 'right',
        isCover: updatedPage.isCover !== undefined ? updatedPage.isCover : currentPage.isCover || false,
        gridSize: updatedPage.gridSize || currentPage.gridSize || '2x2',
        content: updatedPage.content || {},
        backContent: updatedPage.backContent || {},
        rotatedImages: updatedPage.rotatedImages || {},
        transparent: updatedPage.transparent !== undefined ? updatedPage.transparent : (currentPage.transparent !== undefined ? currentPage.transparent : false),
        order: preservedOrder // Order bilgisini koru
      };
      
      const newPages = prevPages.map(p => 
        p.id === updatedPage.id ? fullPageData : p
      );
      
      // Resim ekleme gibi önemli değişikliklerde hemen kaydet (debounce'u atla)
      // Önceki timeout'u iptal et
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Hemen kaydet - sadece güncellenen sayfayı kaydet
      try {
        if (selectedBinderId) {
          savePage(fullPageData, selectedBinderId).catch(e => {
            console.error('Sayfa kaydedilirken hata:', e);
          });
          // Sayfa listesini de güncelle
          const pageIds = newPages.map(p => p.id);
          const pagesListKey = `${getBinderKeyPrefix(selectedBinderId)}pages-list`;
          localStorage.setItem(pagesListKey, JSON.stringify(pageIds));
        }
      } catch (e) {
        console.error('Sayfa kaydedilirken hata:', e);
      }
      
      return newPages;
    });
  };

  // Tüm sayfaları birleştir (sol ve sağ) - Şu an kullanılmıyor
  // eslint-disable-next-line no-unused-vars
  const allPages = pages.map((page, index) => ({ ...page, index }));

  const handlePageSelect = (pageId) => {
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex !== -1) {
      setSelectedPageIndex(pageIndex);
    }
  };

  const handlePageGridEdit = (pageId, currentGridSize) => {
    setEditingGridPageId(pageId);
    setEditingGridSize(currentGridSize);
  };

  const handleGridSizeSave = () => {
    if (editingGridPageId && editingGridSize && /^\d+x\d+$/.test(editingGridSize)) {
      const updatedPages = pages.map(page => 
        page.id === editingGridPageId 
          ? { ...page, gridSize: editingGridSize }
          : page
      );
      setPages(updatedPages);
      // useEffect otomatik olarak localStorage'a kaydedecek
      setEditingGridPageId(null);
      setEditingGridSize('');
    }
  };

  const handleGridSizeCancel = () => {
    setEditingGridPageId(null);
    setEditingGridSize('');
  };

  const handleNextPage = useCallback(() => {
    if (pages.length === 0) return;
    
    // Bir sonraki spread'e geç
    if (currentSpreadIndex < maxSpreadIndex) {
      setCurrentSpreadIndex(prev => prev + 1);
    }
  }, [pages.length, currentSpreadIndex, maxSpreadIndex]);

  const handlePrevPage = useCallback(() => {
    if (pages.length === 0) return;
    
    // Bir önceki spread'e geç
    if (currentSpreadIndex > 0) {
      setCurrentSpreadIndex(prev => prev - 1);
    }
  }, [pages.length, currentSpreadIndex]);

  // Sayfayı yukarı taşı (order'ı azalt)
  const handleMovePageUp = (pageId) => {
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;
    
    const sortedPages = [...pages].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.id;
      const orderB = b.order !== undefined ? b.order : b.id;
      return orderA - orderB;
    });
    
    const currentPageIndex = sortedPages.findIndex(p => p.id === pageId);
    if (currentPageIndex <= 0) return; // Zaten en üstte
    
    const currentPage = sortedPages[currentPageIndex];
    const previousPage = sortedPages[currentPageIndex - 1];
    
    // Order'ları değiştir
    const newPages = pages.map(p => {
      if (p.id === currentPage.id) {
        return { ...p, order: previousPage.order !== undefined ? previousPage.order : previousPage.id };
      } else if (p.id === previousPage.id) {
        return { ...p, order: currentPage.order !== undefined ? currentPage.order : currentPage.id };
      }
      return p;
    });
    
    setPages(newPages);
  };

  // Sayfayı aşağı taşı (order'ı artır)
  const handleMovePageDown = (pageId) => {
    const pageIndex = pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) return;
    
    const sortedPages = [...pages].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.id;
      const orderB = b.order !== undefined ? b.order : b.id;
      return orderA - orderB;
    });
    
    const currentPageIndex = sortedPages.findIndex(p => p.id === pageId);
    if (currentPageIndex >= sortedPages.length - 1) return; // Zaten en altta
    
    const currentPage = sortedPages[currentPageIndex];
    const nextPage = sortedPages[currentPageIndex + 1];
    
    // Order'ları değiştir
    const newPages = pages.map(p => {
      if (p.id === currentPage.id) {
        return { ...p, order: nextPage.order !== undefined ? nextPage.order : nextPage.id };
      } else if (p.id === nextPage.id) {
        return { ...p, order: currentPage.order !== undefined ? currentPage.order : currentPage.id };
      }
      return p;
    });
    
    setPages(newPages);
  };

  // Sayfayı belirli bir pozisyona taşı (drag and drop için)
  const handleMovePageTo = (draggedPageId, targetIndex) => {
    const sortedPages = [...pages].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.id;
      const orderB = b.order !== undefined ? b.order : b.id;
      return orderA - orderB;
    });
    
    if (targetIndex < 0 || targetIndex >= sortedPages.length) return;
    
    const draggedPageIndex = sortedPages.findIndex(p => p.id === draggedPageId);
    if (draggedPageIndex === -1 || draggedPageIndex === targetIndex) return;
    
    // Sürüklenen sayfayı listeden çıkar
    const reorderedPages = [...sortedPages];
    const [draggedPage] = reorderedPages.splice(draggedPageIndex, 1);
    
    // Hedef pozisyona ekle
    reorderedPages.splice(targetIndex, 0, draggedPage);
    
    // Order değerlerini yeniden hesapla (1'den başlayarak)
    const updatedPages = pages.map(page => {
      const newIndex = reorderedPages.findIndex(p => p.id === page.id);
      if (newIndex !== -1) {
        return { ...page, order: newIndex + 1 };
      }
      return page;
    });
    
    setPages(updatedPages);
  };

  // Klavye ok tuşları ile navigasyon
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Eğer focus bir input, textarea veya select alanındaysa sayfa değiştirme yapma
      const activeElement = document.activeElement;
      if (
        activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.classList.contains('ratio-input') ||
          activeElement.classList.contains('grid-input')
        )
      ) {
        return; // Input alanındaysa sayfa değiştirme yapma
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPage();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSpreadIndex, maxSpreadIndex, pages, handleNextPage, handlePrevPage]);

  // Fullscreen fonksiyonları
  const enterFullscreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  };

  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  };

  // Fullscreen değişikliklerini dinle
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  };

  return (
    <div className={`App ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      <SettingsBar
        binderColor={binderColor}
        ringColor={ringColor}
        containerColor={containerColor}
        binderType={binderType}
        widthRatio={widthRatio}
        heightRatio={heightRatio}
        gridSize={gridSize}
        pageType={pageType}
        defaultBackImage={defaultBackImage}
        onColorChange={handleColorChange}
        onRingColorChange={handleRingColorChange}
        onContainerColorChange={handleContainerColorChange}
        onBinderTypeChange={handleBinderTypeChange}
        onWidthRatioChange={handleWidthRatioChange}
        onHeightRatioChange={handleHeightRatioChange}
        onGridSizeChange={handleGridSizeChange}
        onPageTypeChange={handlePageTypeChange}
        onDefaultBackImageChange={handleDefaultBackImageChange}
        onAddPage={handleAddPage}
        onDeleteAllPages={handleDeleteAllPages}
        pagesCount={pages.length}
        imageInputMode={imageInputMode}
        onImageInputModeChange={setImageInputMode}
        galleryUrls={galleryUrls}
        onGalleryUrlsChange={(urls) => {
          setGalleryUrls(urls);
          if (selectedBinderId) {
            saveGalleryUrls(urls, selectedBinderId);
          }
        }}
        binders={binders}
        selectedBinderId={selectedBinderId}
        onSelectBinder={handleSelectBinder}
        onCreateBinder={handleCreateBinder}
        onDeleteBinder={handleDeleteBinder}
        onRenameBinder={handleRenameBinder}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
      <PageOrderBar
        pages={sortedPages}
        currentSpread={currentSpread}
        onMovePageUp={handleMovePageUp}
        onMovePageDown={handleMovePageDown}
        onMovePageTo={handleMovePageTo}
        isVisible={true}
      />
      <Binder 
        binderColor={binderColor} 
        ringColor={ringColor}
        containerColor={containerColor}
        binderType={binderType}
        widthRatio={widthRatio}
        heightRatio={heightRatio}
        pages={pages}
        pageType={pageType}
        defaultBackImage={defaultBackImage}
        selectedPageIndex={selectedPageIndex}
        currentSpread={currentSpread}
        currentSpreadIndex={currentSpreadIndex}
        maxSpreadIndex={maxSpreadIndex}
        imageInputMode={imageInputMode}
        galleryUrls={galleryUrls}
        onPageSelect={handlePageSelect}
        onPageUpdate={handlePageUpdate}
        onPageGridEdit={handlePageGridEdit}
        editingGridPageId={editingGridPageId}
        editingGridSize={editingGridSize}
        onGridSizeChange={setEditingGridSize}
        onGridSizeSave={handleGridSizeSave}
        onGridSizeCancel={handleGridSizeCancel}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
        onDeletePage={handleDeletePage}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onAddPage={handleAddPage}
      />
      <Footer pagesCount={pages.length} />
    
    </div>
  );
}

export default App;
