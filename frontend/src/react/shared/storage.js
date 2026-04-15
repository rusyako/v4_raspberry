export const LANGUAGE_STORAGE_KEY = 'smartBoxLanguage';
export const TAKE_BARCODES_STORAGE_KEY = 'takeScannedBarcodes';
export const RETURN_BARCODES_STORAGE_KEY = 'returnScannedBarcodes';
export const ADMIN_TOKEN_STORAGE_KEY = 'smartBoxAdminToken';

export function readStoredArray(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function writeStoredArray(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}
