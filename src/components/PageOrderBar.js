import React, { useState } from 'react';
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

  if (pages.length === 0) return null;

  // Aktif sayfanın index'ini bul (sağ sayfa varsa onu, yoksa sol sayfayı kullan)
  const activePageId = currentSpread.rightPageId || currentSpread.leftPageId;
  const activePageIndex = activePageId 
    ? pages.findIndex(p => p.id === activePageId)
    : 0;

  // Gösterilecek maksimum sayfa sayısı (her iki tarafta)
  const maxVisible = 5;
  const showEllipsis = pages.length > maxVisible * 2 + 1;

  // Hangi sayfaların gösterileceğini hesapla
  let startIndex = 0;
  let endIndex = pages.length;
  let showStartEllipsis = false;
  let showEndEllipsis = false;

  if (showEllipsis) {
    // Mevcut sayfanın etrafında göster
    const currentIndex = activePageIndex;
    
    if (currentIndex <= maxVisible) {
      // Başta göster
      startIndex = 0;
      endIndex = maxVisible * 2 + 1;
      showEndEllipsis = endIndex < pages.length - 1;
    } else if (currentIndex >= pages.length - maxVisible - 1) {
      // Sonda göster
      startIndex = pages.length - (maxVisible * 2 + 1);
      endIndex = pages.length;
      showStartEllipsis = startIndex > 0;
    } else {
      // Ortada göster - mevcut sayfanın etrafında
      startIndex = Math.max(0, currentIndex - maxVisible);
      endIndex = Math.min(pages.length, currentIndex + maxVisible + 1);
      showStartEllipsis = startIndex > 0;
      showEndEllipsis = endIndex < pages.length;
    }
  }

  return (
    <div className="page-order-bar">
      <div className="page-order-header">
        <h3>{t('pageOrder.sort') || 'Sırala'}</h3>
      </div>
      <div className="page-order-list">
        {showStartEllipsis && (
          <>
            <div className="page-order-item" title={`${t('pageOrder.page')} 1`}>
              <span className="page-order-number">1</span>
            </div>
            <div className="page-order-ellipsis">...</div>
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
              <div className="page-order-content">
                <span className="page-order-number">{absoluteIndex + 1}</span>
                <div className="page-order-controls">
                  <button
                    className="page-order-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePageUp && onMovePageUp(page.id);
                    }}
                    disabled={absoluteIndex === 0}
                    title={t('pageOrder.up')}
                  >
                    ↑
                  </button>
                  <button
                    className="page-order-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePageDown && onMovePageDown(page.id);
                    }}
                    disabled={absoluteIndex === pages.length - 1}
                    title={t('pageOrder.down')}
                  >
                    ↓
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        
        {showEndEllipsis && (
          <>
            <div className="page-order-ellipsis">...</div>
            <div className="page-order-item" title={`${t('pageOrder.page')} ${pages.length}`}>
              <span className="page-order-number">{pages.length}</span>
            </div>
          </>
        )}
      </div>
      <div className="page-order-hint" style={{
        whiteSpace: 'normal' }}>{t('pageOrder.dragDrop')}</div>
    </div>
  );
};

export default PageOrderBar;

