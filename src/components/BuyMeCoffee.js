import React from 'react';
import './BuyMeCoffee.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const BMC_URL = 'https://buymeacoffee.com/mellizy';

const BuyMeCoffee = () => {
  const { language } = useLanguage();
  const title = getTranslation('footer.buyMeCoffee', language);

  return (
    <a
      className="buy-me-coffee"
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
    >
      <svg
        className="buy-me-coffee-icon"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M18.5 5H4a1 1 0 0 0-1 1v8.5A3.5 3.5 0 0 0 6.5 18H13a3.5 3.5 0 0 0 3.46-3H18.5A2.5 2.5 0 0 0 21 12.5v-2A2.5 2.5 0 0 0 18.5 8H19V6a1 1 0 0 0-1-1zm0 5v2.5a.5.5 0 0 1-.5.5H16.9A3.49 3.49 0 0 0 17 12.5V10h1.5zM6.5 16A1.5 1.5 0 0 1 5 14.5V7h11v7.5A1.5 1.5 0 0 1 14.5 16h-8zM8 9.25c0 .41.34.75.75.75s.75-.34.75-.75V8.5a.75.75 0 0 0-1.5 0v.75zm2.5 0c0 .41.34.75.75.75s.75-.34.75-.75V8.5a.75.75 0 0 0-1.5 0v.75zm2.5 0c0 .41.34.75.75.75s.75-.34.75-.75V8.5a.75.75 0 0 0-1.5 0v.75zM7 20.25A.75.75 0 0 0 7.75 21h7.5a.75.75 0 0 0 0-1.5h-7.5A.75.75 0 0 0 7 20.25z"
        />
      </svg>
    </a>
  );
};

export default BuyMeCoffee;
