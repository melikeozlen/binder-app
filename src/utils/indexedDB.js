// IndexedDB helper fonksiyonları
const DB_NAME = 'binder-app-db';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_DEFAULT_BACK_IMAGE = 'defaultBackImage';

let db = null;

// IndexedDB'yi başlat
export const initIndexedDB = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB açılamadı:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Images store'u oluştur
      if (!database.objectStoreNames.contains(STORE_IMAGES)) {
        const imageStore = database.createObjectStore(STORE_IMAGES, { keyPath: 'key' });
        imageStore.createIndex('binderId', 'binderId', { unique: false });
      }

      // Default back image store'u oluştur
      if (!database.objectStoreNames.contains(STORE_DEFAULT_BACK_IMAGE)) {
        database.createObjectStore(STORE_DEFAULT_BACK_IMAGE, { keyPath: 'binderId' });
      }
    };
  });
};

// Resmi IndexedDB'ye kaydet
export const saveImageToIndexedDB = async (imageKey, imageData, binderId) => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_IMAGES], 'readwrite');
    const store = transaction.objectStore(STORE_IMAGES);

    const imageRecord = {
      key: binderId ? `${binderId}-${imageKey}` : imageKey,
      binderId: binderId || 'default',
      imageData: imageData,
      timestamp: Date.now()
    };

    await store.put(imageRecord);
    return true;
  } catch (error) {
    console.error(`Resim ${imageKey} IndexedDB'ye kaydedilemedi:`, error);
    throw error;
  }
};

// Resmi IndexedDB'den yükle
export const loadImageFromIndexedDB = async (imageKey, binderId) => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_IMAGES], 'readonly');
    const store = transaction.objectStore(STORE_IMAGES);

    const fullKey = binderId ? `${binderId}-${imageKey}` : imageKey;
    const request = store.get(fullKey);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.imageData);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error(`Resim ${imageKey} IndexedDB'den yüklenemedi:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`Resim ${imageKey} IndexedDB'den yüklenirken hata:`, error);
    return null;
  }
};

// Resmi IndexedDB'den sil
export const removeImageFromIndexedDB = async (imageKey, binderId) => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_IMAGES], 'readwrite');
    const store = transaction.objectStore(STORE_IMAGES);

    const fullKey = binderId ? `${binderId}-${imageKey}` : imageKey;
    await store.delete(fullKey);
    return true;
  } catch (error) {
    console.error(`Resim ${imageKey} IndexedDB'den silinemedi:`, error);
    return false;
  }
};

// Binder'a ait tüm resimleri sil
export const removeAllImagesForBinder = async (binderId) => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_IMAGES], 'readwrite');
    const store = transaction.objectStore(STORE_IMAGES);
    const index = store.index('binderId');

    const request = index.openCursor(IDBKeyRange.only(binderId || 'default'));

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      request.onerror = () => {
        console.error(`Binder ${binderId} resimleri silinirken hata:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`Binder ${binderId} resimleri silinirken hata:`, error);
    return false;
  }
};

// Default back image'ı IndexedDB'ye kaydet
export const saveDefaultBackImageToIndexedDB = async (imageData, binderId) => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_DEFAULT_BACK_IMAGE], 'readwrite');
    const store = transaction.objectStore(STORE_DEFAULT_BACK_IMAGE);

    const record = {
      binderId: binderId || 'default',
      imageData: imageData,
      timestamp: Date.now()
    };

    await store.put(record);
    return true;
  } catch (error) {
    console.error(`Default back image IndexedDB'ye kaydedilemedi:`, error);
    throw error;
  }
};

// Default back image'ı IndexedDB'den yükle
export const loadDefaultBackImageFromIndexedDB = async (binderId) => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_DEFAULT_BACK_IMAGE], 'readonly');
    const store = transaction.objectStore(STORE_DEFAULT_BACK_IMAGE);

    const request = store.get(binderId || 'default');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.imageData);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error(`Default back image IndexedDB'den yüklenemedi:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`Default back image IndexedDB'den yüklenirken hata:`, error);
    return null;
  }
};

// Default back image'ı IndexedDB'den sil
export const removeDefaultBackImageFromIndexedDB = async (binderId) => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_DEFAULT_BACK_IMAGE], 'readwrite');
    const store = transaction.objectStore(STORE_DEFAULT_BACK_IMAGE);

    await store.delete(binderId || 'default');
    return true;
  } catch (error) {
    console.error(`Default back image IndexedDB'den silinemedi:`, error);
    return false;
  }
};

// IndexedDB'deki toplam resim sayısını al
export const getTotalImageCountFromIndexedDB = async () => {
  try {
    const database = await initIndexedDB();
    const transaction = database.transaction([STORE_IMAGES], 'readonly');
    const store = transaction.objectStore(STORE_IMAGES);
    const request = store.count();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('Resim sayısı alınırken hata:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Resim sayısı alınırken hata:', error);
    return 0;
  }
};

// localStorage'dan IndexedDB'ye migration yap
export const migrateImagesFromLocalStorage = async (binderId) => {
  try {
    // Binder prefix'i oluştur (App.js'deki getBinderKeyPrefix ile aynı format)
    const getBinderKeyPrefix = (binderId) => {
      return binderId ? `binder-${binderId}-` : 'binder-';
    };
    
    const prefix = getBinderKeyPrefix(binderId);
    const imagePrefix = `${prefix}image-`;
    const defaultBackImageKey = `${prefix}default-back-image`;
    
    // Tüm resimleri localStorage'dan bul ve IndexedDB'ye taşı
    const imageKeys = [];
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        // Yeni format: binder-{binderId}-image-{imageKey}
        if (key.startsWith(imagePrefix)) {
          imageKeys.push(key);
        }
        // Eski format: binder-image-{imageKey} (binderId null ise)
        else if (!binderId && key.startsWith('binder-image-')) {
          imageKeys.push(key);
        }
      }
    }

    let migratedCount = 0;
    for (const key of imageKeys) {
      try {
        const imageData = localStorage.getItem(key);
        if (imageData && imageData.startsWith('data:image')) {
          // Key'den imageKey'i çıkar
          let imageKey = key;
          if (key.startsWith(imagePrefix)) {
            imageKey = key.replace(imagePrefix, '');
          } else if (key.startsWith('binder-image-')) {
            imageKey = key.replace('binder-image-', '');
          }
          
          await saveImageToIndexedDB(imageKey, imageData, binderId);
          // localStorage'dan sil
          localStorage.removeItem(key);
          migratedCount++;
        }
      } catch (error) {
        console.error(`Resim ${key} migration sırasında hata:`, error);
      }
    }

    // Default back image'ı da taşı
    const defaultBackImage = localStorage.getItem(defaultBackImageKey);
    if (defaultBackImage && defaultBackImage.startsWith('data:image')) {
      try {
        await saveDefaultBackImageToIndexedDB(defaultBackImage, binderId);
        localStorage.removeItem(defaultBackImageKey);
        migratedCount++;
      } catch (error) {
        console.error(`Default back image migration sırasında hata:`, error);
      }
    }
    
    // Eski format default back image (binderId null ise)
    if (!binderId) {
      const oldDefaultBackImageKey = 'binder-default-back-image';
      const oldDefaultBackImage = localStorage.getItem(oldDefaultBackImageKey);
      if (oldDefaultBackImage && oldDefaultBackImage.startsWith('data:image')) {
        try {
          await saveDefaultBackImageToIndexedDB(oldDefaultBackImage, null);
          localStorage.removeItem(oldDefaultBackImageKey);
          migratedCount++;
        } catch (error) {
          console.error(`Eski default back image migration sırasında hata:`, error);
        }
      }
    }

    if (migratedCount > 0) {
      console.log(`${migratedCount} resim localStorage'dan IndexedDB'ye taşındı (binder: ${binderId || 'default'})`);
    }

    return migratedCount;
  } catch (error) {
    console.error('Migration sırasında hata:', error);
    return 0;
  }
};

// localStorage'da kalan tüm resimleri temizle (migration sonrası)
export const cleanupAllImagesFromLocalStorage = () => {
  try {
    const keysToRemove = [];
    
    // Tüm localStorage key'lerini kontrol et
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        // Resim key'leri: binder-image- veya binder-{id}-image- ile başlayan
        if (key.startsWith('binder-image-') || /^binder-[^-]+-image-/.test(key)) {
          const value = localStorage.getItem(key);
          // Eğer base64 resim ise sil
          if (value && value.startsWith('data:image')) {
            keysToRemove.push(key);
          }
        }
        // Default back image key'leri
        else if (key === 'binder-default-back-image' || /^binder-[^-]+-default-back-image$/.test(key)) {
          const value = localStorage.getItem(key);
          // Eğer base64 resim ise sil
          if (value && value.startsWith('data:image')) {
            keysToRemove.push(key);
          }
        }
      }
    }
    
    // Tüm resim key'lerini sil
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    if (keysToRemove.length > 0) {
      console.log(`${keysToRemove.length} resim localStorage'dan temizlendi`);
    }
    
    return keysToRemove.length;
  } catch (error) {
    console.error('localStorage temizleme sırasında hata:', error);
    return 0;
  }
};

