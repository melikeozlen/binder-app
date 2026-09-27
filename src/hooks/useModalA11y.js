import React, { useEffect, useRef } from 'react';

/**
 * Modal açıkken: ilk odak, Tab focus trap, ESC ile kapatma.
 * containerRef modal köküne (role=dialog) bağlanır.
 */
export function useModalA11y({ open, onClose, containerRef, initialFocusRef }) {
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const root = containerRef?.current;
    const focusTarget =
      initialFocusRef?.current ||
      root?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

    // Bir frame sonra odakla (portal mount)
    const t = window.setTimeout(() => {
      focusTarget?.focus?.();
    }, 0);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !root) return;

      const focusable = root.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusable).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          // ignore
        }
      }
    };
  }, [open, onClose, containerRef, initialFocusRef]);
}
