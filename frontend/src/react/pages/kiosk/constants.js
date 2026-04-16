import kioskLogo from '../../../assets/img/kiosk-logo.png';
import { LANGUAGE_IMAGES } from '../../shared/language-options';

export const POLL_INTERVAL_MS = 3000;
export const HOME_STATE_POLL_DEBOUNCE_MS = 350;
export const INACTIVITY_TIMEOUT_MS = 5000;

export const BARCODE_PATTERN = /^[a-zA-Z0-9-\s]+$/;

export const KIOSK_IMAGES = {
  kioskLogo
};

export const KIOSK_PRELOAD_IMAGES = [
  KIOSK_IMAGES.kioskLogo,
  ...LANGUAGE_IMAGES
];

export const TRANSLATIONS = {
  en: {
    cardTitle: 'Information',
    availableLabel: 'Available',
    accessMessage: 'Use your access card to open the station'
  },
  ru: {
    cardTitle: 'Информация',
    availableLabel: 'Доступно',
    accessMessage: 'Приложите карту доступа, чтобы открыть станцию'
  },
  kz: {
    cardTitle: 'Ақпарат',
    availableLabel: 'Қолжетімді',
    accessMessage: 'Станцияны ашу үшін рұқсат картасын жақындатыңыз'
  }
};
