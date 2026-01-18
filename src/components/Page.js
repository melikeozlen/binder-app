import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Page.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { loadDefaultGallery } from '../utils/defaultGallery';

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
  leafNumber = null,
  isTopPage = true,
  imageInputMode = 'defaultGallery',
  galleryUrls = []
}) => {
  const { language } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [content, setContent] = useState(page.content || {});
  const [backContent, setBackContent] = useState(page.backContent || {});
  const [rotatedImages, setRotatedImages] = useState(page.rotatedImages || {}); // Çevrilmiş resimlerin takibi
  const [rotatedDefaultBackImage, setRotatedDefaultBackImage] = useState(null); // Çevrilmiş default arka yüz resmi
  const [urlInputValue, setUrlInputValue] = useState('');
  const [urlInputCell, setUrlInputCell] = useState(null); // {row, col, side: 'front'|'back'}
  const [showGallery, setShowGallery] = useState(false);
  const [gallerySearchTerm, setGallerySearchTerm] = useState('');
  const [galleryCell, setGalleryCell] = useState(null); // {row, col, side: 'front'|'back'}
  const [defaultGalleryUrls, setDefaultGalleryUrls] = useState([]);
  const [showDefaultGallery, setShowDefaultGallery] = useState(false);
  const [defaultGallerySearchTerm, setDefaultGallerySearchTerm] = useState('');
  const [defaultGalleryCell, setDefaultGalleryCell] = useState(null); // {row, col, side: 'front'|'back'}
  const fileInputRefs = useRef({});
  const backFileInputRefs = useRef({});

  const wrapperRef = useRef(null);

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

  // Güncel state'leri ref'lerde sakla (closure sorunlarını önlemek için)
  const contentRef = useRef(content);
  const backContentRef = useRef(backContent);
  const rotatedImagesRef = useRef(rotatedImages);

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

  // page prop'u değiştiğinde local state'i güncelle (localStorage'dan yüklendiğinde)
  // Her sayfa unique ID'ye sahip ve kendi verilerini tutmalı
  const prevPageIdRef = useRef(null);
  const prevPageDataRef = useRef(null);

  useEffect(() => {
    // Sayfa ID'si değiştiğinde veya sayfa verileri değiştiğinde state'i güncelle
    const pageDataString = JSON.stringify({
      content: page.content,
      backContent: page.backContent,
      rotatedImages: page.rotatedImages
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
        contentRef.current = {};
        backContentRef.current = {};
        rotatedImagesRef.current = {};
      }

      // Yeni sayfanın verilerini yükle
      const newContent = page.content ? { ...page.content } : {};
      const newBackContent = page.backContent ? { ...page.backContent } : {};
      const newRotatedImages = page.rotatedImages ? { ...page.rotatedImages } : {};

      setContent(newContent);
      setBackContent(newBackContent);
      setRotatedImages(newRotatedImages);

      // Ref'leri de güncelle
      contentRef.current = newContent;
      backContentRef.current = newBackContent;
      rotatedImagesRef.current = newRotatedImages;

      prevPageIdRef.current = page.id;
      prevPageDataRef.current = pageDataString;
    }
  }, [page.id, page.content, page.backContent, page.rotatedImages]); // Tüm sayfa verilerini dinle

  // State güncellemesi yapıp onUpdate'i çağıran helper fonksiyon
  // Bu fonksiyon sadece belirtilen cep için güncelleme yapar
  // Sayfa ID kontrolü yaparak yanlış sayfaya kaydetmeyi önler
  const updatePageWithState = useCallback((contentUpdate, backContentUpdate, rotatedImagesUpdate) => {
    // Sayfa ID kontrolü - eğer sayfa değiştiyse güncelleme yapma
    const currentPageId = page.id;
    if (!currentPageId) {
      console.warn('Sayfa ID yok, güncelleme yapılamıyor');
      return;
    }

    let updateCount = 0;
    const totalUpdates = [contentUpdate, backContentUpdate, rotatedImagesUpdate].filter(u => u !== undefined).length;

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
    if (typeof cellContent === 'object' && cellContent.image) {
      return cellContent.image;
    }
    return null;
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

    // item string ise (eski format), object'e çevir
    const url = typeof item === 'string' ? item : item.url;

    const { row, col, side } = galleryCell;
    if (side === 'front') {
      const key = `${row}-${col}`;
      updatePageWithState(
        (prevContent) => ({ ...prevContent, [key]: url }),
        undefined,
        undefined
      );
    } else {
      const key = `${row}-${col}`;
      updatePageWithState(
        undefined,
        (prevBackContent) => ({ ...prevBackContent, [key]: url }),
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

    // item string ise (eski format), object'e çevir
    const url = typeof item === 'string' ? item : item.url;

    const { row, col, side } = defaultGalleryCell;
    if (side === 'front') {
      const key = `${row}-${col}`;
      updatePageWithState(
        (prevContent) => ({ ...prevContent, [key]: url }),
        undefined,
        undefined
      );
    } else {
      const key = `${row}-${col}`;
      updatePageWithState(
        undefined,
        (prevBackContent) => ({ ...prevBackContent, [key]: url }),
        undefined
      );
    }
    setShowDefaultGallery(false);
    setDefaultGalleryCell(null);
  };

  // Resim adını kısalt
  const truncateName = (name, maxLength = 15) => {
    if (!name) return '';
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + '...';
  };

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
      undefined
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

  const updateRotatedImageSize = useCallback((img, wrapperWidth, wrapperHeight) => {
    // Resmin orijinal boyutlarını al
    const imgW = img.naturalWidth || img.width || 1;
    const imgH = img.naturalHeight || img.height || 1;
    
    // Resim henüz yüklenmemişse bekle
    if (imgW === 0 || imgH === 0) {
      if (!img.complete) {
        const handleLoad = () => {
          updateRotatedImageSize(img, wrapperWidth, wrapperHeight);
          img.removeEventListener('load', handleLoad);
        };
        img.addEventListener('load', handleLoad, { once: true });
      }
      return;
    }

    // Hangi açıda döndürülmüş?
    let rotationAngle = 0;
    if (img.classList.contains('rotated-90')) rotationAngle = 90;
    else if (img.classList.contains('rotated-180')) rotationAngle = 180;
    else if (img.classList.contains('rotated-270')) rotationAngle = 270;
    else if (img.classList.contains('rotated-0')) rotationAngle = 0;

    // CONTAIN mantığı: Döndürülmüş resmin kapladığı alanı hesapla
    const radians = rotationAngle * Math.PI / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));

    // Döndürülmüş resmin kapladığı alan
    const rotatedW = imgW * cos + imgH * sin;
    const rotatedH = imgW * sin + imgH * cos;

    // CONTAIN: wrapper içine sığdır (kesilme yok)
    const scale = Math.min(wrapperWidth / rotatedW, wrapperHeight / rotatedH);

    // Resmin boyutunu scale ile ayarla
    img.style.width = imgW * scale + "px";
    img.style.height = imgH * scale + "px";
  }, []);

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
  // ResizeObserver: Tüm döndürülmüş resimler için boyutlandırma (CONTAIN mantığı)
  useEffect(() => {
    const wrappers = document.querySelectorAll('.cell-image-wrapper');

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const wrapper = entry.target;
        const img = wrapper.querySelector('.cell-image.rotated');
        if (!img) continue; // Döndürülmüş resim yoksa atla

        const wrapperWidth = entry.contentRect.width;
        const wrapperHeight = entry.contentRect.height;
        
        // CONTAIN mantığı ile boyutlandır
        requestAnimationFrame(() => {
          updateRotatedImageSize(img, wrapperWidth, wrapperHeight);
        });
      }
    });

    wrappers.forEach(w => observer.observe(w));

    return () => observer.disconnect();
  }, [content, backContent, updateRotatedImageSize]);

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
    updatePageWithState(
      undefined,
      (prevBackContent) => {
        const newContent = { ...prevBackContent };
        delete newContent[key];
        return newContent;
      },
      undefined
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

                // Sağ sayfa: ilk kolondaki hücrelerin sol kenarında dikiş izi olmamalı (ring tarafı)
                // Sol sayfa: son kolondaki hücrelerin sağ kenarında dikiş izi olmamalı (ring tarafı)
                const isFirstCol = col === 0;
                const isLastCol = col === cols - 1;
                const isHorizontal = rows > cols; // Yatay uzun cep (örneğin 3x1, 4x1)
                const cellClasses = [
                  'grid-cell',
                  coverSide === 'right' && isFirstCol ? 'no-left-border' : '',
                  coverSide === 'left' && isLastCol ? 'no-right-border' : ''
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
                    data-page-id={page.id}
                    data-row={row}
                    data-col={col}
                  >
                    {isImage ? (
                      <>
                        <div className={imageWrapperClasses} ref={wrapperRef}>
                          <img
                            src={imageUrl}
                            alt=""
                            className={`cell-image ${(() => {
                              const angle = rotatedImages[key] || 0;
                              return `rotated rotated-${angle}`;
                            })()}`}
                            onLoad={(e) => {
                              // Resim yüklendiğinde boyutlandır
                              const wrapper = e.target.closest('.cell-image-wrapper');
                              if (wrapper) {
                                updateRotatedImageSize(e.target, wrapper.clientWidth, wrapper.clientHeight);
                              }
                            }}
                          />
                        </div>
                        <div className="cell-image-controls">
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
            {/* Yaprak numarası - ön yüz, sağ sayfa */}
            {leafNumber !== null && shouldShowFront && (
              <div className="page-leaf-number page-leaf-number-right">
                {t('binder.leaf')} {leafNumber}
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

                // Ön yüzdeki resmin çevrilmiş olup olmadığını kontrol et
                const isFrontImageRotated = rotatedImages[frontKey] === true;

                // Eğer ön yüzdeki resim çevrilmişse, çevrilmiş default resmi kullan
                const displayDefaultImage = (shouldShowDefault && isFrontImageRotated && rotatedDefaultBackImage)
                  ? rotatedDefaultBackImage
                  : defaultBackImage;

                const displayImage = backImageUrl || (shouldShowDefault ? displayDefaultImage : null);
                const isImage = displayImage && (displayImage.startsWith('data:image') || displayImage.startsWith('http://') || displayImage.startsWith('https://'));
                const isDefaultImage = !backImageUrl && shouldShowDefault;

                // Arka yüz için de aynı mantık: sağ sayfa için ilk kolon, sol sayfa için son kolon
                // Ama arka yüzde ayna efekti var, bu yüzden görünen pozisyona göre kontrol et
                const isFirstColBack = col === 0;
                const isLastColBack = col === cols - 1;
                const isHorizontalBack = rows > cols; // Yatay uzun cep (örneğin 3x1, 4x1)
                const backCellClasses = [
                  'grid-cell',
                  coverSide === 'right' && isFirstColBack ? 'no-left-border' : '',
                  coverSide === 'left' && isLastColBack ? 'no-right-border' : ''
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
                    data-page-id={page.id}
                    data-row={row}
                    data-col={mirroredCol}
                    data-side="back"
                  >
                    {isImage ? (
                      <>
                        <div className={backImageWrapperClasses}>
                          <img
                            src={displayImage}
                            alt=""
                            className={`cell-image ${isDefaultImage ? 'default-image' : ''} ${(() => {
                              const backRotationKey = `back-${backKey}`;
                              const angle = rotatedImages[backRotationKey] || 0;
                              return `rotated rotated-${angle}`;
                            })()}`}
                            onLoad={(e) => {
                              // Resim yüklendiğinde boyutlandır
                              const wrapper = e.target.closest('.cell-image-wrapper');
                              if (wrapper) {
                                updateRotatedImageSize(e.target, wrapper.clientWidth, wrapper.clientHeight);
                              }
                            }}
                          />
                        </div>
                        <div className="cell-image-controls">
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
            {/* Yaprak numarası - arka yüz, sol sayfa */}
            {leafNumber !== null && shouldShowBack && (
              <div className="page-leaf-number page-leaf-number-left">
                {t('binder.leaf')} {leafNumber}
              </div>
            )}
          </div>
        </div>

      </div>
      {/* Galeri Modalı - Portal ile body'ye render ediliyor */}
      {showGallery && galleryUrls.length > 0 && createPortal(
        <div className="gallery-modal" onClick={() => { setShowGallery(false); setGalleryCell(null); }}>
          <div className="gallery-content" onClick={(e) => e.stopPropagation()}>
            <div className="gallery-header">
              <h3>{t('settings.selectFromGallery')}</h3>
              <div className="gallery-search-container">
                <div className="gallery-search-wrapper">
                  <input
                    type="text"
                    className="gallery-search-input"
                    placeholder={t('settings.searchGallery')}
                    value={gallerySearchTerm}
                    onChange={(e) => setGallerySearchTerm(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  {gallerySearchTerm && (
                    <button
                      className="gallery-search-clear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGallerySearchTerm('');
                      }}
                      title={t('settings.clear')}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <button
                className="gallery-close"
                onClick={() => { setShowGallery(false); setGalleryCell(null); }}
                title={t('binder.cancel')}
              >
                ×
              </button>
            </div>
            <div className="gallery-grid">
              {galleryUrls
                .filter((item) => {
                  if (!gallerySearchTerm.trim()) return true;
                  const name = typeof item === 'string' ? '' : (item.name || '');
                  return name.toLowerCase().includes(gallerySearchTerm.toLowerCase());
                })
                .map((item, index) => {
                  // Eski format desteği (sadece URL string)
                  const url = typeof item === 'string' ? item : item.url;
                  const name = typeof item === 'string' ? '' : (item.name || '');
                  const displayName = truncateName(name);

                  return (
                    <div
                      key={index}
                      className="gallery-item"
                      onClick={(e) => handleGalleryImageSelect(e, item)}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={name || `Gallery ${index + 1}`}
                    >
                      <img
                        src={url}
                        alt={name || `Gallery ${index + 1}`}
                        draggable="false"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling && e.target.nextSibling.className === 'gallery-item-error') {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                        onLoad={(e) => {
                          e.target.style.display = 'block';
                        }}
                      />
                      {name && (
                        <div className="gallery-item-name" title={name}>
                          {displayName}
                        </div>
                      )}
                      <div className="gallery-item-error" style={{ display: 'none' }}>
                        {t('settings.imageLoadError')}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Default Gallery Modalı - Portal ile body'ye render ediliyor */}
      {showDefaultGallery && defaultGalleryUrls.length > 0 && createPortal(
        <div className="gallery-modal" onClick={() => { setShowDefaultGallery(false); setDefaultGalleryCell(null); }}>
          <div className="gallery-content" onClick={(e) => e.stopPropagation()}>
            <div className="gallery-header">
              <h3>{t('settings.selectFromDefaultGallery') || 'Select from Default Gallery'}</h3>
              <div className="gallery-search-container">
                <div className="gallery-search-wrapper">
                  <input
                    type="text"
                    className="gallery-search-input"
                    placeholder={t('settings.searchGallery')}
                    value={defaultGallerySearchTerm}
                    onChange={(e) => setDefaultGallerySearchTerm(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  {defaultGallerySearchTerm && (
                    <button
                      className="gallery-search-clear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDefaultGallerySearchTerm('');
                      }}
                      title={t('settings.clear')}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <button
                className="gallery-close"
                onClick={() => { setShowDefaultGallery(false); setDefaultGalleryCell(null); }}
                title={t('binder.cancel')}
              >
                ×
              </button>
            </div>
            <div className="gallery-grid">
              {defaultGalleryUrls
                .filter((item) => {
                  if (!defaultGallerySearchTerm.trim()) return true;
                  const name = typeof item === 'string' ? '' : (item.name || '');
                  return name.toLowerCase().includes(defaultGallerySearchTerm.toLowerCase());
                })
                .map((item, index) => {
                  // Eski format desteği (sadece URL string)
                  const url = typeof item === 'string' ? item : item.url;
                  const name = typeof item === 'string' ? '' : (item.name || '');
                  const displayName = truncateName(name);

                  return (
                    <div
                      key={index}
                      className="gallery-item"
                      onClick={(e) => handleDefaultGalleryImageSelect(e, item)}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={name || `Default Gallery ${index + 1}`}
                    >
                      <img
                        src={url}
                        alt={name || `Default Gallery ${index + 1}`}
                        draggable="false"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling && e.target.nextSibling.className === 'gallery-item-error') {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                        onLoad={(e) => {
                          e.target.style.display = 'block';
                        }}
                      />
                      {name && (
                        <div className="gallery-item-name" title={name}>
                          {displayName}
                        </div>
                      )}
                      <div className="gallery-item-error" style={{ display: 'none' }}>
                        {t('settings.imageLoadError')}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default Page;

