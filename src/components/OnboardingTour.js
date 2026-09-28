import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './OnboardingTour.css';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { getTranslation } from '../utils/translations';
import {
  hasPriorAppUse,
  isOnboardingDone,
  markOnboardingDone,
} from '../utils/onboarding';

const TOUR_STEPS = [
  { id: 'welcome', target: null, titleKey: 'tour.welcome.title', bodyKey: 'tour.welcome.body' },
  { id: 'binder', target: 'binder-menu', titleKey: 'tour.binder.title', bodyKey: 'tour.binder.body' },
  { id: 'gallery', target: 'gallery', titleKey: 'tour.gallery.title', bodyKey: 'tour.gallery.body' },
  { id: 'addPage', target: 'add-page', titleKey: 'tour.addPage.title', bodyKey: 'tour.addPage.body' },
  { id: 'page', target: 'binder', titleKey: 'tour.page.title', bodyKey: 'tour.page.body' },
  { id: 'account', target: 'account', titleKey: 'tour.account.title', bodyKey: 'tour.account.body' },
];

const PAD = 8;

const pickVisibleTarget = (tourId) => {
  const nodes = Array.from(document.querySelectorAll(`[data-tour="${tourId}"]`));
  if (nodes.length === 0) return null;
  const visible = nodes.find((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  });
  return visible || null;
};

const getAvailableSteps = () =>
  TOUR_STEPS.filter((step) => !step.target || pickVisibleTarget(step.target));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const OnboardingTour = () => {
  const { language, setLanguage } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const { user, status: authStatus } = useAuth();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState(TOUR_STEPS);
  const [spotlight, setSpotlight] = useState(null);
  const [cardPos, setCardPos] = useState({ mode: 'center' });

  useEffect(() => {
    if (authStatus === 'loading') return undefined;

    if (user || isOnboardingDone() || hasPriorAppUse()) {
      if (user && !isOnboardingDone()) markOnboardingDone();
      return undefined;
    }

    let innerTimer;
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event('pocapocket-expand-settings'));
      innerTimer = window.setTimeout(() => {
        setSteps(getAvailableSteps());
        setActive(true);
      }, 80);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      if (innerTimer) window.clearTimeout(innerTimer);
    };
  }, [authStatus, user]);

  const finish = () => {
    markOnboardingDone();
    setActive(false);
  };

  const safeIndex = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const step = steps[safeIndex];
  const isLast = safeIndex >= steps.length - 1;

  useEffect(() => {
    if (!active || !step?.target) return undefined;
    if (step.target === 'gallery' || step.target === 'add-page') {
      window.dispatchEvent(new Event('pocapocket-expand-settings'));
    }
    return undefined;
  }, [active, step?.target]);

  useLayoutEffect(() => {
    if (!active || !step) return undefined;

    const update = () => {
      if (!step.target) {
        setSpotlight(null);
        setCardPos({ mode: 'center' });
        return;
      }

      const el = pickVisibleTarget(step.target);
      if (!el) {
        setSpotlight(null);
        setCardPos({ mode: 'center' });
        return;
      }

      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const rect = el.getBoundingClientRect();
      const spot = {
        top: Math.max(4, rect.top - PAD),
        left: Math.max(4, rect.left - PAD),
        width: Math.min(window.innerWidth - 8, rect.width + PAD * 2),
        height: Math.min(window.innerHeight - 8, rect.height + PAD * 2),
      };
      setSpotlight(spot);

      const cardWidth = Math.min(340, window.innerWidth - 24);
      const cardHeight = 200;
      const gap = 12;
      const spaceBelow = window.innerHeight - (spot.top + spot.height);
      const placeBelow = spaceBelow >= cardHeight + gap || spot.top < cardHeight + gap;

      let top = placeBelow
        ? spot.top + spot.height + gap
        : spot.top - cardHeight - gap;
      top = clamp(top, 12, window.innerHeight - cardHeight - 12);

      let left = spot.left + spot.width / 2 - cardWidth / 2;
      left = clamp(left, 12, window.innerWidth - cardWidth - 12);

      setCardPos({ mode: 'anchored', top, left });
    };

    update();
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [active, step, safeIndex]);

  useEffect(() => {
    if (!active) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active || !step) return null;

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
  };

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {!spotlight && <div className="tour-backdrop" />}
      {spotlight && (
        <div
          className="tour-spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}
      <div
        className={`tour-card${cardPos.mode === 'center' ? ' tour-card--center' : ''}`}
        style={
          cardPos.mode === 'anchored'
            ? { top: cardPos.top, left: cardPos.left }
            : undefined
        }
      >
        <h2 id="tour-title" className="tour-card-title">
          {t(step.titleKey)}
        </h2>
        <p className="tour-card-body">{t(step.bodyKey)}</p>
        {step.id === 'welcome' && (
          <div className="tour-lang" role="group" aria-label={t('footer.language')}>
            <span className="tour-lang-label">{t('footer.language')}</span>
            <div className="tour-lang-options">
              {[
                { value: 'en', label: 'EN' },
                { value: 'tr', label: 'TR' },
                { value: 'kr', label: 'KR' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`tour-lang-btn${language === opt.value ? ' tour-lang-btn--active' : ''}`}
                  onClick={() => setLanguage(opt.value)}
                  aria-pressed={language === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="tour-card-progress" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`tour-dot${i === safeIndex ? ' tour-dot--active' : ''}`}
            />
          ))}
        </div>
        <div className="tour-card-actions">
          <button type="button" className="tour-btn tour-btn--ghost" onClick={finish}>
            {t('tour.skip')}
          </button>
          {safeIndex > 0 && (
            <button type="button" className="tour-btn tour-btn--secondary" onClick={goBack}>
              {t('tour.back')}
            </button>
          )}
          <button type="button" className="tour-btn tour-btn--primary" onClick={goNext}>
            {isLast ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OnboardingTour;
