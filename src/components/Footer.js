import React, { useState, useEffect } from 'react';
import './Footer.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { getTotalImageCountFromIndexedDB } from '../utils/indexedDB.js';

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

const Footer = ({ pagesCount = 0 }) => {
  const { language, setLanguage } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);
  const [imageCount, setImageCount] = useState(0);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // localStorage durumunu periyodik olarak güncelle
  useEffect(() => {
    const updateStorageInfo = async () => {
      setStorageUsage(getLocalStorageUsagePercent());
      // IndexedDB'den resim sayısını al
      const count = await getTotalImageCountFromIndexedDB();
      setImageCount(count);
    };
    
    updateStorageInfo();
    const interval = setInterval(updateStorageInfo, 2000); // Her 2 saniyede bir güncelle
    
    return () => clearInterval(interval);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
  };

  const handleClearCache = () => {
    if (window.confirm(t('footer.clearCacheConfirm'))) {
      // Service Worker cache'ini temizle
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            caches.delete(name);
          });
        });
      }
      // localStorage'ı temizle
      localStorage.clear();
      // Sayfayı yenile
      window.location.reload();
    }
  };

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <span className="footer-text">{t('footer.copyright')}</span>
        <span className="footer-separator">•</span>
        <a 
          href="https://x.com/kepcang" 
          target="_blank" 
          rel="noopener noreferrer"
          className="footer-user"
        >
          {t('footer.user')}
        </a>
        <span className="footer-separator">•</span>
        {!isInstalled && deferredPrompt && (
          <>
            <button
              className="footer-install-btn"
              onClick={handleInstallClick}
              title={t('footer.installApp')}
            >
              📱 {t('footer.install')}
            </button>
            <span className="footer-separator">•</span>
          </>
        )}
        <button
          className="footer-clear-cache-btn"
          onClick={handleClearCache}
          title={t('footer.clearCache')}
        >
          🗑️ {t('footer.clearCache')}
        </button>
        <span className="footer-separator">•</span>
        <select
          className="footer-language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          title="Dil / Language / 언어"
        >
          <option value="tr">TR</option>
          <option value="en">EN</option>
          <option value="kr">KR</option>
        </select>
        <span className="footer-separator">•</span>
        <div className="footer-storage-info">
          <div className="footer-storage-bar-container">
            <div 
              className={`footer-storage-bar ${storageUsage >= 90 ? 'storage-critical' : storageUsage >= 75 ? 'storage-warning' : ''}`}
              style={{ width: `${Math.min(100, storageUsage)}%` }}
              title={`${storageUsage.toFixed(1)}% ${t('storage.usage')}`}
            ></div>
          </div>
          <span className="footer-storage-text">
            {storageUsage.toFixed(1)}% • {t('storage.pages')}: {pagesCount} • {t('storage.images')}: {imageCount}
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

