import React from 'react';
import './BuyMeCoffee.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const BMC_URL = 'https://buymeacoffee.com/mellizy';
const APP_SHARE_URL = 'https://binder-app.up.railway.app/';

const buildTwitterShareUrl = (text) => {
  const params = new URLSearchParams({
    text: `${text}\n${APP_SHARE_URL}`,
  });
  return `https://x.com/intent/tweet?${params.toString()}`;
};

const BuyMeCoffee = () => {
  const { language } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const supportLabel = t('footer.supportProject');
  const shareLabel = t('footer.shareTwitter');

  return (
    <div className="bmc-stack">
      <a
        className="bmc-share"
        href={buildTwitterShareUrl(t('footer.shareTwitterText'))}
        target="_blank"
        rel="noopener noreferrer"
        title={shareLabel}
        aria-label={shareLabel}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.863L1.254 2.25H8.08l4.254 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
      </a>
      <a
        className="buy-me-coffee"
        href={BMC_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={supportLabel}
      >
        <span className="buy-me-coffee-emoji" aria-hidden="true">
          ☕
        </span>
        <span className="buy-me-coffee-tooltip" role="tooltip">
          {supportLabel}
        </span>
      </a>
    </div>
  );
};

export default BuyMeCoffee;
