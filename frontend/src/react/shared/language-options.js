import flagEn from '../../assets/img/flags/flag-en.png';
import flagRu from '../../assets/img/flags/flag-ru.png';
import flagKz from '../../assets/img/flags/flag-kz.png';

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English', image: flagEn },
  { code: 'ru', label: 'Russian', image: flagRu },
  { code: 'kz', label: 'Kazakh', image: flagKz }
];

export const LANGUAGE_IMAGES = LANGUAGE_OPTIONS.map((item) => item.image);
