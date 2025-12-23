import React from 'react';
import './Footer.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const Footer = () => {
  const { language, setLanguage } = useLanguage();
  const t = (key) => getTranslation(key, language);

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

