import { LANGUAGE_OPTIONS } from './language-options';

export function LanguageSwitcher({ language, setLanguage, ariaLabel = 'Language switcher' }) {
  return (
    <div className="language-switcher" aria-label={ariaLabel}>
      {LANGUAGE_OPTIONS.map(({ code, image, label }) => (
        <button
          key={code}
          type="button"
          className={`language-flag ${language === code ? 'active' : ''}`}
          onClick={() => setLanguage(code)}
          aria-label={label}
        >
          <img src={image} alt={label} />
        </button>
      ))}
    </div>
  );
}
