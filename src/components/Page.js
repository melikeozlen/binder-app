import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Page.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { loadDefaultGallery } from '../utils/defaultGallery';
import GalleryWithFolders from './GalleryWithFolders';
import { GALLERY_UI_CONTEXT } from '../utils/galleryUiState';

const SLEEVE_PRESETS = [
  '#A8CCE8',
  '#F0B8C8',
  '#B8E0D0',
  '#C8B8E8',
  '#F0E0A0',
  '#F5F5F5',
  '#2A2A2A',
];
const DEFAULT_SLEEVE_COLOR = '#A8CCE8';
const SLEEVE_RING_PX = 6; // Resmin dışına çizilen çerçeve kalınlığı (px)
const IMAGE_TOUCH_DRAG_DELAY_MS = 250;
const IMAGE_TOUCH_SCROLL_CANCEL_PX = 12;

const Page = ({
  page,
  gridSize,
  coverSide,
  pageType = 'mat',
  defaultBackImage = null,
  onUpdate,
  isSelected = false,
  isFlipped = false,
  pagePosition = 'right',
  onGridEdit,
  onFlip,
  pointerEvents = 'auto',
  pageZIndex = 1,
  frontPageNumber = null,
  backPageNumber = null,
  isTopPage = true,
  imageInputMode = 'defaultGallery',
  galleryUrls = [],
  binderUsedImages = null,
  binderId = null
}) => {
  const { language } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [content, setContent] = useState(page.content || {});
  const [backContent, setBackContent] = useState(page.backContent || {});
  const [rotatedImages, setRotatedImages] = useState(page.rotatedImages || {}); // Çevrilmiş resimlerin takibi
  const [sleeves, setSleeves] = useState(page.sleeves || {}); // Sleeve renkleri
  const [sleevePickerCell, setSleevePickerCell] = useState(null); // { side, row, col }
  const [sleevePickerFlip, setSleevePickerFlip] = useState(false);
  const [rotatedDefaultBackImage, setRotatedDefaultBackImage] = useState(null); // Çevrilmiş default arka yüz resmi
  const [urlInputValue, setUrlInputValue] = useState('');
  const [urlInputCell, setUrlInputCell] = useState(null); // {row, col, side: 'front'|'back'}
  const [showGallery, setShowGallery] = useState(false);
  const [galleryCell, setGalleryCell] = useState(null); // {row, col, side: 'front'|'back'}
  const [defaultGalleryUrls, setDefaultGalleryUrls] = useState([]);
  const [showDefaultGallery, setShowDefaultGallery] = useState(false);
  const [defaultGalleryCell, setDefaultGalleryCell] = useState(null); // {row, col, side: 'front'|'back'}
  const [draggedCell, setDraggedCell] = useState(null); // {side, row, col}
  const [dragOverCell, setDragOverCell] = useState(null); // {side, row, col}
  const fileInputRefs = useRef({});
  const backFileInputRefs = useRef({});
  const sleevePickerRef = useRef(null);
  const colorPickerActiveRef = useRef(false);
  const touchDragRef = useRef({
    cell: null,
    startX: 0,
    startY: 0,
    dragging: false,
    longPressTimer: null,
    lastTarget: null,
  });
  const performCellMoveOrSwapRef = useRef(null);

  (function () {
    let el = null;
    let observer = null;
    let lastWidth = null;
    let lastDpr = window.devicePixelRatio;

    function getWidth() {
      if (!el) return null;
      return el.getBoundingClientRect().width;
    }

    function log(reason) {
      const width = getWidth();
      if (width !== lastWidth) {
        lastWidth = width;
        console.log(
          `[${reason}] cell-image-wrapper width:`,
          width,
          "DPR:",
          window.devicePixelRatio
        );
      }
    }

    // 1️⃣ DOM hazır olana kadar bekle
    function waitForElement() {
      el = document.querySelector(".cell-image-wrapper");
      if (!el) {
        requestAnimationFrame(waitForElement);
        return;
      }

      console.log("cell-image-wrapper bulundu");

      // 2️⃣ ResizeObserver (CSS / layout değişimleri)
      observer = new ResizeObserver(() => log("ResizeObserver"));
      observer.observe(el);

      // 3️⃣ Window resize
      window.addEventListener("resize", () => log("window.resize"));

      // 4️⃣ Zoom / DPR watcher
      setInterval(() => {
        if (window.devicePixelRatio !== lastDpr) {
          lastDpr = window.devicePixelRatio;
          log("zoom / DPR change");
        }
      }, 200);

      // İlk ölçüm
      log("init");
    }

    waitForElement();
  })();

  // Default gallery'yi yükle
  useEffect(() => {
    const loadGallery = async () => {
      const items = await loadDefaultGallery('cortis-pc.txt');
      setDefaultGalleryUrls(items);
    };
    loadGallery();
  }, []);

  // Galeri açıkken body'ye class ekle (sürükle bırak ile sayfa değiştirmeyi engellemek için)
  useEffect(() => {
    if (showGallery || showDefaultGallery) {
      document.body.classList.add('gallery-modal-open');
    } else {
      document.body.classList.remove('gallery-modal-open');
    }
    return () => {
      document.body.classList.remove('gallery-modal-open');
    };
  }, [showGallery, showDefaultGallery]);

  // Photocard sürüklenirken sayfa kaydırmayı engelle
  useEffect(() => {
    if (draggedCell) {
      document.body.classList.add('cell-drag-active');
    } else {
      document.body.classList.remove('cell-drag-active');
    }
    return () => document.body.classList.remove('cell-drag-active');
  }, [draggedCell]);

  const findCellAtPoint = useCallback((x, y) => {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      const cell = el.closest?.(`[data-page-id="${page.id}"][data-row][data-col]`);
      if (!cell) continue;
      const side = cell.getAttribute('data-side') || 'front';
      const row = parseInt(cell.getAttribute('data-row'), 10);
      const col = parseInt(cell.getAttribute('data-col'), 10);
      if (Number.isNaN(row) || Number.isNaN(col)) continue;
      return { side, row, col };
    }
    return null;
  }, [page.id]);

  const resetTouchDrag = useCallback(() => {
    const ts = touchDragRef.current;
    if (ts.longPressTimer) {
      clearTimeout(ts.longPressTimer);
      ts.longPressTimer = null;
    }
    ts.cell = null;
    ts.dragging = false;
    ts.lastTarget = null;
    setDraggedCell(null);
    setDragOverCell(null);
  }, []);

  useEffect(() => {
    const onTouchMove = (e) => {
      const ts = touchDragRef.current;
      if (!ts.cell || e.touches.length !== 1) return;

      const touch = e.touches[0];

      if (!ts.dragging) {
        const dx = Math.abs(touch.clientX - ts.startX);
        const dy = Math.abs(touch.clientY - ts.startY);
        if (dx > IMAGE_TOUCH_SCROLL_CANCEL_PX || dy > IMAGE_TOUCH_SCROLL_CANCEL_PX) {
          resetTouchDrag();
        }
        return;
      }

      e.preventDefault();
      const target = findCellAtPoint(touch.clientX, touch.clientY);
      if (
        target &&
        target.side === ts.cell.side &&
        (target.row !== ts.cell.row || target.col !== ts.cell.col)
      ) {
        ts.lastTarget = target;
        setDragOverCell(target);
      }
    };

    const onTouchEnd = () => {
      const ts = touchDragRef.current;
      if (!ts.cell) return;

      if (ts.dragging && ts.lastTarget && performCellMoveOrSwapRef.current) {
        performCellMoveOrSwapRef.current(ts.cell, ts.lastTarget);
      }
      resetTouchDrag();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [findCellAtPoint, resetTouchDrag]);

  // Güncel state'leri ref'lerde sakla (closure sorunlarını önlemek için)
  const contentRef = useRef(content);
  const backContentRef = useRef(backContent);
  const rotatedImagesRef = useRef(rotatedImages);
  const sleevesRef = useRef(sleeves);

  // State değişikliklerini ref'lere yansıt
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    backContentRef.current = backContent;
  }, [backContent]);

  useEffect(() => {
    rotatedImagesRef.current = rotatedImages;
  }, [rotatedImages]);

  useEffect(() => {
    sleevesRef.current = sleeves;
  }, [sleeves]);

  // page prop'u değiştiğinde local state'i güncelle (localStorage'dan yüklendiğinde)
  // Her sayfa unique ID'ye sahip ve kendi verilerini tutmalı
  const prevPageIdRef = useRef(null);
  const prevPageDataRef = useRef(null);

  useEffect(() => {
    // Sayfa ID'si değiştiğinde veya sayfa verileri değiştiğinde state'i güncelle
    const pageDataString = JSON.stringify({
      content: page.content,
      backContent: page.backContent,
      rotatedImages: page.rotatedImages,
      sleeves: page.sleeves,
    });

    // Sayfa ID'si değiştiyse veya sayfa verileri değiştiyse güncelle
    if (page.id && (prevPageIdRef.current !== page.id || prevPageDataRef.current !== pageDataString)) {
      const isNewPage = prevPageIdRef.current !== page.id;

      // Eğer sayfa değiştiyse, önceki sayfanın state'ini tamamen temizle
      if (isNewPage) {
        // Önceki sayfanın state'ini temizle
        setContent({});
        setBackContent({});
        setRotatedImages({});
        setSleeves({});
        setSleevePickerCell(null);
        contentRef.current = {};
        backContentRef.current = {};
        rotatedImagesRef.current = {};
        sleevesRef.current = {};
      }

      // Yeni sayfanın verilerini yükle
      const newContent = page.content ? { ...page.content } : {};
      const newBackContent = page.backContent ? { ...page.backContent } : {};
      const newRotatedImages = page.rotatedImages ? { ...page.rotatedImages } : {};
      const newSleeves = page.sleeves ? { ...page.sleeves } : {};

      setContent(newContent);
      setBackContent(newBackContent);
      setRotatedImages(newRotatedImages);
      setSleeves(newSleeves);

      // Ref'leri de güncelle
      contentRef.current = newContent;
      backContentRef.current = newBackContent;
      rotatedImagesRef.current = newRotatedImages;
      sleevesRef.current = newSleeves;

      prevPageIdRef.current = page.id;
      prevPageDataRef.current = pageDataString;
    }
  }, [page.id, page.content, page.backContent, page.rotatedImages, page.sleeves]); // Tüm sayfa verilerini dinle

  // State güncellemesi yapıp onUpdate'i çağıran helper fonksiyon
  // Bu fonksiyon sadece belirtilen cep için güncelleme yapar
  // Sayfa ID kontrolü yaparak yanlış sayfaya kaydetmeyi önler
  const updatePageWithState = useCallback((contentUpdate, backContentUpdate, rotatedImagesUpdate, sleevesUpdate) => {
    // Sayfa ID kontrolü - eğer sayfa değiştiyse güncelleme yapma
    const currentPageId = page.id;
    if (!currentPageId) {
      console.warn('Sayfa ID yok, güncelleme yapılamıyor');
      return;
    }

    let updateCount = 0;
    const totalUpdates = [contentUpdate, backContentUpdate, rotatedImagesUpdate, sleevesUpdate].filter(u => u !== undefined).length;

    const callOnUpdate = () => {
      updateCount++;
      if (updateCount === totalUpdates) {
        // Tüm güncellemeler tamamlandığında onUpdate'i çağır
        // Sayfa ID'sini tekrar kontrol et (sayfa değişmiş olabilir)
        setTimeout(() => {
          // Sayfa ID hala aynı mı kontrol et
          if (page.id === currentPageId) {
            onUpdate({
              id: currentPageId,
              content: contentRef.current,
              backContent: backContentRef.current,
              rotatedImages: rotatedImagesRef.current,
              sleeves: sleevesRef.current,
              gridSize: page.gridSize || gridSize,
              cover: page.cover,
              isCover: page.isCover,
              transparent: page.transparent,
              order: page.order !== undefined ? page.order : page.id // Order bilgisini koru
            });
          } else {
            console.warn('Sayfa değişti, güncelleme iptal edildi');
          }
        }, 0);
      }
    };

    // State güncellemelerini yap ve ref'leri güncelle
    if (contentUpdate !== undefined) {
      setContent(prevContent => {
        // Sayfa ID kontrolü - eğer sayfa değiştiyse güncelleme yapma
        if (page.id !== currentPageId) {
          return prevContent;
        }
        const newContent = typeof contentUpdate === 'function' ? contentUpdate(prevContent) : contentUpdate;
        // Ref'i hemen güncelle
        contentRef.current = newContent;
        callOnUpdate();
        return newContent;
      });
    }

    if (backContentUpdate !== undefined) {
      setBackContent(prevBackContent => {
        // Sayfa ID kontrolü - eğer sayfa değiştiyse güncelleme yapma
        if (page.id !== currentPageId) {
          return prevBackContent;
        }
        const newBackContent = typeof backContentUpdate === 'function' ? backContentUpdate(prevBackContent) : backContentUpdate;
        // Ref'i hemen güncelle
        backContentRef.current = newBackContent;
        callOnUpdate();
        return newBackContent;
      });
    }

    if (rotatedImagesUpdate !== undefined) {
      setRotatedImages(prevRotatedImages => {
        // Sayfa ID kontrolü - eğer sayfa değiştiyse güncelleme yapma
        if (page.id !== currentPageId) {
          return prevRotatedImages;
        }
        const newRotatedImages = typeof rotatedImagesUpdate === 'function' ? rotatedImagesUpdate(prevRotatedImages) : rotatedImagesUpdate;
        // Ref'i hemen güncelle
        rotatedImagesRef.current = newRotatedImages;
        callOnUpdate();
        return newRotatedImages;
      });
    }

    if (sleevesUpdate !== undefined) {
      setSleeves((prevSleeves) => {
        if (page.id !== currentPageId) {
          return prevSleeves;
        }
        const newSleeves = typeof sleevesUpdate === 'function' ? sleevesUpdate(prevSleeves) : sleevesUpdate;
        sleevesRef.current = newSleeves;
        callOnUpdate();
        return newSleeves;
      });
    }
  }, [page.id, page.gridSize, page.cover, page.isCover, page.transparent, page.order, gridSize, onUpdate]);

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

  const applyRoundedCorners = useCallback((imageDataUrl, callback) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;

      // Yüksek kaliteli çizim için imageSmoothingEnabled ayarla
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const radius = 10;
      const width = img.width;
      const height = img.height;

      // Oval kenarlar için path oluştur
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(width - radius, 0);
      ctx.quadraticCurveTo(width, 0, width, radius);
      ctx.lineTo(width, height - radius);
      ctx.quadraticCurveTo(width, height, width - radius, height);
      ctx.lineTo(radius, height);
      ctx.quadraticCurveTo(0, height, 0, height - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.clip();

      // Resmi çiz
      ctx.drawImage(img, 0, 0);

      // localStorage durumuna göre kalite ayarla
      const usagePercent = getLocalStorageUsagePercent();
      let quality = 0.85; // Varsayılan
      if (usagePercent >= 90) {
        quality = 0.6;
      } else if (usagePercent >= 75) {
        quality = 0.7;
      } else if (usagePercent >= 50) {
        quality = 0.8;
      }

      // Base64'e çevir - JPEG formatında optimize edilmiş kalite ile kaydet
      const roundedImageDataUrl = canvas.toDataURL('image/jpeg', quality);
      callback(roundedImageDataUrl);
    };
    img.src = imageDataUrl;
  }, []);

  // Resmi 90 derece saat yönünde çevir ve base64 olarak kaydet
  const rotateImage = (imageDataUrl, callback) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Yüksek kaliteli çizim için imageSmoothingEnabled ayarla
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Canvas boyutlarını çevir (genişlik ↔ yükseklik)
      canvas.width = img.height;
      canvas.height = img.width;

      // Canvas'ı merkeze taşı ve çevir
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2); // 90 derece saat yönünde
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      // Base64'e çevir - PNG formatı kaliteyi korur
      const rotatedImageDataUrl = canvas.toDataURL('image/png');
      callback(rotatedImageDataUrl);
    };
    img.src = imageDataUrl;
  };

  // Default arka yüz resmini çevir (eğer ön yüzdeki resim çevrilmişse)
  useEffect(() => {
    if (!defaultBackImage) {
      setRotatedDefaultBackImage(null);
      return;
    }

    // Ön yüzde çevrilmiş resim var mı kontrol et
    const hasRotatedFrontImage = Object.keys(rotatedImages).some(key =>
      !key.startsWith('back-') && rotatedImages[key] === true
    );

    if (hasRotatedFrontImage && !rotatedDefaultBackImage) {
      // Default resmi çevir
      rotateImage(defaultBackImage, (rotatedImage) => {
        applyRoundedCorners(rotatedImage, (finalRotatedImage) => {
          setRotatedDefaultBackImage(finalRotatedImage);
        });
      });
    } else if (!hasRotatedFrontImage) {
      // Çevrilmiş resim yoksa cache'i temizle
      setRotatedDefaultBackImage(null);
    }
  }, [defaultBackImage, rotatedImages, applyRoundedCorners, rotatedDefaultBackImage]);

  // Resim içeriğini normalize et - hem obje hem string formatını destekle (base64 veya URL)
  const getImageUrl = (cellContent) => {
    if (!cellContent) return null;
    if (typeof cellContent === 'string') {
      // Base64 resim veya URL
      if (cellContent.startsWith('data:image') ||
        cellContent.startsWith('http://') ||
        cellContent.startsWith('https://')) {
        return cellContent;
      }
    }
    if (typeof cellContent === 'object') {
      const url = cellContent.url || cellContent.image;
      if (
        url &&
        (url.startsWith('data:image') ||
          url.startsWith('http://') ||
          url.startsWith('https://'))
      ) {
        return url;
      }
    }
    return null;
  };

  const lookupGalleryImageName = (url) => {
    if (!url) return '';
    const sources = [...galleryUrls, ...defaultGalleryUrls];
    for (const item of sources) {
      const itemUrl = typeof item === 'string' ? item : item.url;
      if (itemUrl === url) {
        return typeof item === 'string' ? '' : (item.name || '').trim();
      }
    }
    return '';
  };

  const getCellImageName = (cellContent) => {
    if (cellContent && typeof cellContent === 'object' && cellContent.name) {
      return cellContent.name.trim();
    }
    return lookupGalleryImageName(getImageUrl(cellContent));
  };

  const createImageCellValue = (url, name = '') => {
    const trimmedName = (name || '').trim();
    if (trimmedName) {
      return { url, name: trimmedName };
    }
    return url;
  };

  const isImageContent = (cellContent) => {
    return getImageUrl(cellContent) !== null;
  };

  const handleCellClick = (row, col) => {
    // Alttaki sayfalar için tıklamaları engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    const key = `${row}-${col}`;
    const cellContent = content[key];

    // Resim varsa tıklama ile hiçbir şey yapma - sadece butonlarla işlem yapılabilir
    if (isImageContent(cellContent)) {
      return; // Resim varsa tıklama ile işlem yapma
    }

    // Sadece boş hücrelere tıklayınca resim ekle
    if (!cellContent) {
      if (imageInputMode === 'url') {
        // URL modu: URL input göster
        setUrlInputCell({ row, col, side: 'front' });
        setUrlInputValue('');
      } else if (imageInputMode === 'gallery' && galleryUrls.length > 0) {
        // Galeri modu: Galeri modalını göster
        setGalleryCell({ row, col, side: 'front' });
        setShowGallery(true);
      } else if (imageInputMode === 'defaultGallery' && defaultGalleryUrls.length > 0) {
        // Default gallery modu: Default gallery modalını göster
        setDefaultGalleryCell({ row, col, side: 'front' });
        setShowDefaultGallery(true);
      } else {
        // File modu: Dosya seçiciyi aç
        const inputKey = `${page.id}-${row}-${col}`;
        if (!fileInputRefs.current[inputKey]) {
          fileInputRefs.current[inputKey] = document.createElement('input');
          fileInputRefs.current[inputKey].type = 'file';
          fileInputRefs.current[inputKey].accept = 'image/*';
          fileInputRefs.current[inputKey].onchange = (e) => {
            if (isTopPage && pointerEvents === 'auto') {
              handleImageSelect(e, row, col);
            }
          };
        }
        fileInputRefs.current[inputKey].click();
      }
    }
  };

  const handleGalleryImageSelect = (e, item) => {
    e.stopPropagation();
    e.preventDefault();

    if (!galleryCell) return;

    const url = typeof item === 'string' ? item : item.url;
    const name = typeof item === 'string' ? '' : (item.name || '');
    const cellValue = createImageCellValue(url, name);

    const { row, col, side } = galleryCell;
    if (side === 'front') {
      const key = `${row}-${col}`;
      updatePageWithState(
        (prevContent) => ({ ...prevContent, [key]: cellValue }),
        undefined,
        undefined
      );
    } else {
      const key = `${row}-${col}`;
      updatePageWithState(
        undefined,
        (prevBackContent) => ({ ...prevBackContent, [key]: cellValue }),
        undefined
      );
    }
    setShowGallery(false);
    setGalleryCell(null);
  };

  const handleDefaultGalleryImageSelect = (e, item) => {
    e.stopPropagation();
    e.preventDefault();

    if (!defaultGalleryCell) return;

    const url = typeof item === 'string' ? item : item.url;
    const name = typeof item === 'string' ? '' : (item.name || '');
    const cellValue = createImageCellValue(url, name);

    const { row, col, side } = defaultGalleryCell;
    if (side === 'front') {
      const key = `${row}-${col}`;
      updatePageWithState(
        (prevContent) => ({ ...prevContent, [key]: cellValue }),
        undefined,
        undefined
      );
    } else {
      const key = `${row}-${col}`;
      updatePageWithState(
        undefined,
        (prevBackContent) => ({ ...prevBackContent, [key]: cellValue }),
        undefined
      );
    }
    setShowDefaultGallery(false);
    setDefaultGalleryCell(null);
  };

  // Resim adını kısalt
  const handleUrlSubmit = (row, col, side) => {
    const trimmedUrl = urlInputValue.trim();
    if (trimmedUrl) {
      // URL validasyonu
      if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://') || trimmedUrl.startsWith('data:image')) {
        if (side === 'front') {
          const key = `${row}-${col}`;
          updatePageWithState(
            (prevContent) => ({ ...prevContent, [key]: trimmedUrl }),
            undefined,
            undefined
          );
        } else {
          const key = `${row}-${col}`;
          updatePageWithState(
            undefined,
            (prevBackContent) => ({ ...prevBackContent, [key]: trimmedUrl }),
            undefined
          );
        }
        setUrlInputCell(null);
        setUrlInputValue('');
      } else {
        alert(t('settings.invalidUrl'));
      }
    }
  };

  // Çeviri fonksiyonu için params desteği
  const tWithParams = (key, params) => {
    let translation = t(key);
    if (params) {
      Object.keys(params).forEach(param => {
        translation = translation.replace(`{${param}}`, params[param]);
      });
    }
    return translation;
  };

  // Resmi sıkıştır ve optimize et (localStorage durumuna göre dinamik)
  const compressImage = (imageDataUrl, callback, customMaxWidth, customMaxHeight, customQuality) => {
    const img = new Image();
    img.onload = () => {
      // localStorage durumuna göre optimal ayarları hesapla
      const usagePercent = getLocalStorageUsagePercent();
      let maxWidth, maxHeight, quality;

      if (customMaxWidth && customMaxHeight && customQuality !== undefined) {
        // Özel ayarlar verilmişse onları kullan
        maxWidth = customMaxWidth;
        maxHeight = customMaxHeight;
        quality = customQuality;
      } else {
        // localStorage durumuna göre dinamik ayarlar
        if (usagePercent >= 90) {
          // %90+ dolu: Çok agresif sıkıştırma
          maxWidth = 800;
          maxHeight = 800;
          quality = 0.6;
        } else if (usagePercent >= 75) {
          // %75-90 dolu: Agresif sıkıştırma
          maxWidth = 1200;
          maxHeight = 1200;
          quality = 0.7;
        } else if (usagePercent >= 50) {
          // %50-75 dolu: Orta sıkıştırma
          maxWidth = 1600;
          maxHeight = 1600;
          quality = 0.8;
        } else {
          // %50'den az dolu: Yüksek kalite (ama yine de optimize)
          maxWidth = 1920;
          maxHeight = 1920;
          quality = 0.85;
        }
      }

      // Resmin boyutunu hesapla
      let width = img.width;
      let height = img.height;

      // Eğer resim çok büyükse, boyutunu küçült
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;

      // Yüksek kaliteli çizim için imageSmoothingEnabled ayarla
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Resmi çiz
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG formatında optimize edilmiş kalite ile kaydet
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

      // Sıkıştırılmış resmin boyutunu kontrol et
      const compressedSize = compressedDataUrl.length;

      // localStorage dolmaya yaklaştıysa daha agresif sıkıştır (usagePercent zaten yukarıda tanımlı)
      let maxSize = 150 * 1024; // 150KB max (varsayılan)
      if (usagePercent >= 90) {
        maxSize = 80 * 1024; // 80KB max (%90+ dolu)
      } else if (usagePercent >= 85) {
        maxSize = 100 * 1024; // 100KB max (%85-90 dolu)
      } else if (usagePercent >= 75) {
        maxSize = 120 * 1024; // 120KB max (%75-85 dolu)
      }

      // Eğer hala çok büyükse, daha agresif sıkıştır
      if (compressedSize > maxSize && quality > 0.4) {
        // localStorage durumuna göre minimum kalite belirle
        const minQuality = usagePercent >= 90 ? 0.4 : (usagePercent >= 85 ? 0.5 : 0.6);
        const newQuality = Math.max(minQuality, quality - 0.15);
        const recompressedDataUrl = canvas.toDataURL('image/jpeg', newQuality);

        // Hala çok büyükse boyutu da küçült
        if (recompressedDataUrl.length > maxSize && width > 400) {
          const ratio = Math.sqrt(maxSize / compressedSize); // Boyut oranına göre küçült
          const newWidth = Math.max(400, Math.floor(width * ratio));
          const newHeight = Math.max(400, Math.floor(height * ratio));

          const resizeCanvas = document.createElement('canvas');
          const resizeCtx = resizeCanvas.getContext('2d');
          resizeCanvas.width = newWidth;
          resizeCanvas.height = newHeight;
          resizeCtx.imageSmoothingEnabled = true;
          resizeCtx.imageSmoothingQuality = 'high';
          resizeCtx.drawImage(img, 0, 0, newWidth, newHeight);
          const finalDataUrl = resizeCanvas.toDataURL('image/jpeg', newQuality);
          callback(finalDataUrl);
        } else {
          callback(recompressedDataUrl);
        }
      } else {
        callback(compressedDataUrl);
      }
    };
    img.onerror = () => {
      // Hata durumunda orijinal resmi döndür
      callback(imageDataUrl);
    };
    img.src = imageDataUrl;
  };

  const handleImageSelect = (e, row, col) => {
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    const file = e.target.files[0];
    if (file) {
      // Resim sayısı kontrolü
      const currentImageCount = Object.keys(content).filter(key =>
        content[key] && typeof content[key] === 'string' && content[key].startsWith('data:image')
      ).length + Object.keys(backContent).filter(key =>
        backContent[key] && typeof backContent[key] === 'string' && backContent[key].startsWith('data:image')
      ).length;

      if (currentImageCount >= 20) {
        alert(tWithParams('page.maxImagesPerPage', { max: 20 }));
        return;
      }

      // localStorage kullanım kontrolü
      const usagePercent = getLocalStorageUsagePercent();
      if (usagePercent >= 95) {
        alert(t('page.storageFull'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        // Önce resmi sıkıştır, sonra oval kenarlar uygula
        compressImage(event.target.result, (compressedImage) => {
          applyRoundedCorners(compressedImage, (roundedImageDataUrl) => {
            // Sayfa ID'si ile unique key oluştur
            const key = `${row}-${col}`;
            // Sadece bu cep için güncelleme yap - sayfa ID kontrolü yap
            if (page.id) {
              updatePageWithState(
                (prevContent) => ({ ...prevContent, [key]: roundedImageDataUrl }),
                undefined,
                undefined
              );
            }
          });
        });
      };
      reader.readAsDataURL(file);
      // Input'un value'sunu temizle ki aynı dosya tekrar seçilebilsin
      e.target.value = '';
    }
  };

  const handleRemoveImage = (e, row, col) => {
    e.stopPropagation();
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    const key = `${row}-${col}`;
    // Sadece bu cep için güncelleme yap
    updatePageWithState(
      (prevContent) => {
        const newContent = { ...prevContent };
        delete newContent[key];
        return newContent;
      },
      undefined,
      (prevRotated) => {
        const next = { ...prevRotated };
        delete next[key];
        return next;
      },
      (prevSleeves) => {
        const next = { ...prevSleeves };
        delete next[key];
        return next;
      }
    );
  };

  const handleReplaceImage = (e, row, col) => {
    e.stopPropagation();
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    // Sayfa ID kontrolü
    if (!page.id) {
      return;
    }

    if (imageInputMode === 'url') {
      // URL modu: URL input göster
      setUrlInputCell({ row, col, side: 'front' });
      setUrlInputValue('');
    } else if (imageInputMode === 'gallery' && galleryUrls.length > 0) {
      // Galeri modu: Galeri modalını göster
      setGalleryCell({ row, col, side: 'front' });
      setShowGallery(true);
    } else if (imageInputMode === 'defaultGallery' && defaultGalleryUrls.length > 0) {
      // Default gallery modu: Default gallery modalını göster
      setDefaultGalleryCell({ row, col, side: 'front' });
      setShowDefaultGallery(true);
    } else {
      // File modu: Dosya seçiciyi aç
      const inputKey = `${page.id}-${row}-${col}`;
      if (!fileInputRefs.current[inputKey]) {
        fileInputRefs.current[inputKey] = document.createElement('input');
        fileInputRefs.current[inputKey].type = 'file';
        fileInputRefs.current[inputKey].accept = 'image/*';
        fileInputRefs.current[inputKey].onchange = (e) => {
          if (isTopPage && pointerEvents === 'auto' && page.id) {
            handleImageSelect(e, row, col);
          }
        };
      }
      fileInputRefs.current[inputKey].click();
    }
  };

  const fitImageToWrapper = useCallback((img, wrapper) => {
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    if (!imgW || !imgH) {
      if (!img.complete) {
        const handleLoad = () => {
          fitImageToWrapper(img, wrapper);
          img.removeEventListener('load', handleLoad);
        };
        img.addEventListener('load', handleLoad, { once: true });
      }
      return;
    }

    const style = getComputedStyle(wrapper);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const hasSleeve = img.classList.contains('has-sleeve');
    const sleeveInset = hasSleeve ? SLEEVE_RING_PX * 2 : 0;
    const wrapperWidth = Math.max(0, wrapper.clientWidth - padX - sleeveInset);
    const wrapperHeight = Math.max(0, wrapper.clientHeight - padY - sleeveInset);

    let rotationAngle = 0;
    if (img.classList.contains('rotated-90')) rotationAngle = 90;
    else if (img.classList.contains('rotated-180')) rotationAngle = 180;
    else if (img.classList.contains('rotated-270')) rotationAngle = 270;

    const radians = rotationAngle * Math.PI / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));
    const rotatedW = imgW * cos + imgH * sin;
    const rotatedH = imgW * sin + imgH * cos;
    const scale = Math.min(wrapperWidth / rotatedW, wrapperHeight / rotatedH);

    img.style.width = `${imgW * scale}px`;
    img.style.height = `${imgH * scale}px`;
  }, []);

  const getCellKey = (row, col) => `${row}-${col}`;

  const getRotationKey = (side, row, col) =>
    side === 'back' ? `back-${getCellKey(row, col)}` : getCellKey(row, col);

  const swapContentCells = (prevContent, fromKey, toKey) => {
    const newContent = { ...prevContent };
    const fromVal = newContent[fromKey];
    const toVal = newContent[toKey];
    const toHasImage = isImageContent(toVal);

    if (!toHasImage) {
      newContent[toKey] = fromVal;
      delete newContent[fromKey];
    } else {
      newContent[fromKey] = toVal;
      newContent[toKey] = fromVal;
    }
    return newContent;
  };

  const swapRotationCells = (prevRotated, fromRotKey, toRotKey, toHasImage) => {
    const newRotated = { ...prevRotated };
    const hasFrom = fromRotKey in prevRotated;
    const hasTo = toRotKey in prevRotated;

    if (!toHasImage) {
      if (hasFrom) {
        newRotated[toRotKey] = prevRotated[fromRotKey];
        delete newRotated[fromRotKey];
      } else {
        delete newRotated[toRotKey];
      }
    } else if (hasFrom || hasTo) {
      if (hasTo) newRotated[fromRotKey] = prevRotated[toRotKey];
      else delete newRotated[fromRotKey];

      if (hasFrom) newRotated[toRotKey] = prevRotated[fromRotKey];
      else delete newRotated[toRotKey];
    }

    return newRotated;
  };

  const swapSleeveCells = (prevSleeves, fromKey, toKey, toHasImage) =>
    swapRotationCells(prevSleeves, fromKey, toKey, toHasImage);

  const performCellMoveOrSwap = (from, to) => {
    if (!page.id || from.side !== to.side) return;
    if (from.row === to.row && from.col === to.col) return;

    const fromKey = getCellKey(from.row, from.col);
    const toKey = getCellKey(to.row, to.col);
    const fromRotKey = getRotationKey(from.side, from.row, from.col);
    const toRotKey = getRotationKey(to.side, to.row, to.col);
    const sourceContent = from.side === 'front' ? contentRef.current : backContentRef.current;
    const toHasImage = isImageContent(sourceContent[toKey]);

    if (from.side === 'front') {
      updatePageWithState(
        (prevContent) => swapContentCells(prevContent, fromKey, toKey),
        undefined,
        (prevRotated) => swapRotationCells(prevRotated, fromRotKey, toRotKey, toHasImage),
        (prevSleeves) => swapSleeveCells(prevSleeves, fromRotKey, toRotKey, toHasImage)
      );
    } else {
      updatePageWithState(
        undefined,
        (prevBackContent) => swapContentCells(prevBackContent, fromKey, toKey),
        (prevRotated) => swapRotationCells(prevRotated, fromRotKey, toRotKey, toHasImage),
        (prevSleeves) => swapSleeveCells(prevSleeves, fromRotKey, toRotKey, toHasImage)
      );
    }
  };

  performCellMoveOrSwapRef.current = performCellMoveOrSwap;

  const handleImageDragStart = (e, side, row, col) => {
    if (pointerEvents === 'none' || !isTopPage) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    setDraggedCell({ side, row, col });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${side}-${row}-${col}`);
  };

  const handleImageDragOver = (e, side, row, col) => {
    if (!draggedCell || draggedCell.side !== side) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedCell.row !== row || draggedCell.col !== col) {
      setDragOverCell({ side, row, col });
    }
  };

  const handleImageDragLeave = () => {
    setDragOverCell(null);
  };

  const handleImageDrop = (e, side, row, col) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedCell) return;
    performCellMoveOrSwap(draggedCell, { side, row, col });
    setDraggedCell(null);
    setDragOverCell(null);
  };

  const handleImageDragEnd = () => {
    setDraggedCell(null);
    setDragOverCell(null);
  };

  const handleCellTouchStart = (side, row, col, isDraggable) => (e) => {
    if (!isDraggable || pointerEvents === 'none' || !isTopPage) return;
    if (e.touches.length !== 1) return;
    if (e.target.closest('.cell-control-btn, .cell-sleeve-picker')) return;

    const touch = e.touches[0];
    const ts = touchDragRef.current;
    const cell = { side, row, col };

    if (ts.longPressTimer) clearTimeout(ts.longPressTimer);

    ts.cell = cell;
    ts.startX = touch.clientX;
    ts.startY = touch.clientY;
    ts.dragging = false;
    ts.lastTarget = null;

    ts.longPressTimer = setTimeout(() => {
      ts.dragging = true;
      ts.longPressTimer = null;
      setDraggedCell(cell);
      setDragOverCell(cell);
      if (navigator.vibrate) navigator.vibrate(12);
    }, IMAGE_TOUCH_DRAG_DELAY_MS);
  };

  const getCellDragClassName = (side, row, col, isDraggable) => {
    const classes = [];
    if (isDraggable) classes.push('cell-draggable');
    if (
      draggedCell?.side === side &&
      draggedCell?.row === row &&
      draggedCell?.col === col
    ) {
      classes.push('cell-dragging');
    }
    if (
      dragOverCell?.side === side &&
      dragOverCell?.row === row &&
      dragOverCell?.col === col
    ) {
      classes.push('cell-drag-over');
    }
    return classes.join(' ');
  };

  const handleRotateImage = (e, row, col) => {
    e.stopPropagation();
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    // Sayfa ID kontrolü
    if (!page.id) {
      return;
    }

    const key = `${row}-${col}`;
    const currentAngle = rotatedImages[key] || 0;
    
    // 90 derece artır
    const newAngle = (currentAngle + 90) % 360;

    // State'i güncelle (localStorage'a kaydedilecek)
    updatePageWithState(
      undefined,
      undefined,
      (prevRotatedImages) => {
        const newRotatedImages = { ...prevRotatedImages };
        if (newAngle === 0) {
          // 0 derece ise key'i kaldır (varsayılan)
          delete newRotatedImages[key];
        } else {
          newRotatedImages[key] = newAngle;
        }
        return newRotatedImages;
      }
    );
  };

  const handleCellChange = (row, col, value) => {
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    const key = `${row}-${col}`;
    // Sadece bu cep için güncelleme yap
    updatePageWithState(
      (prevContent) => ({ ...prevContent, [key]: value }),
      undefined,
      undefined
    );
  };

  const getGridSize = () => {
    const [rows, cols] = gridSize.split('x').map(Number);
    return { rows, cols };
  };

  const handleBackCellClick = (row, col) => {
    // Alttaki sayfalar için tıklamaları engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    // Sayfa ID kontrolü
    if (!page.id) {
      return;
    }
    // Arka yüzde tıklanan pozisyon, normal pozisyonu kullan (çünkü backContent normal pozisyonda saklanıyor)
    const key = `${row}-${col}`;
    const cellContent = backContent[key];

    // Resim varsa tıklama ile hiçbir şey yapma - sadece butonlarla işlem yapılabilir
    if (isImageContent(cellContent)) {
      return; // Resim varsa tıklama ile işlem yapma
    }

    // Sadece boş hücrelere tıklayınca resim ekle
    if (!cellContent) {
      if (imageInputMode === 'url') {
        // URL modu: URL input göster
        setUrlInputCell({ row, col, side: 'back' });
        setUrlInputValue('');
      } else if (imageInputMode === 'gallery' && galleryUrls.length > 0) {
        // Galeri modu: Galeri modalını göster
        setGalleryCell({ row, col, side: 'back' });
        setShowGallery(true);
      } else if (imageInputMode === 'defaultGallery' && defaultGalleryUrls.length > 0) {
        // Default gallery modu: Default gallery modalını göster
        setDefaultGalleryCell({ row, col, side: 'back' });
        setShowDefaultGallery(true);
      } else {
        // File modu: Dosya seçiciyi aç
        const inputKey = `${page.id}-back-${row}-${col}`;
        if (!backFileInputRefs.current[inputKey]) {
          backFileInputRefs.current[inputKey] = document.createElement('input');
          backFileInputRefs.current[inputKey].type = 'file';
          backFileInputRefs.current[inputKey].accept = 'image/*';
          backFileInputRefs.current[inputKey].onchange = (e) => {
            if (isTopPage && pointerEvents === 'auto' && page.id) {
              handleBackImageSelect(e, row, col);
            }
          };
        }
        backFileInputRefs.current[inputKey].click();
      }
    }
  };
  useEffect(() => {
    const wrappers = document.querySelectorAll('.cell-image-wrapper');

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const wrapper = entry.target;
        const img = wrapper.querySelector('.cell-image');
        if (!img) continue;
        requestAnimationFrame(() => fitImageToWrapper(img, wrapper));
      }
    });

    wrappers.forEach((wrapper) => {
      observer.observe(wrapper);
      const img = wrapper.querySelector('.cell-image');
      if (img?.complete) {
        fitImageToWrapper(img, wrapper);
      }
    });

    return () => observer.disconnect();
  }, [content, backContent, rotatedImages, sleeves, fitImageToWrapper]);

  useLayoutEffect(() => {
    if (!sleevePickerCell || !sleevePickerRef.current) {
      setSleevePickerFlip(false);
      return;
    }

    const picker = sleevePickerRef.current;
    const controls = picker.closest('.cell-image-controls');
    const buttonsRow = controls?.querySelector('.cell-image-controls-buttons');
    const bounds = picker.closest('.page-grid') || picker.closest('.page-content');
    if (!buttonsRow || !bounds) return;

    const boundsRect = bounds.getBoundingClientRect();
    const buttonsRect = buttonsRow.getBoundingClientRect();
    const pickerHeight = picker.offsetHeight || 72;
    const gap = 8;
    const fitsBelow = buttonsRect.bottom + gap + pickerHeight <= boundsRect.bottom - 2;
    const fitsAbove = buttonsRect.top - gap - pickerHeight >= boundsRect.top + 2;

    setSleevePickerFlip(!fitsBelow && fitsAbove);
  }, [sleevePickerCell, sleeves]);

  useEffect(() => {
    if (!sleevePickerCell) {
      colorPickerActiveRef.current = false;
      return undefined;
    }
    const handlePointerDownOutside = (e) => {
      if (colorPickerActiveRef.current) return;
      if (sleevePickerRef.current?.contains(e.target)) return;
      setSleevePickerCell(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDownOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [sleevePickerCell]);

  const handleSleeveButtonClick = (e, side, row, col) => {
    e.preventDefault();
    e.stopPropagation();
    if (pointerEvents === 'none' || !isTopPage || !page.id) return;

    const cellKey = getRotationKey(side, row, col);
    const hasSleeve = !!sleeves[cellKey];

    if (hasSleeve) {
      setSleevePickerCell((prev) =>
        prev?.side === side && prev?.row === row && prev?.col === col
          ? null
          : { side, row, col }
      );
      return;
    }

    updatePageWithState(
      undefined,
      undefined,
      undefined,
      (prevSleeves) => ({ ...prevSleeves, [cellKey]: DEFAULT_SLEEVE_COLOR })
    );
    setSleevePickerCell({ side, row, col });
  };

  const updateSleeveColor = (side, row, col, color) => {
    const cellKey = getRotationKey(side, row, col);
    updatePageWithState(
      undefined,
      undefined,
      undefined,
      (prevSleeves) => ({ ...prevSleeves, [cellKey]: color })
    );
  };

  const handleSleeveRemove = (side, row, col) => {
    const cellKey = getRotationKey(side, row, col);
    updatePageWithState(
      undefined,
      undefined,
      undefined,
      (prevSleeves) => {
        const next = { ...prevSleeves };
        delete next[cellKey];
        return next;
      }
    );
    setSleevePickerCell(null);
  };

  const renderCellImage = (imageUrl, imageName, rotationKey, sleeveColor, wrapperClasses, extraImgClass = '') => {
    const angle = rotatedImages[rotationKey] || 0;
    const rotationClass = angle ? `rotated rotated-${angle}` : '';
    const wrapperWithSleeve = sleeveColor
      ? `${wrapperClasses} cell-image-wrapper--sleeve`
      : wrapperClasses;

    return (
      <div className={wrapperWithSleeve} title={imageName || undefined}>
        <img
          src={imageUrl}
          alt={imageName || ''}
          className={[
            'cell-image',
            extraImgClass,
            rotationClass,
            sleeveColor ? 'has-sleeve' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={
            sleeveColor
              ? { '--sleeve-color': sleeveColor, '--sleeve-width': `${SLEEVE_RING_PX}px` }
              : undefined
          }
          onLoad={(e) => {
            const wrapper = e.target.closest('.cell-image-wrapper');
            if (wrapper) fitImageToWrapper(e.target, wrapper);
          }}
        />
      </div>
    );
  };

  const renderSleevePicker = (side, row, col) => {
    if (
      !sleevePickerCell ||
      sleevePickerCell.side !== side ||
      sleevePickerCell.row !== row ||
      sleevePickerCell.col !== col
    ) {
      return null;
    }

    const cellKey = getRotationKey(side, row, col);
    const currentColor = sleeves[cellKey];

    return (
      <div
        ref={sleevePickerRef}
        className="cell-sleeve-picker"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cell-sleeve-picker-presets">
          {SLEEVE_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              className={`cell-sleeve-swatch${currentColor === color ? ' cell-sleeve-swatch--active' : ''}`}
              style={{ backgroundColor: color }}
              title={t('page.sleeveColor')}
              onClick={(e) => {
                e.stopPropagation();
                updateSleeveColor(side, row, col, color);
              }}
            />
          ))}
          <label
            className="cell-sleeve-custom"
            title={t('page.sleeveColor')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              type="color"
              value={currentColor || DEFAULT_SLEEVE_COLOR}
              onChange={(e) => updateSleeveColor(side, row, col, e.target.value)}
              onFocus={() => {
                colorPickerActiveRef.current = true;
              }}
              onBlur={() => {
                setTimeout(() => {
                  const active = document.activeElement;
                  if (sleevePickerRef.current?.contains(active)) return;
                  colorPickerActiveRef.current = false;
                }, 300);
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </label>
        </div>
        {currentColor && (
          <button
            type="button"
            className="cell-sleeve-remove"
            onClick={(e) => {
              e.stopPropagation();
              handleSleeveRemove(side, row, col);
            }}
          >
            {t('page.sleeveRemove')}
          </button>
        )}
      </div>
    );
  };

  const isSleevePickerOpenAt = (side, row, col) =>
    sleevePickerCell?.side === side &&
    sleevePickerCell?.row === row &&
    sleevePickerCell?.col === col;

  const getImageControlsClassName = (side, row, col) => {
    const open = isSleevePickerOpenAt(side, row, col);
    return [
      'cell-image-controls',
      open && sleevePickerFlip ? 'cell-image-controls--picker-above' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const renderSleeveButton = (side, row, col) => {
    const cellKey = getRotationKey(side, row, col);
    const hasSleeve = !!sleeves[cellKey];

    return (
      <button
        type="button"
        className={`cell-control-btn cell-control-sleeve${hasSleeve ? ' cell-control-sleeve--active' : ''}`}
        style={hasSleeve ? { '--sleeve-btn-color': sleeves[cellKey] } : undefined}
        onClick={(e) => handleSleeveButtonClick(e, side, row, col)}
        title={hasSleeve ? t('page.sleeveColor') : t('page.sleeve')}
      >
        ▢
      </button>
    );
  };

  const handleBackImageSelect = (e, row, col) => {
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    // Sayfa ID kontrolü
    if (!page.id) {
      console.error('Sayfa ID yok, resim yüklenemiyor');
      return;
    }
    const file = e.target.files[0];
    if (file) {
      // Resim sayısı kontrolü
      const currentImageCount = Object.keys(content).filter(key =>
        content[key] && typeof content[key] === 'string' && content[key].startsWith('data:image')
      ).length + Object.keys(backContent).filter(key =>
        backContent[key] && typeof backContent[key] === 'string' && backContent[key].startsWith('data:image')
      ).length;

      if (currentImageCount >= 20) {
        alert(tWithParams('page.maxImagesPerPage', { max: 20 }));
        return;
      }

      // localStorage kullanım kontrolü
      const usagePercent = getLocalStorageUsagePercent();
      if (usagePercent >= 95) {
        alert(t('page.storageFull'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        // Önce resmi sıkıştır, sonra oval kenarlar uygula
        compressImage(event.target.result, (compressedImage) => {
          applyRoundedCorners(compressedImage, (roundedImageDataUrl) => {
            const key = `${row}-${col}`;
            // Sadece bu cep için güncelleme yap
            updatePageWithState(
              undefined,
              (prevBackContent) => {
                // Sadece bu sayfanın backContent'ini güncelle
                return { ...prevBackContent, [key]: roundedImageDataUrl };
              },
              undefined
            );
          });
        });
      };
      reader.readAsDataURL(file);
      // Input'un value'sunu temizle ki aynı dosya tekrar seçilebilsin
      e.target.value = '';
    }
  };

  const handleRemoveBackImage = (e, row, col) => {
    e.stopPropagation();
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    const key = `${row}-${col}`;
    // Sadece bu cep için güncelleme yap
    const backRotKey = getRotationKey('back', row, col);
    updatePageWithState(
      undefined,
      (prevBackContent) => {
        const newContent = { ...prevBackContent };
        delete newContent[key];
        return newContent;
      },
      (prevRotated) => {
        const next = { ...prevRotated };
        delete next[backRotKey];
        return next;
      },
      (prevSleeves) => {
        const next = { ...prevSleeves };
        delete next[backRotKey];
        return next;
      }
    );
  };

  const handleReplaceBackImage = (e, row, col) => {
    e.stopPropagation();
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    // Sayfa ID kontrolü
    if (!page.id) {
      return;
    }

    if (imageInputMode === 'url') {
      // URL modu: URL input göster
      setUrlInputCell({ row, col, side: 'back' });
      setUrlInputValue('');
    } else if (imageInputMode === 'gallery' && galleryUrls.length > 0) {
      // Galeri modu: Galeri modalını göster
      setGalleryCell({ row, col, side: 'back' });
      setShowGallery(true);
    } else if (imageInputMode === 'defaultGallery' && defaultGalleryUrls.length > 0) {
      // Default gallery modu: Default gallery modalını göster
      setDefaultGalleryCell({ row, col, side: 'back' });
      setShowDefaultGallery(true);
    } else {
      // File modu: Dosya seçiciyi aç
      const inputKey = `${page.id}-back-${row}-${col}`;
      if (!backFileInputRefs.current[inputKey]) {
        backFileInputRefs.current[inputKey] = document.createElement('input');
        backFileInputRefs.current[inputKey].type = 'file';
        backFileInputRefs.current[inputKey].accept = 'image/*';
        backFileInputRefs.current[inputKey].onchange = (e) => {
          if (isTopPage && pointerEvents === 'auto' && page.id) {
            handleBackImageSelect(e, row, col);
          }
        };
      }
      backFileInputRefs.current[inputKey].click();
    }
  };

  const handleRotateBackImage = (e, row, col) => {
    e.stopPropagation();
    // Alttaki sayfalar için işlemi engelle
    if (pointerEvents === 'none' || !isTopPage) {
      return;
    }
    // Sayfa ID kontrolü
    if (!page.id) {
      return;
    }

    const key = `${row}-${col}`;
    const backKey = `back-${key}`;
    const currentAngle = rotatedImages[backKey] || 0;
    
    // 90 derece artır
    const newAngle = (currentAngle + 90) % 360;

    // State'i güncelle (localStorage'a kaydedilecek)
    updatePageWithState(
      undefined,
      undefined,
      (prevRotatedImages) => {
        const newRotatedImages = { ...prevRotatedImages };
        if (newAngle === 0) {
          // 0 derece ise key'i kaldır (varsayılan)
          delete newRotatedImages[backKey];
        } else {
          newRotatedImages[backKey] = newAngle;
        }
        return newRotatedImages;
      }
    );
  }

  const { rows, cols } = getGridSize();
  const isTransparent = page.transparent !== false; // Varsayılan olarak şeffaf
  const ringHoles = 6; // 6 ring deliği

  // Sayfa pozisyonuna göre hangi yüzün gösterileceğini belirle
  // Sağ pozisyon → ön yüz gösterilmeli
  // Sol pozisyon → arka yüz gösterilmeli
  const shouldShowBack = pagePosition === 'left';
  const shouldShowFront = pagePosition === 'right';

  return (
    <>
      <div
        className={`page-container ${shouldShowBack ? 'flipped' : ''} ${pointerEvents === 'none' ? 'page-non-interactive' : ''}`}
        style={{
          pointerEvents,
          '--page-z-index': pageZIndex
        }}
      // Binder'a tıklama ile sayfa değiştirme kaldırıldı - sadece ileri/geri tuşları ile
      >
        <div
          className={`page ${isTransparent ? 'transparent' : ''} ${coverSide === 'left' ? 'page-left' : 'page-right'} page-type-${pageType} ${isSelected ? 'page-selected' : ''} page-front`}
          data-density="hard"
        >
          {/* Ring delikleri - grid hücrelerinin dışında */}
          <div className={`page-holes ${coverSide === 'left' ? 'holes-left' : 'holes-right'}`}>
            {Array.from({ length: ringHoles }).map((_, index) => (
              <div key={index} className="ring-hole"></div>
            ))}
          </div>

          <div className="page-content">
            <div
              className={`page-grid grid-${gridSize}`}
              style={{
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
              }}
            >
              {Array.from({ length: rows * cols }).map((_, index) => {
                const row = Math.floor(index / cols);
                const col = index % cols;
                const key = `${row}-${col}`;
                const cellContent = content[key] || '';

                const isImage = isImageContent(cellContent);
                const isText = cellContent && !isImage && typeof cellContent === 'string';
                const imageUrl = getImageUrl(cellContent);
                const imageName = getCellImageName(cellContent);

                const isLastCol = col === cols - 1;
                const isLastRow = row === rows - 1;
                const isFirstCol = col === 0;
                const isFirstRow = row === 0;
                const isHorizontal = rows > cols; // Yatay uzun cep (örneğin 3x1, 4x1)
                const cellClasses = [
                  'grid-cell',
                  isFirstCol ? 'cell-first-col' : '',
                  isFirstRow ? 'cell-first-row' : '',
                  isLastCol ? 'cell-last-col' : '',
                  isLastRow ? 'cell-last-row' : '',
                  getCellDragClassName('front', row, col, isImage)
                ].filter(Boolean).join(' ');

                // Yatay uzun cepler için resim hizalaması
                const imageWrapperClasses = [
                  'cell-image-wrapper',
                  isHorizontal && coverSide === 'right' ? 'align-right' : '',
                  isHorizontal && coverSide === 'left' ? 'align-left' : ''
                ].filter(Boolean).join(' ');

                return (
                  <div
                    key={`${page.id}-${row}-${col}`}
                    className={cellClasses}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCellClick(row, col);
                    }}
                    draggable={isImage && pointerEvents !== 'none' && isTopPage}
                    onTouchStart={handleCellTouchStart('front', row, col, isImage)}
                    onDragStart={(e) => handleImageDragStart(e, 'front', row, col)}
                    onDragOver={(e) => handleImageDragOver(e, 'front', row, col)}
                    onDragLeave={handleImageDragLeave}
                    onDrop={(e) => handleImageDrop(e, 'front', row, col)}
                    onDragEnd={handleImageDragEnd}
                    title={isImage && imageName ? imageName : undefined}
                    data-page-id={page.id}
                    data-side="front"
                    data-row={row}
                    data-col={col}
                  >
                    {isImage ? (
                      <>
                        {renderCellImage(imageUrl, imageName, key, sleeves[key], imageWrapperClasses)}
                        <div className={getImageControlsClassName('front', row, col)}>
                          <div className="cell-image-controls-buttons">
                            {renderSleeveButton('front', row, col)}
                            <button
                              type="button"
                              className="cell-control-btn cell-control-rotate"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRotateImage(e, row, col);
                              }}
                              title={t('page.rotateImage')}
                            >
                              ↻
                            </button>
                            <button
                              type="button"
                              className="cell-control-btn cell-control-remove"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveImage(e, row, col);
                              }}
                              title={t('page.removeImage')}
                            >
                              ×
                            </button>
                            <button
                              type="button"
                              className="cell-control-btn cell-control-replace"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleReplaceImage(e, row, col);
                              }}
                              title={t('page.replaceImage')}
                            >
                              +
                            </button>
                          </div>
                          {renderSleevePicker('front', row, col)}
                        </div>
                      </>
                    ) : isText ? (
                      <textarea
                        className="cell-input"
                        value={cellContent}
                        onChange={(e) => handleCellChange(row, col, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={t('page.textPlaceholder')}
                      />
                    ) : urlInputCell && urlInputCell.row === row && urlInputCell.col === col && urlInputCell.side === 'front' ? (
                      <div className="cell-url-input-container" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={urlInputValue}
                          onChange={(e) => setUrlInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUrlSubmit(row, col, 'front');
                            } else if (e.key === 'Escape') {
                              setUrlInputCell(null);
                              setUrlInputValue('');
                            }
                          }}
                          placeholder={t('settings.imageUrlPlaceholder')}
                          className="cell-url-input"
                          autoFocus
                        />
                        <div className="cell-url-buttons">
                          <button
                            className="cell-url-btn"
                            onClick={() => handleUrlSubmit(row, col, 'front')}
                            title={t('settings.apply')}
                          >
                            ✓
                          </button>
                          <button
                            className="cell-url-btn"
                            onClick={() => {
                              setUrlInputCell(null);
                              setUrlInputValue('');
                            }}
                            title={t('binder.cancel')}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="cell-placeholder">+</div>
                    )}
                  </div>
                );
              })}
            </div>



            {/* Sayfa numarası - ön yüz, sadece sağ pozisyonda göster */}
            {frontPageNumber !== null && shouldShowFront && (
              <div className={`page-number ${coverSide === 'left' ? 'page-number-left' : 'page-number-right'} ${isTopPage ? '' : 'page-number-hidden'}`}>
                {frontPageNumber}
              </div>
            )}
          </div>
        </div>

        {/* Arka yüz */}
        <div
          className={`page transparent ${coverSide === 'left' ? 'page-left' : 'page-right'} page-type-${pageType} page-back`}
          data-density="hard"
        >
          {/* Ring delikleri - arka yüzde de görünür */}
          <div className={`page-holes ${coverSide === 'left' ? 'holes-left' : 'holes-right'}`}>
            {Array.from({ length: ringHoles }).map((_, index) => (
              <div key={index} className="ring-hole"></div>
            ))}
          </div>

          <div className="page-content">
            <div
              className={`page-grid grid-${gridSize}`}
              style={{
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
              }}
            >
              {Array.from({ length: rows * cols }).map((_, index) => {
                const row = Math.floor(index / cols);
                const col = index % cols;

                // Ayna efekti: Arka yüzde kolonları ters çevir (sol-sağ yer değiştir)
                const mirroredCol = cols - 1 - col;
                // Arka yüzde görünen pozisyon (row, col) için, ön yüzdeki karşılık gelen pozisyon (row, mirroredCol)
                const frontKey = `${row}-${mirroredCol}`;
                // Arka yüz içeriği normal pozisyonda saklanıyor (mirroredCol değil, col kullanılmalı)
                // Çünkü handleBackCellClick ve handleGalleryImageSelect'te normal pozisyon kullanılıyor
                const backKey = `${row}-${col}`;

                // Ön yüz içeriğini kontrol et (ayna pozisyonundan - çünkü arka yüzde görünen hücrenin karşılığı)
                const frontCellContent = content[frontKey];
                const hasFrontImage = isImageContent(frontCellContent);

                // Arka yüz içeriğini kontrol et (normal pozisyondan - çünkü backContent normal pozisyonda saklanıyor)
                const backCellContent = backContent[backKey];

                // Eğer ön yüzde resim VAR ve arka yüzde resim YOK ise default görüntü göster
                // Eğer ön yüzde resim YOK ise default görüntü gösterme
                const shouldShowDefault = hasFrontImage && !isImageContent(backCellContent) && defaultBackImage;
                const backImageUrl = getImageUrl(backCellContent);
                const backImageName = getCellImageName(backCellContent);

                // Ön yüzdeki resmin çevrilmiş olup olmadığını kontrol et
                const isFrontImageRotated = rotatedImages[frontKey] === true;

                // Eğer ön yüzdeki resim çevrilmişse, çevrilmiş default resmi kullan
                const displayDefaultImage = (shouldShowDefault && isFrontImageRotated && rotatedDefaultBackImage)
                  ? rotatedDefaultBackImage
                  : defaultBackImage;

                const displayImage = backImageUrl || (shouldShowDefault ? displayDefaultImage : null);
                const isImage = displayImage && (displayImage.startsWith('data:image') || displayImage.startsWith('http://') || displayImage.startsWith('https://'));
                const isDefaultImage = !backImageUrl && shouldShowDefault;

                const isLastColBack = col === cols - 1;
                const isLastRowBack = row === rows - 1;
                const isFirstColBack = col === 0;
                const isFirstRowBack = row === 0;
                const isHorizontalBack = rows > cols; // Yatay uzun cep (örneğin 3x1, 4x1)
                const canDragBack = !!backImageUrl;
                const backCellClasses = [
                  'grid-cell',
                  isFirstColBack ? 'cell-first-col' : '',
                  isFirstRowBack ? 'cell-first-row' : '',
                  isLastColBack ? 'cell-last-col' : '',
                  isLastRowBack ? 'cell-last-row' : '',
                  getCellDragClassName('back', row, col, canDragBack)
                ].filter(Boolean).join(' ');

                // Arka yüz için yatay uzun cepler için resim hizalaması
                // Ayna efekti nedeniyle hizalama ters olmalı:
                // Sağ sayfa için: ön yüz sağa, arka yüz sola
                // Sol sayfa için: ön yüz sola, arka yüz sağa
                const backImageWrapperClasses = [
                  'cell-image-wrapper',
                  isHorizontalBack && coverSide === 'right' ? 'align-left' : '',
                  isHorizontalBack && coverSide === 'left' ? 'align-right' : ''
                ].filter(Boolean).join(' ');

                return (
                  <div
                    key={`${page.id}-back-${row}-${mirroredCol}`}
                    className={backCellClasses}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Arka yüzde görünen pozisyona tıklandığında, normal pozisyonu kullan
                      // Çünkü backContent normal pozisyonda saklanıyor
                      handleBackCellClick(row, col);
                    }}
                    draggable={canDragBack && pointerEvents !== 'none' && isTopPage}
                    onTouchStart={handleCellTouchStart('back', row, col, canDragBack)}
                    onDragStart={(e) => handleImageDragStart(e, 'back', row, col)}
                    onDragOver={(e) => handleImageDragOver(e, 'back', row, col)}
                    onDragLeave={handleImageDragLeave}
                    onDrop={(e) => handleImageDrop(e, 'back', row, col)}
                    onDragEnd={handleImageDragEnd}
                    title={isImage && backImageName ? backImageName : undefined}
                    data-page-id={page.id}
                    data-side="back"
                    data-row={row}
                    data-col={col}
                  >
                    {isImage ? (
                      <>
                        {renderCellImage(
                          displayImage,
                          backImageName,
                          `back-${backKey}`,
                          !isDefaultImage ? sleeves[`back-${backKey}`] : null,
                          backImageWrapperClasses,
                          isDefaultImage ? 'default-image' : ''
                        )}
                        <div className={getImageControlsClassName('back', row, col)}>
                          <div className="cell-image-controls-buttons">
                            {isDefaultImage ? (
                              <>
                                <button
                                  type="button"
                                  className="cell-control-btn cell-control-rotate"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleRotateBackImage(e, row, col);
                                  }}
                                  title={t('page.rotateImage')}
                                >
                                  ↻
                                </button>
                                <button
                                  type="button"
                                  className="cell-control-btn cell-control-replace"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleBackCellClick(row, col);
                                  }}
                                  title={t('page.replaceImage')}
                                >
                                  +
                                </button>
                              </>
                            ) : (
                              <>
                                {renderSleeveButton('back', row, col)}
                                <button
                                  type="button"
                                  className="cell-control-btn cell-control-rotate"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleRotateBackImage(e, row, col);
                                  }}
                                  title={t('page.rotateImage')}
                                >
                                  ↻
                                </button>
                                <button
                                  type="button"
                                  className="cell-control-btn cell-control-remove"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleRemoveBackImage(e, row, col);
                                  }}
                                  title={t('page.removeImage')}
                                >
                                  ×
                                </button>
                                <button
                                  type="button"
                                  className="cell-control-btn cell-control-replace"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleReplaceBackImage(e, row, col);
                                  }}
                                  title={t('page.replaceImage')}
                                >
                                  +
                                </button>
                              </>
                            )}
                          </div>
                          {!isDefaultImage && renderSleevePicker('back', row, col)}
                        </div>
                      </>
                    ) : urlInputCell && urlInputCell.row === row && urlInputCell.col === col && urlInputCell.side === 'back' ? (
                      <div className="cell-url-input-container" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={urlInputValue}
                          onChange={(e) => setUrlInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUrlSubmit(row, col, 'back');
                            } else if (e.key === 'Escape') {
                              setUrlInputCell(null);
                              setUrlInputValue('');
                            }
                          }}
                          placeholder={t('settings.imageUrlPlaceholder')}
                          className="cell-url-input"
                          autoFocus
                        />
                        <div className="cell-url-buttons">
                          <button
                            className="cell-url-btn"
                            onClick={() => handleUrlSubmit(row, col, 'back')}
                            title={t('settings.apply')}
                          >
                            ✓
                          </button>
                          <button
                            className="cell-url-btn"
                            onClick={() => {
                              setUrlInputCell(null);
                              setUrlInputValue('');
                            }}
                            title={t('binder.cancel')}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="cell-placeholder">+</div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Sayfa numarası - arka yüz, sadece sol pozisyonda göster */}
            {backPageNumber !== null && shouldShowBack && (
              <div className={`page-number ${coverSide === 'left' ? 'page-number-right' : 'page-number-left'} ${isTopPage ? '' : 'page-number-hidden'}`}>
                {backPageNumber}
              </div>
            )}
          </div>
        </div>

      </div>
      {/* Galeri Modalı - Portal ile body'ye render ediliyor */}
      {showGallery && galleryUrls.length > 0 && createPortal(
        <div className="gallery-modal" onClick={() => { setShowGallery(false); setGalleryCell(null); }}>
          <div className="gallery-content" onClick={(e) => e.stopPropagation()}>
            <GalleryWithFolders
              items={galleryUrls}
              onSelect={handleGalleryImageSelect}
              title={t('settings.selectFromGallery')}
              onClose={() => { setShowGallery(false); setGalleryCell(null); }}
              binderUsedImages={binderUsedImages}
              stateContext={GALLERY_UI_CONTEXT.CUSTOM}
              binderId={binderId}
            />
          </div>
        </div>,
        document.body
      )}
      
      {/* Default Gallery Modalı - Portal ile body'ye render ediliyor */}
      {showDefaultGallery && defaultGalleryUrls.length > 0 && createPortal(
        <div className="gallery-modal" onClick={() => { setShowDefaultGallery(false); setDefaultGalleryCell(null); }}>
          <div className="gallery-content" onClick={(e) => e.stopPropagation()}>
            <GalleryWithFolders
              items={defaultGalleryUrls}
              onSelect={handleDefaultGalleryImageSelect}
              title={t('settings.selectFromDefaultGallery') || 'Select from Default Gallery'}
              onClose={() => { setShowDefaultGallery(false); setDefaultGalleryCell(null); }}
              binderUsedImages={binderUsedImages}
              stateContext={GALLERY_UI_CONTEXT.DEFAULT}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default Page;

