import kioskLogo from '../../../assets/img/kiosk-logo.png';
import { LANGUAGE_IMAGES } from '../../shared/language-options';

export const POLL_INTERVAL_MS = 3000;
export const HOME_STATE_POLL_DEBOUNCE_MS = 350;
export const NETWORK_ERROR_COOLDOWN_MS = 12000;
export const UNKNOWN_USER_EVENT_MAX_AGE_MS = 15000;
export const ACTIONS_INACTIVITY_TIMEOUT_MS = 30000;
export const SESSION_INACTIVITY_TIMEOUT_MS = 60000;

export const IT_SUPPORT_REQUEST_URL = String(import.meta.env.VITE_IT_SUPPORT_REQUEST_URL || '').trim();
export const IT_SUPPORT_EMAIL = String(import.meta.env.VITE_IT_SUPPORT_EMAIL || '').trim();
export const IT_SUPPORT_PHONE = String(import.meta.env.VITE_IT_SUPPORT_PHONE || '').trim();

export const BARCODE_PATTERN = /^[a-zA-Z0-9-\s]+$/;

export const KIOSK_IMAGES = {
  kioskLogo
};

export const KIOSK_PRELOAD_IMAGES = [
  KIOSK_IMAGES.kioskLogo,
  ...LANGUAGE_IMAGES
];
