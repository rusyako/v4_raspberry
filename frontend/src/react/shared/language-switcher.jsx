import { LANGUAGE_OPTIONS } from './language-options';

export function LanguageSwitcher({ language, setLanguage, ariaLabel = 'Language switcher' }) {
  return (
    <div className="language-switcher" aria-label={ariaLabel}>
      {LANGUAGE_OPTIONS.map(({ code, shortLabel, label }) => (
        <button
          key={code}
          type="button"
          className={`language-flag ${language === code ? 'active' : ''}`}
          onClick={() => setLanguage(code)}
          aria-label={label}
        >
          <span>{shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
