const MAX_GRID_ROWS = 12;
const MAX_GRID_COLS = 12;

/** Girdi: 2x2, 2-3-2 veya satır satır (2\n3\n2) */
export const normalizeGridSizeInput = (input) => {
  if (!input || typeof input !== 'string') return '2x2';
  const trimmed = input.trim();
  if (!trimmed) return '2x2';

  if (/^\d+x\d+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const lineParts = trimmed
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (lineParts.length > 1 && lineParts.every((part) => /^\d+$/.test(part))) {
    return lineParts.join('-');
  }

  if (/^\d+(-\d+)+$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
};

export const isValidGridSize = (input) => {
  const value = normalizeGridSizeInput(input);

  if (/^\d+x\d+$/.test(value)) {
    const [rows, cols] = value.split('x').map(Number);
    return (
      rows >= 1 &&
      rows <= MAX_GRID_ROWS &&
      cols >= 1 &&
      cols <= MAX_GRID_COLS
    );
  }

  if (/^\d+(-\d+)+$/.test(value)) {
    const parts = value.split('-').map(Number);
    return (
      parts.length >= 1 &&
      parts.length <= MAX_GRID_ROWS &&
      parts.every((n) => n >= 1 && n <= MAX_GRID_COLS)
    );
  }

  return false;
};

export const formatGridSizeForInput = (gridSize) => {
  const normalized = normalizeGridSizeInput(gridSize);
  if (/^\d+(-\d+)+$/.test(normalized)) {
    return normalized.split('-').join('\n');
  }
  return normalized;
};

const buildCells = (rowCounts) => {
  const rows = rowCounts.length;
  const maxCols = Math.max(...rowCounts);
  const cells = [];

  rowCounts.forEach((count, row) => {
    for (let col = 0; col < count; col += 1) {
      cells.push({
        row,
        col,
        key: `${row}-${col}`,
        rowCellCount: count,
        maxCols,
        isFirstRow: row === 0,
        isLastRow: row === rows - 1,
        isFirstCol: col === 0,
        isLastCol: col === count - 1,
      });
    }
  });

  return { rows, cols: maxCols, maxCols, rowCounts, cells };
};

/** Grid düzenini parse eder */
export const parseGridLayout = (gridSize) => {
  const storageKey = normalizeGridSizeInput(gridSize);

  if (/^\d+x\d+$/.test(storageKey)) {
    const [rows, cols] = storageKey.split('x').map(Number);
    const rowCounts = Array.from({ length: rows }, () => cols);
    const { cells } = buildCells(rowCounts);

    return {
      type: 'uniform',
      storageKey,
      rows,
      cols,
      maxCols: cols,
      rowCounts,
      cells,
      totalCells: rows * cols,
    };
  }

  if (/^\d+(-\d+)+$/.test(storageKey)) {
    const rowCounts = storageKey.split('-').map(Number);
    const { rows, cols, maxCols, cells } = buildCells(rowCounts);

    return {
      type: 'custom',
      storageKey,
      rows,
      cols,
      maxCols,
      rowCounts,
      cells,
      totalCells: cells.length,
    };
  }

  return parseGridLayout('2x2');
};

export const getMirroredCol = (col, rowCellCount) => rowCellCount - 1 - col;

/** Satırda maxCols'a göre yan boşluk (hücre birimi cinsinden) */
export const getRowSideGapUnits = (maxCols, rowCellCount) =>
  (maxCols - rowCellCount) / 2;
