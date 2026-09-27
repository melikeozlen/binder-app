import React from 'react';
import './BuyMeCoffee.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const BMC_URL = 'https://buymeacoffee.com/mellizy';

const BuyMeCoffee = () => {
  const { language } = useLanguage();
  const label = getTranslation('footer.supportProject', language);

  return (
    <a
      className="buy-me-coffee"
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      <span className="buy-me-coffee-emoji" aria-hidden="true">
        ☕
      </span>
      <span className="buy-me-coffee-tooltip" role="tooltip">
        {label}
      </span>
    </a>
  );
};

export default BuyMeCoffee;
