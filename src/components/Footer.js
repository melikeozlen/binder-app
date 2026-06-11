import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Footer.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { clearAllIndexedDB } from '../utils/indexedDB.js';

const INFO_SECTIONS = [
  {
    id: 'nav',
    titleKey: 'info.sec.nav.title',
    itemKeys: ['info.sec.nav.1', 'info.sec.nav.2'],
    defaultOpen: true,
  },
  {
    id: 'binder',
    titleKey: 'info.sec.binder.title',
    itemKeys: ['info.sec.binder.1', 'info.sec.binder.2', 'info.sec.binder.3', 'info.sec.binder.4', 'info.sec.binder.5', 'info.sec.binder.6'],
  },
  {
    id: 'pages',
    titleKey: 'info.sec.pages.title',
    itemKeys: ['info.sec.pages.1', 'info.sec.pages.2', 'info.sec.pages.3', 'info.sec.pages.4', 'info.sec.pages.5'],
  },
  {
    id: 'look',
    titleKey: 'info.sec.look.title',
    itemKeys: ['info.sec.look.1', 'info.sec.look.2', 'info.sec.look.3', 'info.sec.look.4'],
  },
  {
    id: 'file',
    titleKey: 'info.sec.file.title',
    itemKeys: ['info.sec.file.1', 'info.sec.file.2', 'info.sec.file.3'],
  },
  {
    id: 'url',
    titleKey: 'info.sec.url.title',
    itemKeys: ['info.sec.url.1', 'info.sec.url.2', 'info.sec.url.3', 'info.sec.url.4'],
  },
  {
    id: 'gallery',
    titleKey: 'info.sec.gallery.title',
    itemKeys: ['info.sec.gallery.1', 'info.sec.gallery.2', 'info.sec.gallery.3', 'info.sec.gallery.4', 'info.sec.gallery.5'],
    codeKey: 'info.sec.gallery.example',
    noteKey: 'info.sec.gallery.note',
  },
  {
    id: 'defaultGallery',
    titleKey: 'info.sec.defaultGallery.title',
    itemKeys: ['info.sec.defaultGallery.1', 'info.sec.defaultGallery.2', 'info.sec.defaultGallery.3'],
  },
  {
    id: 'backImage',
    titleKey: 'info.sec.backImage.title',
    itemKeys: ['info.sec.backImage.1', 'info.sec.backImage.2', 'info.sec.backImage.3', 'info.sec.backImage.4'],
  },
  {
    id: 'imageEdit',
    titleKey: 'info.sec.imageEdit.title',
    itemKeys: ['info.sec.imageEdit.1', 'info.sec.imageEdit.2', 'info.sec.imageEdit.3', 'info.sec.imageEdit.4', 'info.sec.imageEdit.5'],
  },
  {
    id: 'imageDrag',
    titleKey: 'info.sec.imageDrag.title',
    itemKeys: ['info.sec.imageDrag.1', 'info.sec.imageDrag.2', 'info.sec.imageDrag.3'],
  },
  {
    id: 'pageOrder',
    titleKey: 'info.sec.pageOrder.title',
    itemKeys: ['info.sec.pageOrder.1', 'info.sec.pageOrder.2', 'info.sec.pageOrder.3'],
  },
  {
    id: 'footer',
    titleKey: 'info.sec.footer.title',
    itemKeys: ['info.sec.footer.1', 'info.sec.footer.2', 'info.sec.footer.3', 'info.sec.footer.4', 'info.sec.footer.5', 'info.sec.footer.6'],
  },
];

const InfoCollapseSection = ({ section, isOpen, onToggle, t }) => (
  <div className={`info-collapse ${isOpen ? 'open' : ''}`}>
    <button
      type="button"
      className="info-collapse-header"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span className="info-collapse-chevron" aria-hidden="true">{isOpen ? '▼' : '▶'}</span>
      <span>{t(section.titleKey)}</span>
    </button>
    {isOpen && (
      <div className="info-collapse-body">
        <ul className="info-list">
          {section.itemKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        {section.codeKey && (
          <pre className="info-code-block">{t(section.codeKey)}</pre>
        )}
        {section.noteKey && (
          <p className="info-collapse-note">{t(section.noteKey)}</p>
        )}
      </div>
    )}
  </div>
);

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

const Footer = () => {
  const { language, setLanguage } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [openInfoSections, setOpenInfoSections] = useState(() =>
    Object.fromEntries(INFO_SECTIONS.map((s) => [s.id, !!s.defaultOpen]))
  );

  const toggleInfoSection = (id) => {
    setOpenInfoSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openInfoModal = () => {
    setOpenInfoSections(
      Object.fromEntries(INFO_SECTIONS.map((s) => [s.id, !!s.defaultOpen]))
    );
    setShowInfoModal(true);
  };

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
    const updateStorageInfo = () => {
      setStorageUsage(getLocalStorageUsagePercent());
    };

    updateStorageInfo();
    const interval = setInterval(updateStorageInfo, 2000);

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
          onClick={openInfoModal}
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
            {storageUsage.toFixed(1)}%
          </span>
        </div>
        {process.env.REACT_APP_BUILD_TIME && (
          <>
            <span className="footer-separator">•</span>
            <span className="footer-version">{process.env.REACT_APP_BUILD_TIME}</span>
          </>
        )}
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
              <p className="info-intro">{t('info.introDesc')}</p>
              <div className="info-collapse-list">
                {INFO_SECTIONS.map((section) => (
                  <InfoCollapseSection
                    key={section.id}
                    section={section}
                    isOpen={!!openInfoSections[section.id]}
                    onToggle={() => toggleInfoSection(section.id)}
                    t={t}
                  />
                ))}
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

