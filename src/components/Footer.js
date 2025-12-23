import React, { useState, useEffect } from 'react';
import './Footer.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const Footer = () => {
  const { language, setLanguage } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

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

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
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
      </div>
    </footer>
  );
};

export default Footer;

