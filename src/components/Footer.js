import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Footer.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import AuthModal from './AuthModal';
import AdminStatsModal from './AdminStats';
import FeedbackModal from './FeedbackModal';

const SYNC_ICONS = {
  idle: '',
  syncing: '⟳',
  synced: '✓',
  error: '!',
};

const INFO_SECTIONS = [
  {
    id: 'basics',
    titleKey: 'info.sec.basics.title',
    itemKeys: ['info.sec.basics.1', 'info.sec.basics.2', 'info.sec.basics.3'],
    defaultOpen: true,
  },
  {
    id: 'addImages',
    titleKey: 'info.sec.addImages.title',
    itemKeys: [
      'info.sec.addImages.1',
      'info.sec.addImages.2',
      'info.sec.addImages.3',
      'info.sec.addImages.4',
      'info.sec.addImages.5',
      'info.sec.addImages.6',
    ],
    defaultOpen: true,
  },
  {
    id: 'pages',
    titleKey: 'info.sec.pages.title',
    itemKeys: ['info.sec.pages.1', 'info.sec.pages.2', 'info.sec.pages.3'],
  },
  {
    id: 'images',
    titleKey: 'info.sec.images.title',
    itemKeys: ['info.sec.images.1', 'info.sec.images.2', 'info.sec.images.3'],
  },
  {
    id: 'more',
    titleKey: 'info.sec.more.title',
    itemKeys: ['info.sec.more.1', 'info.sec.more.2'],
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

const Footer = ({ syncStatus = 'idle', onSyncNow, shares }) => {
  const incomingCount = shares?.incoming?.length || 0;
  const { language, setLanguage } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const { user, available: authAvailable, status: authStatus, loginRequest } = useAuth();
  const { confirm } = useConfirm();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Başka bir yerden (örn. binder "Kaydet" butonu) giriş istendi → pencereyi aç
  useEffect(() => {
    if (loginRequest > 0) setShowAuthModal(true);
  }, [loginRequest]);
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
    const ok = await confirm({
      title: t('dialog.title.clearCache'),
      message: t('footer.clearCacheConfirm'),
      confirmLabel: t('dialog.continue'),
      cancelLabel: t('dialog.cancel'),
      danger: true,
    });
    if (!ok) return;

    try {
      // Service Worker'ları kaldır (eski sürüm / ikon takılı kalsın diye)
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      // Cache Storage (SW önbelleği + tarayıcı cache API)
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }

      // Oturum önbelleği
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }

      // Hard reload — tarayıcı disk cache'ini de atlat
      const url = new URL(window.location.href);
      url.searchParams.set('_refresh', String(Date.now()));
      window.location.replace(url.toString());
    } catch (error) {
      console.error('Önbellek temizlenirken hata:', error);
      window.location.reload(true);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-content">
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
        {authAvailable && authStatus === 'ready' && (
          <>
            <button
              className={`footer-account-btn${user ? ' footer-account-btn--user' : ' footer-account-btn--login'}`}
              onClick={() => setShowAuthModal(true)}
              title={user ? `${user.username} · ${t(`auth.status.${syncStatus}`)}` : t('auth.login')}
            >
              {user ? (
                <>
                  ☁️ <span className="footer-account-email">{user.username}</span>
                  {SYNC_ICONS[syncStatus] && (
                    <span className={`footer-account-sync footer-account-sync--${syncStatus}`}>
                      {SYNC_ICONS[syncStatus]}
                    </span>
                  )}
                  {incomingCount > 0 && (
                    <span className="footer-account-badge" title={t('share.incomingBadge')}>
                      {incomingCount}
                    </span>
                  )}
                </>
              ) : (
                <>👤 {t('auth.login')}</>
              )}
            </button>
            <span className="footer-separator">•</span>
            {user?.isAdmin && (
              <>
                <button
                  type="button"
                  className="footer-stats-btn"
                  onClick={() => setShowStatsModal(true)}
                  title={t('stats.title')}
                >
                  📊 {t('stats.title')}
                </button>
                <span className="footer-separator">•</span>
              </>
            )}
          </>
        )}
        <button
          className="footer-info-btn"
          onClick={openInfoModal}
          title={t('info.title')}
        >
          ℹ️ {t('info.button')}
        </button>
        <span className="footer-separator">•</span>
        <button
          type="button"
          className="footer-feedback-btn"
          onClick={() => setShowFeedbackModal(true)}
          title={t('feedback.title')}
          aria-label={t('feedback.title')}
        >
          💬 {t('feedback.sendShort')}
        </button>
        <span className="footer-separator">•</span>
        <select
          className="footer-language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label={t('footer.language')}
          title={t('footer.language')}
        >
          <option value="en">EN</option>
          <option value="tr">TR</option>
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
            {storageUsage.toFixed(1)}%
          </span>
        </div>
        {(process.env.REACT_APP_BUILD_NUMBER || process.env.REACT_APP_BUILD_SHA) && (
          <>
            <span className="footer-separator">•</span>
            <span className="footer-version" title={process.env.REACT_APP_BUILD_SHA || undefined}>
              {process.env.REACT_APP_BUILD_NUMBER
                ? `v${process.env.REACT_APP_BUILD_NUMBER}`
                : process.env.REACT_APP_BUILD_SHA}
            </span>
          </>
        )}
      </div>

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
        shares={shares}
      />
      <AdminStatsModal open={showStatsModal} onClose={() => setShowStatsModal(false)} />
      <FeedbackModal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />

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
              <div className="info-brand">
                <a
                  href="https://x.com/kepcang"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="info-brand-user"
                >
                  {t('footer.user')}
                </a>
                <span className="info-brand-rights">
                  © {currentYear} · {t('info.rights')}
                </span>
              </div>
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
              <div className="info-modal-footer-left">
                <button
                  type="button"
                  className="info-reset-btn"
                  onClick={handleClearCache}
                  title={t('footer.clearCacheHelp')}
                >
                  🗑️ {t('footer.clearCache')}
                </button>
              </div>
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

