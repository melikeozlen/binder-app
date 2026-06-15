import {
  normalizeGridSizeInput,
  isValidGridSize,
  parseGridLayout,
  getMirroredCol,
  getRowSideGapUnits,
} from './gridLayout';

describe('gridLayout', () => {
  test('normalizes multiline custom layout', () => {
    expect(normalizeGridSizeInput('2\n3\n2')).toBe('2-3-2');
  });

  test('parses 2x2 as two rows of two', () => {
    const layout = parseGridLayout('2x2');
    expect(layout.type).toBe('uniform');
    expect(layout.rowCounts).toEqual([2, 2]);
    expect(layout.maxCols).toBe(2);
    expect(layout.totalCells).toBe(4);
  });

  test('parses 3-2 as three top and two bottom', () => {
    const layout = parseGridLayout('3-2');
    expect(layout.type).toBe('custom');
    expect(layout.rowCounts).toEqual([3, 2]);
    expect(layout.maxCols).toBe(3);
    expect(layout.totalCells).toBe(5);
    expect(isValidGridSize('3-2')).toBe(true);
  });

  test('parses custom layout cells', () => {
    const layout = parseGridLayout('2-3-2');
    expect(layout.type).toBe('custom');
    expect(layout.totalCells).toBe(7);
    expect(layout.maxCols).toBe(3);
    expect(layout.rowCounts).toEqual([2, 3, 2]);
  });

  test('keeps uniform layout', () => {
    const layout = parseGridLayout('2x3');
    expect(layout.type).toBe('uniform');
    expect(layout.totalCells).toBe(6);
  });

  test('validates custom and uniform formats', () => {
    expect(isValidGridSize('2-3-2')).toBe(true);
    expect(isValidGridSize('2x2')).toBe(true);
    expect(isValidGridSize('abc')).toBe(false);
  });

  test('mirrors column within row', () => {
    expect(getMirroredCol(0, 2)).toBe(1);
    expect(getMirroredCol(1, 3)).toBe(1);
  });

  test('calculates side gap for centered rows', () => {
    expect(getRowSideGapUnits(3, 2)).toBe(0.5);
    expect(getRowSideGapUnits(3, 3)).toBe(0);
  });
});
