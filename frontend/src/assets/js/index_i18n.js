const SMARTBOX_LANGUAGE_STORAGE_KEY = 'smartBoxLanguage';
const SMARTBOX_TRANSLATIONS = {
    en: {
        cardTitle: 'Information',
        availableLabel: 'Available:',
        accessMessage: 'Use your access card to open the station'
    },
    ru: {
        cardTitle: 'Информация',
        availableLabel: 'Доступно:',
        accessMessage: 'Приложите карту доступа, чтобы открыть станцию'
    },
    kz: {
        cardTitle: 'Ақпарат',
        availableLabel: 'Қолжетімді:',
        accessMessage: 'Станцияны ашу үшін рұқсат картасын жақындатыңыз'
    }
};

function setActiveLanguageButton(language) {
    document.querySelectorAll('.language-flag').forEach((button) => {
        button.classList.toggle('active', button.dataset.language === language);
    });
}

function applySmartBoxLanguage(language) {
    const selectedLanguage = SMARTBOX_TRANSLATIONS[language] ? language : 'en';
    const dictionary = SMARTBOX_TRANSLATIONS[selectedLanguage];

    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const key = element.dataset.i18n;
        if (dictionary[key]) {
            element.textContent = dictionary[key];
        }
    });

    localStorage.setItem(SMARTBOX_LANGUAGE_STORAGE_KEY, selectedLanguage);
    setActiveLanguageButton(selectedLanguage);
}

document.addEventListener('DOMContentLoaded', () => {
    const savedLanguage = localStorage.getItem(SMARTBOX_LANGUAGE_STORAGE_KEY) || 'en';

    document.querySelectorAll('.language-flag').forEach((button) => {
        button.addEventListener('click', () => {
            applySmartBoxLanguage(button.dataset.language || 'en');
        });
    });

    applySmartBoxLanguage(savedLanguage);
});
