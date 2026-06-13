import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './PageOrderBar.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const TOUCH_DRAG_DELAY_MS = 220;
const TOUCH_SCROLL_CANCEL_PX = 10;

const PageOrderBar = ({ 
  pages = [],
  currentSpread = { leftPageId: null, rightPageId: null },
  onMovePageUp,
  onMovePageDown,
  onMovePageTo,
  onGoToPage,
  isVisible = true
}) => {
  const { language } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [draggedPageId, setDraggedPageId] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const [swapPage1, setSwapPage1] = useState('');
  const [swapPage2, setSwapPage2] = useState('');
  const [expandedRange, setExpandedRange] = useState(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const listRef = useRef(null);
  const suppressClickRef = useRef(false);
  const touchRef = useRef({
    pageId: null,
    startX: 0,
    startY: 0,
    dragging: false,
    longPressTimer: null,
    lastIndex: null,
  });

  const findPageIndexAtPoint = useCallback((x, y) => {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      const item = el.closest?.('[data-page-index]');
      if (item) {
        const index = parseInt(item.getAttribute('data-page-index'), 10);
        if (!Number.isNaN(index)) return index;
      }
    }
    return null;
  }, []);

  const resetTouchDrag = useCallback(() => {
    const ts = touchRef.current;
    if (ts.longPressTimer) {
      clearTimeout(ts.longPressTimer);
      ts.longPressTimer = null;
    }
    ts.pageId = null;
    ts.dragging = false;
    ts.lastIndex = null;
    ts.pageLabel = null;
    setDraggedPageId(null);
    setDragOverIndex(null);
    setDragGhost(null);
    listRef.current?.classList.remove('is-touch-dragging');
    document.body.classList.remove('page-order-no-select');
    window.getSelection?.()?.removeAllRanges();
  }, []);

  const clearTextSelection = useCallback(() => {
    window.getSelection?.()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    const blockSelect = (e) => e.preventDefault();

    list.addEventListener('selectstart', blockSelect);
    list.addEventListener('contextmenu', blockSelect);

    return () => {
      list.removeEventListener('selectstart', blockSelect);
      list.removeEventListener('contextmenu', blockSelect);
    };
  }, []);

  useEffect(() => {
    const onTouchMove = (e) => {
      const ts = touchRef.current;
      if (!ts.pageId || e.touches.length !== 1) return;

      const touch = e.touches[0];

      if (!ts.dragging) {
        const dx = Math.abs(touch.clientX - ts.startX);
        const dy = Math.abs(touch.clientY - ts.startY);
        if (dx > TOUCH_SCROLL_CANCEL_PX || dy > TOUCH_SCROLL_CANCEL_PX) {
          resetTouchDrag();
        }
        return;
      }

      e.preventDefault();
      clearTextSelection();
      setDragGhost({
        x: touch.clientX,
        y: touch.clientY,
        label: ts.pageLabel,
      });
      const index = findPageIndexAtPoint(touch.clientX, touch.clientY);
      if (index !== null && pages[index]?.id !== ts.pageId) {
        ts.lastIndex = index;
        setDragOverIndex(index);
      }
    };

    const onTouchEnd = () => {
      const ts = touchRef.current;
      if (!ts.pageId) return;

      const pageId = ts.pageId;
      const wasDragging = ts.dragging;
      const hadPendingPress = !!ts.longPressTimer;

      if (hadPendingPress) {
        clearTimeout(ts.longPressTimer);
        ts.longPressTimer = null;
        if (!wasDragging && onGoToPage) {
          onGoToPage(pageId);
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 400);
        }
      } else if (wasDragging && ts.lastIndex !== null && onMovePageTo) {
        const targetPage = pages[ts.lastIndex];
        if (targetPage && targetPage.id !== pageId) {
          onMovePageTo(pageId, ts.lastIndex);
        }
      }
      resetTouchDrag();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [pages, onMovePageTo, onGoToPage, findPageIndexAtPoint, resetTouchDrag, clearTextSelection]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const onChange = () => {
      if (!mq.matches) setMobileExpanded(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleMobileToggle = () => {
    setMobileExpanded((prev) => !prev);
  };

  const handlePageClick = (pageId) => (e) => {
    if (suppressClickRef.current) return;
    e.stopPropagation();
    onGoToPage?.(pageId);
  };

  const handleItemTouchStart = (page, absoluteIndex) => (e) => {
    if (e.touches.length !== 1) return;

    clearTextSelection();

    const touch = e.touches[0];
    const ts = touchRef.current;

    if (ts.longPressTimer) clearTimeout(ts.longPressTimer);

    ts.pageId = page.id;
    ts.startX = touch.clientX;
    ts.startY = touch.clientY;
    ts.dragging = false;
    ts.lastIndex = absoluteIndex;
    ts.pageLabel = absoluteIndex + 1;

    ts.longPressTimer = setTimeout(() => {
      ts.dragging = true;
      ts.longPressTimer = null;
      clearTextSelection();
      document.body.classList.add('page-order-no-select');
      setDraggedPageId(page.id);
      setDragOverIndex(absoluteIndex);
      setDragGhost({
        x: touch.clientX,
        y: touch.clientY,
        label: absoluteIndex + 1,
      });
      listRef.current?.classList.add('is-touch-dragging');
      if (navigator.vibrate) navigator.vibrate(12);
    }, TOUCH_DRAG_DELAY_MS);
  };

  // Aktif sayfanın index'ini bul (sağ sayfa varsa onu, yoksa sol sayfayı kullan)
  const activePageId = useMemo(() => {
    return currentSpread.rightPageId || currentSpread.leftPageId;
  }, [currentSpread.rightPageId, currentSpread.leftPageId]);

  const activePageIndex = useMemo(() => {
    if (pages.length === 0) return 0;
    return activePageId 
      ? pages.findIndex(p => p.id === activePageId)
      : 0;
  }, [activePageId, pages]);

  // Aktif sayfa değiştiğinde açık aralığı kapat
  useEffect(() => {
    setExpandedRange(null);
  }, [activePageIndex]);

  // İki sayfayı yer değiştir
  const handleSwap = () => {
    const page1Num = parseInt(swapPage1);
    const page2Num = parseInt(swapPage2);
    
    if (!page1Num || !page2Num || 
        page1Num < 1 || page1Num > pages.length ||
        page2Num < 1 || page2Num > pages.length ||
        page1Num === page2Num) {
      return;
    }

    const index1 = page1Num - 1;
    const index2 = page2Num - 1;

    if (onMovePageTo) {
      const page1Id = pages[index1].id;
      const page2Id = pages[index2].id;
      
      if (index1 < index2) {
        onMovePageTo(page2Id, index1);
        setTimeout(() => {
          onMovePageTo(page1Id, index2);
        }, 50);
      } else {
        onMovePageTo(page1Id, index2);
        setTimeout(() => {
          onMovePageTo(page2Id, index1);
        }, 50);
      }
    }

    setSwapPage1('');
    setSwapPage2('');
  };

  // Gösterilecek maksimum sayfa sayısı (her iki tarafta)
  const maxVisible = 5;
  const showEllipsis = pages.length > maxVisible * 2 + 1;

  // Hangi sayfaların gösterileceğini hesapla
  let startIndex = 0;
  let endIndex = pages.length;
  let showStartEllipsis = false;
  let showEndEllipsis = false;
  let startEllipsisRange = null;
  let endEllipsisRange = null;

  // Eğer bir aralık açılmışsa, onu göster
  if (expandedRange) {
    startIndex = expandedRange.start;
    endIndex = expandedRange.end;
    showStartEllipsis = expandedRange.start > 0;
    showEndEllipsis = expandedRange.end < pages.length;
    if (showStartEllipsis) {
      startEllipsisRange = { start: 0, end: expandedRange.start };
    }
    if (showEndEllipsis) {
      endEllipsisRange = { start: expandedRange.end, end: pages.length };
    }
  } else if (showEllipsis) {
    const currentIndex = activePageIndex;
    
    if (currentIndex <= maxVisible) {
      startIndex = 0;
      endIndex = maxVisible * 2 + 1;
      showEndEllipsis = endIndex < pages.length - 1;
      if (showEndEllipsis) {
        endEllipsisRange = { start: endIndex, end: pages.length };
      }
    } else if (currentIndex >= pages.length - maxVisible - 1) {
      startIndex = pages.length - (maxVisible * 2 + 1);
      endIndex = pages.length;
      showStartEllipsis = startIndex > 0;
      if (showStartEllipsis) {
        startEllipsisRange = { start: 0, end: startIndex };
      }
    } else {
      startIndex = Math.max(0, currentIndex - maxVisible);
      endIndex = Math.min(pages.length, currentIndex + maxVisible + 1);
      showStartEllipsis = startIndex > 0;
      showEndEllipsis = endIndex < pages.length;
      if (showStartEllipsis) {
        startEllipsisRange = { start: 0, end: startIndex };
      }
      if (showEndEllipsis) {
        endEllipsisRange = { start: endIndex, end: pages.length };
      }
    }
  }

  // Ellipsis'e tıklayınca o aralığı aç
  const handleEllipsisClick = (range) => {
    if (range) {
      const rangeSize = range.end - range.start;
      const visibleSize = Math.min(maxVisible * 2 + 1, rangeSize);
      const center = Math.floor((range.start + range.end) / 2);
      const newStart = Math.max(range.start, center - Math.floor(visibleSize / 2));
      const newEnd = Math.min(range.end, newStart + visibleSize);
      setExpandedRange({ start: newStart, end: newEnd });
    } else {
      setExpandedRange(null);
    }
  };

  return (
    <div
      className={[
        'page-order-bar',
        draggedPageId ? 'is-dragging-active' : '',
        mobileExpanded ? 'is-mobile-expanded' : 'is-mobile-collapsed',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="page-order-mobile-toggle"
        onClick={handleMobileToggle}
        aria-expanded={mobileExpanded}
        aria-label={mobileExpanded ? t('pageOrder.hide') : t('pageOrder.show')}
      >
        <span className="page-order-mobile-toggle-icon" aria-hidden="true">⇅</span>
        <span className="page-order-mobile-toggle-text">
          {mobileExpanded ? t('pageOrder.hide') : t('pageOrder.show')}
        </span>
        <span className="page-order-mobile-toggle-chevron" aria-hidden="true">
          {mobileExpanded ? '▾' : '▴'}
        </span>
      </button>

      <div className="page-order-header">
        <div className="page-order-icon" title={t('pageOrder.sort') || 'Sırala'}>⇅</div>
      </div>
      
      {/* Swap Inputs - Minimal */}
      <div className="page-order-swap">
        <div className="page-order-swap-inputs">
          <input
            type="number"
            min="1"
            max={pages.length}
            value={swapPage1}
            onChange={(e) => {
              const value = e.target.value;
              const num = parseInt(value);
              if (value === '' || (num >= 1 && num <= pages.length)) {
                setSwapPage1(value);
              }
            }}
            onBlur={(e) => {
              const num = parseInt(e.target.value);
              if (num < 1) {
                setSwapPage1('1');
              } else if (num > pages.length) {
                setSwapPage1(pages.length.toString());
              }
            }}
            className="page-order-swap-input"
            title={t('pageOrder.page') + ' 1'}
          />
          <input
            type="number"
            min="1"
            max={pages.length}
            value={swapPage2}
            onChange={(e) => {
              const value = e.target.value;
              const num = parseInt(value);
              if (value === '' || (num >= 1 && num <= pages.length)) {
                setSwapPage2(value);
              }
            }}
            onBlur={(e) => {
              const num = parseInt(e.target.value);
              if (num < 1) {
                setSwapPage2('1');
              } else if (num > pages.length) {
                setSwapPage2(pages.length.toString());
              }
            }}
            className="page-order-swap-input"
            title={t('pageOrder.page') + ' 2'}
          />
        </div>
        <button
          className="page-order-swap-button"
          onClick={handleSwap}
          disabled={!swapPage1 || !swapPage2 || swapPage1 === swapPage2}
          title={t('pageOrder.swap') || 'Değiştir'}
        >
          ⇄
        </button>
      </div>

      <div
        className={`page-order-list${draggedPageId ? ' has-drag-active' : ''}`}
        ref={listRef}
      >
        {pages.length === 0 ? (
          <div className="page-order-empty">
            <div className="page-order-empty-text">{t('pageOrder.noPages')}</div>
          </div>
        ) : (
          <>
        {showStartEllipsis && (
          <>
            <div
              className="page-order-item"
              title={`${t('pageOrder.page')} 1`}
              onClick={pages[0] ? handlePageClick(pages[0].id) : undefined}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && pages[0]) {
                  e.preventDefault();
                  onGoToPage?.(pages[0].id);
                }
              }}
            >
              <span className="page-order-number">1</span>
            </div>
            <div 
              className="page-order-ellipsis clickable"
              onClick={() => handleEllipsisClick(startEllipsisRange)}
              title={`${startEllipsisRange.start + 1}-${startEllipsisRange.end} arası sayfaları göster`}
            >
              ...
            </div>
          </>
        )}
        
        {pages.slice(startIndex, endIndex).map((page, relativeIndex) => {
          const absoluteIndex = startIndex + relativeIndex;
          const isDragging = draggedPageId === page.id;
          const isDragOver = dragOverIndex === absoluteIndex && draggedPageId !== page.id;
          
          return (
            <div 
              key={page.id} 
              className={`page-order-item ${absoluteIndex === activePageIndex ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
              title={`${t('pageOrder.page')} ${absoluteIndex + 1}`}
              data-page-index={absoluteIndex}
              draggable
              role="button"
              tabIndex={0}
              onClick={handlePageClick(page.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onGoToPage?.(page.id);
                }
              }}
              onTouchStart={handleItemTouchStart(page, absoluteIndex)}
              onDragStart={(e) => {
                suppressClickRef.current = false;
                setDraggedPageId(page.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', page.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedPageId !== page.id) {
                  setDragOverIndex(absoluteIndex);
                }
              }}
              onDragLeave={() => {
                setDragOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedPageId && draggedPageId !== page.id && onMovePageTo) {
                  onMovePageTo(draggedPageId, absoluteIndex);
                }
                setDraggedPageId(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDraggedPageId(null);
                setDragOverIndex(null);
                setDragGhost(null);
                suppressClickRef.current = true;
                window.setTimeout(() => {
                  suppressClickRef.current = false;
                }, 100);
              }}
            >
              <span className="page-order-number">{absoluteIndex + 1}</span>
              {absoluteIndex === activePageIndex && <span className="page-order-active-dot"></span>}
            </div>
          );
        })}
        
        {showEndEllipsis && (
          <>
            <div 
              className="page-order-ellipsis clickable"
              onClick={() => handleEllipsisClick(endEllipsisRange)}
              title={`${endEllipsisRange.start + 1}-${endEllipsisRange.end} arası sayfaları göster`}
            >
              ...
            </div>
            <div
              className="page-order-item"
              title={`${t('pageOrder.page')} ${pages.length}`}
              onClick={pages.length > 0 ? handlePageClick(pages[pages.length - 1].id) : undefined}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && pages.length > 0) {
                  e.preventDefault();
                  onGoToPage?.(pages[pages.length - 1].id);
                }
              }}
            >
              <span className="page-order-number">{pages.length}</span>
            </div>
          </>
        )}
          </>
        )}
      </div>

      {dragGhost && (
        <div
          className="page-order-drag-ghost"
          style={{ left: dragGhost.x, top: dragGhost.y }}
          aria-hidden="true"
        >
          <span className="page-order-drag-ghost-label">{dragGhost.label}</span>
        </div>
      )}
    </div>
  );
};

export default PageOrderBar;

