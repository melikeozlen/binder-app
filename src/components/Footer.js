import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Footer.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { getTotalImageCountFromIndexedDB, clearAllIndexedDB } from '../utils/indexedDB.js';

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
  const [showInfoModal, setShowInfoModal] = useState(false);

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

  const handleClearCache = async () => {
    if (window.confirm(t('footer.clearCacheConfirm'))) {
      try {
        // IndexedDB'yi temizle
        await clearAllIndexedDB();
        
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
      } catch (error) {
        console.error('Önbellek temizlenirken hata:', error);
        // Hata olsa bile localStorage'ı temizle ve sayfayı yenile
        localStorage.clear();
        window.location.reload();
      }
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
        <button
          className="footer-info-btn"
          onClick={() => setShowInfoModal(true)}
          title={t('info.title')}
        >
          ℹ️ {t('info.button')}
        </button>
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

      {/* Info Modal */}
      {showInfoModal && createPortal(
        <div 
          className="info-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowInfoModal(false);
            }
          }}
        >
          <div className="info-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="info-modal-header">
              <h2>{t('info.title')}</h2>
              <button
                className="info-modal-close"
                onClick={() => setShowInfoModal(false)}
                title={t('info.close')}
              >
                ×
              </button>
            </div>
            <div className="info-modal-body">
              <div className="info-section">
                <h3>{t('info.intro')}</h3>
                <p>{t('info.introDesc')}</p>
              </div>

              <div className="info-section">
                <h3>{t('info.settingsHeader')}</h3>
                <p>{t('info.settingsHeaderDesc')}</p>
                
                <div className="info-subsection">
                  <h4>{t('info.fullscreen')}</h4>
                  <p>{t('info.fullscreenDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.binderSelect')}</h4>
                  <p>{t('info.binderSelectDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.binderType')}</h4>
                  <p>{t('info.binderTypeDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.binderColor')}</h4>
                  <p>{t('info.binderColorDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.ringColor')}</h4>
                  <p>{t('info.ringColorDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.backgroundColor')}</h4>
                  <p>{t('info.backgroundColorDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.width')}</h4>
                  <p>{t('info.widthDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.height')}</h4>
                  <p>{t('info.heightDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.grid')}</h4>
                  <p>{t('info.gridDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.pageType')}</h4>
                  <p>{t('info.pageTypeDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.imageInputMode')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.imageInputModeDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.loadTextFile')}</h4>
                  <p>{t('info.loadTextFileDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.backImage')}</h4>
                  <p>{t('info.backImageDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.addPage')}</h4>
                  <p>{t('info.addPageDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.deletePages')}</h4>
                  <p>{t('info.deletePagesDesc')}</p>
                </div>
              </div>

              <div className="info-section">
                <h3>{t('info.imageMethods')}</h3>
                <p>{t('info.imageMethodsDesc')}</p>
                
                <div className="info-subsection">
                  <h4>{t('info.methodFile')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.methodFileDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.methodUrl')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.methodUrlDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.methodGallery')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.methodGalleryDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.methodDefault')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.methodDefaultDesc')}</p>
                </div>
              </div>

              <div className="info-section">
                <h3>{t('info.txtFormat')}</h3>
                <p>{t('info.txtFormatDesc')}</p>
                
                <div className="info-subsection">
                  <h4>{t('info.txtFormat1')}</h4>
                  <pre className="info-code-block">{t('info.txtFormat1Example')}</pre>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.txtFormat2')}</h4>
                  <pre className="info-code-block">{t('info.txtFormat2Example')}</pre>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.txtFormatRules')}</h4>
                  <ul className="info-list">
                    <li>{t('info.txtFormatRules1')}</li>
                    <li>{t('info.txtFormatRules2')}</li>
                    <li>{t('info.txtFormatRules3')}</li>
                    <li>{t('info.txtFormatRules4')}</li>
                    <li>{t('info.txtFormatRules5')}</li>
                  </ul>
                </div>
              </div>

              <div className="info-section">
                <h3>{t('info.pageManagement')}</h3>
                <p>{t('info.pageManagementDesc')}</p>
                
                <div className="info-subsection">
                  <h4>{t('info.pageOrder')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.pageOrderDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.pageEdit')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.pageEditDesc')}</p>
                </div>
                
                <div className="info-subsection">
                  <h4>{t('info.imageEdit')}</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{t('info.imageEditDesc')}</p>
                </div>
              </div>

              <div className="info-section">
                <h3>{t('info.storage')}</h3>
                <p style={{ whiteSpace: 'pre-line' }}>{t('info.storageDesc')}</p>
              </div>

              <div className="info-section">
                <h3>{t('info.tips')}</h3>
                <ul className="info-list">
                  <li>{t('info.tips1')}</li>
                  <li>{t('info.tips2')}</li>
                  <li>{t('info.tips3')}</li>
                  <li>{t('info.tips4')}</li>
                  <li>{t('info.tips5')}</li>
                </ul>
              </div>
            </div>
            <div className="info-modal-footer">
              <button
                className="info-modal-close-btn"
                onClick={() => setShowInfoModal(false)}
              >
                {t('info.close')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </footer>
  );
};

export default Footer;

