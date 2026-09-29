import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './MobileGestureGuide.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';
import {
  isMobileGestureGuideDone,
  markMobileGestureGuideDone,
} from '../utils/onboarding';

const STEPS = [
  {
    id: 'swipe',
    titleKey: 'mobileGuide.swipe.title',
    bodyKey: 'mobileGuide.swipe.body',
  },
  {
    id: 'longPress',
    titleKey: 'mobileGuide.longPress.title',
    bodyKey: 'mobileGuide.longPress.body',
  },
  {
    id: 'doubleTap',
    titleKey: 'mobileGuide.doubleTap.title',
    bodyKey: 'mobileGuide.doubleTap.body',
  },
];

const isTouchMobile = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  const mq = (query) => window.matchMedia(query).matches;
  if (mq('(pointer: coarse)') || mq('(any-pointer: coarse)')) return true;
  const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  if (touchPoints > 1 && (mq('(hover: none)') || mq('(any-hover: none)'))) return true;
  return false;
};

const MobileGestureGuide = () => {
  const { language, setLanguage } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!isTouchMobile()) return undefined;

    setEligible(true);
    if (isMobileGestureGuideDone()) return undefined;

    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        markMobileGestureGuideDone();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!eligible) return null;

  const isLast = stepIndex >= STEPS.length - 1;
  const step = STEPS[stepIndex];

  const close = () => {
    markMobileGestureGuideDone();
    setOpen(false);
  };

  const goNext = () => {
    if (isLast) {
      close();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const reopen = () => {
    setStepIndex(0);
    setOpen(true);
  };

  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          className="mgg-hint-btn"
          onClick={reopen}
          title={t('mobileGuide.reopen')}
          aria-label={t('mobileGuide.reopen')}
        >
          ?
        </button>
      )}

      {open && (
        <div className="mgg-root" role="dialog" aria-modal="true" aria-labelledby="mgg-title">
          <button type="button" className="mgg-scrim" aria-label={t('mobileGuide.close')} onClick={close} />
          <div className="mgg-card">
            <div className="mgg-card-top">
              <p className="mgg-kicker">{t('mobileGuide.kicker')}</p>
              <span className="mgg-step-count">
                {stepIndex + 1}/{STEPS.length}
              </span>
            </div>

            <div className="mgg-lang">
              <label className="mgg-lang-label" htmlFor="mgg-lang-select">
                {t('footer.language')}
              </label>
              <select
                id="mgg-lang-select"
                className="mgg-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label={t('footer.language')}
              >
                <option value="en">EN</option>
                <option value="tr">TR</option>
                <option value="kr">KR</option>
              </select>
            </div>

            <div className="mgg-icon" aria-hidden="true">
              {step.id === 'swipe' ? '↔' : step.id === 'longPress' ? '👆' : '👆👆'}
            </div>

            <h2 id="mgg-title" className="mgg-title">
              {t(step.titleKey)}
            </h2>
            <p className="mgg-body">{t(step.bodyKey)}</p>

            <div className="mgg-dots" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`mgg-dot${i === stepIndex ? ' mgg-dot--active' : ''}`}
                />
              ))}
            </div>

            <div className="mgg-actions">
              <button type="button" className="mgg-btn mgg-btn--ghost" onClick={close}>
                {t('mobileGuide.close')}
              </button>
              <button type="button" className="mgg-btn mgg-btn--primary" onClick={goNext}>
                {isLast ? t('mobileGuide.done') : t('mobileGuide.next')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
};

export default MobileGestureGuide;
