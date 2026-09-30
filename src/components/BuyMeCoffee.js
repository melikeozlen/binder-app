import React from 'react';
import { Undo2, Plus, Save, Check, Loader2 } from 'lucide-react';
import './BuyMeCoffee.css';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { getTranslation } from '../utils/translations';

const BMC_URL = 'https://buymeacoffee.com/mellizy';
const APP_SHARE_URL = 'https://binder-app.up.railway.app/';

const buildTwitterShareUrl = (text) => {
  const params = new URLSearchParams({
    text: `${text}\n${APP_SHARE_URL}`,
  });
  return `https://x.com/intent/tweet?${params.toString()}`;
};

/**
 * Sağ alt yüzen aksiyonlar.
 * - default: X paylaş + Buy Me Coffee
 * - fullscreenTools: sayfa ekle / kaydet / geri al (header kapalıyken)
 */
const BuyMeCoffee = ({
  mode = 'default',
  readOnly = false,
  cloudSaveState = null,
  cloudSaveCanDiscard = false,
  onAddPage,
  onCloudSaveNow,
  onCloudDiscard,
}) => {
  const { language } = useLanguage();
  const { confirm } = useConfirm();
  const t = (key) => getTranslation(key, language);
  const supportLabel = t('footer.supportProject');
  const shareLabel = t('footer.shareTwitter');

  const handleDiscard = async () => {
    const ok = await confirm({
      title: t('dialog.title.discardChanges'),
      message: t('binder.discardConfirm'),
      confirmLabel: t('binder.discard'),
      cancelLabel: t('dialog.cancel'),
      danger: true,
    });
    if (!ok) return;
    onCloudDiscard?.();
  };

  if (mode === 'fullscreenTools') {
    const saveDisabled = cloudSaveState !== 'dirty';
    const saveTitle =
      cloudSaveState === 'dirty'
        ? cloudSaveCanDiscard
          ? t('binder.unsavedChanges')
          : t('binder.saveToCloud')
        : cloudSaveState === 'saving'
          ? t('binder.saving')
          : cloudSaveState === 'saved'
            ? t('binder.allSaved')
            : t('binder.saveNow');

    return (
      <div className="bmc-stack bmc-stack--tools" role="toolbar" aria-label={t('binder.fullscreenTools')}>
        {!readOnly && (
          <button
            type="button"
            className="bmc-tool bmc-tool--add"
            onClick={() => onAddPage?.()}
            title={t('settings.addPage')}
            aria-label={t('settings.addPage')}
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
        {cloudSaveState && (
          <button
            type="button"
            className={`bmc-tool bmc-tool--save bmc-tool--save-${cloudSaveState}`}
            disabled={saveDisabled}
            onClick={() => onCloudSaveNow?.()}
            title={saveTitle}
            aria-label={
              cloudSaveState === 'dirty'
                ? t('binder.saveNow')
                : cloudSaveState === 'saving'
                  ? t('binder.saving')
                  : t('binder.saved')
            }
          >
            {cloudSaveState === 'dirty' ? (
              <Save size={13} strokeWidth={1.5} aria-hidden="true" />
            ) : cloudSaveState === 'saving' ? (
              <Loader2 size={13} strokeWidth={1.5} className="bmc-tool-spin" aria-hidden="true" />
            ) : (
              <Check size={13} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        )}
        {cloudSaveCanDiscard && (
          <button
            type="button"
            className="bmc-tool bmc-tool--discard"
            onClick={handleDiscard}
            title={t('binder.discardHelp')}
            aria-label={t('binder.cancel')}
          >
            <Undo2 size={13} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

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
