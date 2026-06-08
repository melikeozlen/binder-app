export const extractImageFromCell = (value) => {
  if (!value) return { url: '', name: '' };
  if (typeof value === 'string') {
    if (
      value.startsWith('data:image') ||
      value.startsWith('http://') ||
      value.startsWith('https://')
    ) {
      return { url: value, name: '' };
    }
    return { url: '', name: '' };
  }
  if (typeof value === 'object') {
    const url = value.url || value.image || '';
    const name = (value.name || '').trim();
    return { url, name };
  }
  return { url: '', name: '' };
};

export const collectBinderUsedImages = (pages = [], defaultBackImage = null) => {
  const urls = new Set();
  const names = new Set();

  const add = ({ url, name }) => {
    if (
      url &&
      (url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('data:image'))
    ) {
      urls.add(url);
    }
    if (name) {
      names.add(name.toLowerCase());
    }
  };

  pages.forEach((page) => {
    Object.values(page.content || {}).forEach((value) => add(extractImageFromCell(value)));
    Object.values(page.backContent || {}).forEach((value) => add(extractImageFromCell(value)));
  });

  if (defaultBackImage) {
    add(extractImageFromCell(defaultBackImage));
  }

  return { urls, names };
};

export const isGalleryItemInBinder = (item, usedImages) => {
  if (!usedImages) return false;

  const url = typeof item === 'string' ? item : item.url;
  const name = (typeof item === 'string' ? '' : item.name || '').trim().toLowerCase();

  if (url && usedImages.urls?.has(url)) return true;
  if (name && usedImages.names?.has(name)) return true;
  return false;
};
