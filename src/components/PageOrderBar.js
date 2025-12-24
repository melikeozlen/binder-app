import React, { useState, useEffect, useMemo } from 'react';
import './PageOrderBar.css';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../utils/translations';

const PageOrderBar = ({ 
  pages = [],
  currentSpread = { leftPageId: null, rightPageId: null },
  onMovePageUp,
  onMovePageDown,
  onMovePageTo,
  isVisible = true
}) => {
  const { language } = useLanguage();
  const t = (key) => getTranslation(key, language);
  const [draggedPageId, setDraggedPageId] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [swapPage1, setSwapPage1] = useState('');
  const [swapPage2, setSwapPage2] = useState('');
  const [expandedRange, setExpandedRange] = useState(null);

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

  if (pages.length === 0) return null;

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
    <div className="page-order-bar">
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

      <div className="page-order-list">
        {showStartEllipsis && (
          <>
            <div className="page-order-item" title={`${t('pageOrder.page')} 1`}>
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
              draggable
              onDragStart={(e) => {
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
            <div className="page-order-item" title={`${t('pageOrder.page')} ${pages.length}`}>
              <span className="page-order-number">{pages.length}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PageOrderBar;

