import { useEffect, useMemo, useRef, useState } from 'react';
import { requestJson, postJson } from '../shared/api';
import { AnimatedBackground } from '../shared/background';
import { ensureNetworkWarmup, preloadImages } from '../shared/network';
import { Toast, useToast } from '../shared/toast';
import {
  LANGUAGE_STORAGE_KEY,
  TAKE_BARCODES_STORAGE_KEY,
  RETURN_BARCODES_STORAGE_KEY,
  readStoredArray,
  writeStoredArray
} from '../shared/storage';
import kioskLogo from '../../assets/img/kiosk-logo.png';
import flagEn from '../../assets/img/flags/flag-en.png';
import flagRu from '../../assets/img/flags/flag-ru.png';
import flagKz from '../../assets/img/flags/flag-kz.png';

const POLL_INTERVAL_MS = 3000;
const HOME_STATE_POLL_DEBOUNCE_MS = 350;
const INACTIVITY_TIMEOUT_MS = 5000;
const BARCODE_PATTERN = /^[a-zA-Z0-9-\s]+$/;

const TRANSLATIONS = {
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

function HomePanel({ language, setLanguage, laptopCount }) {
  const text = TRANSLATIONS[language] || TRANSLATIONS.en;

  return (
    <>
      <div className="language-switcher" aria-label="Language switcher">
        {[
          ['en', flagEn, 'English'],
          ['ru', flagRu, 'Russian'],
          ['kz', flagKz, 'Kazakh']
        ].map(([code, image, label]) => (
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

      <main className="home-shell">
        <section className="home-brand">
          <div className="home-title-wrap">
            <h1 className="home-title">SmartBox</h1>
            <p className="home-subtitle">Kiosk station for MacBook issue and return.</p>
          </div>
        </section>

        <section className="home-card">
          <div className="home-card-header">
            <img src={kioskLogo} alt="Smart Box" className="home-logo" />
            <h2>{text.cardTitle}</h2>
          </div>

          <div className="home-count-card">
            <span>{text.availableLabel}</span>
            <strong>{laptopCount}</strong>
          </div>

          <p className="home-card-message">{text.accessMessage}</p>
        </section>
      </main>
    </>
  );
}

function ActionPanel({ onTake, onReturn }) {
  return (
    <section className="hello-shell">
      <header className="hello-header">
        <p className="hello-kicker">Session confirmed</p>
        <h1>MacBook Kiosk</h1>
        <p>Choose what you want to do next.</p>
      </header>

      <div className="hello-actions">
        <button type="button" className="hello-action primary" onClick={onTake}>
          <span>Check Out</span>
          <small>Issue a MacBook from the station</small>
        </button>
        <button type="button" className="hello-action danger" onClick={onReturn}>
          <span>Return</span>
          <small>Bring back devices linked to this card</small>
        </button>
      </div>
    </section>
  );
}

function SessionPanel({
  title,
  description,
  placeholder,
  countLabel,
  submitLabel,
  storageKey,
  initialBarcodes,
  onBarcodesChange,
  onCancel,
  onSubmit,
  showToast
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function focusAndClear() {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }

  async function checkLaptop(barcode) {
    await postJson('/check_laptop', { barcode });
  }

  async function handleKeyDown(event) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const barcode = event.currentTarget.value.trim();

    if (!barcode) {
      focusAndClear();
      return;
    }

    if (!BARCODE_PATTERN.test(barcode)) {
      showToast('error', 'Invalid barcode', 'Please scan or enter a valid barcode.');
      focusAndClear();
      return;
    }

    if (initialBarcodes.includes(barcode)) {
      showToast('info', 'Device already added', 'This device is already in the list.');
      focusAndClear();
      return;
    }

    try {
      await checkLaptop(barcode);
      const nextBarcodes = [...initialBarcodes, barcode];
      onBarcodesChange(nextBarcodes);
      writeStoredArray(storageKey, nextBarcodes);
      focusAndClear();
    } catch (error) {
      showToast('error', 'Device check failed', error.message);
      focusAndClear();
    }
  }

  function removeBarcode(barcode) {
    const nextBarcodes = initialBarcodes.filter((item) => item !== barcode);
    onBarcodesChange(nextBarcodes);
    writeStoredArray(storageKey, nextBarcodes);
  }

  return (
    <section className="session-shell">
      <header className="session-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <div className="session-input-wrap">
        <input
          ref={inputRef}
          className="session-input"
          type="text"
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button type="button" className="session-input-action" onClick={() => inputRef.current?.focus()}>
          Scan
        </button>
      </div>

      <section className="session-list-card">
        <div className="session-list-head">
          <h2>{countLabel}</h2>
          <span>{initialBarcodes.length}</span>
        </div>
        <ul className="session-list">
          {initialBarcodes.map((barcode, index) => (
            <li key={barcode} className="session-list-item">
              <span>{index + 1}. {barcode}</span>
              <button type="button" className="chip-button" onClick={() => removeBarcode(barcode)}>
                Remove
              </button>
            </li>
          ))}
          {!initialBarcodes.length ? <li className="session-list-empty">No devices scanned yet.</li> : null}
        </ul>
      </section>

      <div className="session-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary-button" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </section>
  );
}

export function KioskPage() {
  const [language, setLanguage] = useState(localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en');
  const [laptopCount, setLaptopCount] = useState('0/0');
  const [view, setView] = useState('home');
  const [takeBarcodes, setTakeBarcodes] = useState(() => readStoredArray(TAKE_BARCODES_STORAGE_KEY));
  const [returnBarcodes, setReturnBarcodes] = useState(() => readStoredArray(RETURN_BARCODES_STORAGE_KEY));
  const { toast, showToast, clearToast } = useToast();
  const inactivityTimerRef = useRef(null);
  const homePollTimerRef = useRef(null);
  const homePollInFlightRef = useRef(false);
  const homePollQueuedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    ensureNetworkWarmup();
    preloadImages([kioskLogo, flagEn, flagRu, flagKz]);
  }, []);

  useEffect(() => {
    async function updateHomeState() {
      try {
        const data = await requestJson('/home_state', { cache: 'no-store' });
        setLaptopCount(data.laptop_count || '0/0');

        if (data.admin_redirect) {
          window.location.href = '/admin';
          return;
        }

        if (data.user_session_active) {
          if (data.user_actions_redirect) {
            setView('actions');
          }
        } else {
          setView('home');
          setTakeBarcodes([]);
          setReturnBarcodes([]);
          localStorage.removeItem(TAKE_BARCODES_STORAGE_KEY);
          localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
        }
      } catch (error) {
        showToast('error', 'Home state failed', error.message);
      }
    }

    async function runHomeStatePoll() {
      if (homePollInFlightRef.current) {
        homePollQueuedRef.current = true;
        return;
      }

      homePollInFlightRef.current = true;
      try {
        await updateHomeState();
      } finally {
        homePollInFlightRef.current = false;
        if (homePollQueuedRef.current) {
          homePollQueuedRef.current = false;
          window.clearTimeout(homePollTimerRef.current);
          homePollTimerRef.current = window.setTimeout(runHomeStatePoll, HOME_STATE_POLL_DEBOUNCE_MS);
        }
      }
    }

    function scheduleHomeStatePoll() {
      window.clearTimeout(homePollTimerRef.current);
      homePollTimerRef.current = window.setTimeout(runHomeStatePoll, HOME_STATE_POLL_DEBOUNCE_MS);
    }

    window.smartBoxDebug = {
      scanUid: async (uid) => {
        const data = await postJson('/debug/scan_uid', { uid });
        if (data.redirect_admin) {
          window.location.href = '/admin';
          return data;
        }
        if (data.redirect_user) {
          setView('actions');
        }
        return data;
      }
    };

    runHomeStatePoll();
    const intervalId = window.setInterval(scheduleHomeStatePoll, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(homePollTimerRef.current);
      delete window.smartBoxDebug;
    };
  }, [showToast, view]);

  useEffect(() => {
    if (view === 'home') {
      window.clearTimeout(inactivityTimerRef.current);
      return;
    }

    function resetInactivityTimer() {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = window.setTimeout(async () => {
        try {
          await postJson('/clear_session', {});
        } catch {
          // Ignore timeout cleanup failures.
        }
        setView('home');
        setTakeBarcodes([]);
        setReturnBarcodes([]);
        localStorage.removeItem(TAKE_BARCODES_STORAGE_KEY);
        localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
      }, INACTIVITY_TIMEOUT_MS);
    }

    resetInactivityTimer();
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);

    return () => {
      window.clearTimeout(inactivityTimerRef.current);
      window.removeEventListener('mousemove', resetInactivityTimer);
      window.removeEventListener('keydown', resetInactivityTimer);
    };
  }, [view]);

  async function clearSessionAndGoHome() {
    try {
      await postJson('/clear_session', {});
    } catch {
      // Ignore cleanup failures.
    }

    setTakeBarcodes([]);
    setReturnBarcodes([]);
    localStorage.removeItem(TAKE_BARCODES_STORAGE_KEY);
    localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
    fetch('/send_arduino_signal_on', { method: 'POST' });
    setView('home');
  }

  async function goToCheckout() {
    try {
      const data = await requestJson('/get_laptop_status');
      const availableLaptops = Number.parseInt((data.laptop_count || '0/0').split('/')[0], 10);

      if (availableLaptops > 0) {
        fetch('/send_arduino_signal', { method: 'POST' });
        setTakeBarcodes(readStoredArray(TAKE_BARCODES_STORAGE_KEY));
        setView('checkout');
        return;
      }

      showToast('info', 'No devices available', 'All MacBooks are currently checked out.');
    } catch (error) {
      showToast('error', 'Status check failed', error.message);
    }
  }

  async function goToReturn() {
    try {
      await postJson('/check_user_laptops', {});
      fetch('/send_arduino_signal', { method: 'POST' });
      setReturnBarcodes(readStoredArray(RETURN_BARCODES_STORAGE_KEY));
      setView('return');
    } catch (error) {
      showToast('info', 'Return check', error.message);
    }
  }

  async function submitTake() {
    if (!takeBarcodes.length) {
      showToast('info', 'No devices selected', 'Scan at least one barcode first.');
      return;
    }

    try {
      const data = await postJson('/submit_scan', { barcodes: takeBarcodes });
      showToast('success', 'Checkout successful', data.message || 'Devices were checked out successfully.');
      setTakeBarcodes([]);
      localStorage.removeItem(TAKE_BARCODES_STORAGE_KEY);
      fetch('/send_arduino_signal_on', { method: 'POST' });
      setView('home');
    } catch (error) {
      showToast('error', 'Checkout failed', error.message);
    }
  }

  async function submitReturn() {
    if (!returnBarcodes.length) {
      showToast('info', 'No devices selected', 'Scan at least one barcode first.');
      return;
    }

    try {
      const data = await postJson('/return_laptops', { barcodes: returnBarcodes });
      showToast('success', 'Return successful', data.message || 'Devices were returned successfully.');
      setReturnBarcodes([]);
      localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
      fetch('/send_arduino_signal_on', { method: 'POST' });
      setView('home');
    } catch (error) {
      showToast('error', 'Return failed', error.message);
    }
  }

  const screenClassName = useMemo(() => {
    if (view === 'actions') {
      return 'screen screen-hello';
    }
    if (view === 'checkout' || view === 'return') {
      return 'screen screen-session';
    }
    return 'screen screen-home';
  }, [view]);

  return (
    <div className={screenClassName}>
      <AnimatedBackground />
      <Toast toast={toast} onClose={clearToast} />

      {view === 'home' ? <HomePanel language={language} setLanguage={setLanguage} laptopCount={laptopCount} /> : null}

      {view === 'actions' ? <ActionPanel onTake={goToCheckout} onReturn={goToReturn} /> : null}

      {view === 'checkout' ? (
        <SessionPanel
          title="MacBook Checkout"
          description="Use the scanner to add one device at a time."
          placeholder="Scan a barcode to check out a device"
          countLabel="Scanned Devices"
          submitLabel="Submit"
          storageKey={TAKE_BARCODES_STORAGE_KEY}
          initialBarcodes={takeBarcodes}
          onBarcodesChange={setTakeBarcodes}
          onCancel={clearSessionAndGoHome}
          onSubmit={submitTake}
          showToast={showToast}
        />
      ) : null}

      {view === 'return' ? (
        <SessionPanel
          title="MacBook Return"
          description="Scan each device that should be returned for this card."
          placeholder="Scan a barcode to return a device"
          countLabel="Devices to Return"
          submitLabel="Return"
          storageKey={RETURN_BARCODES_STORAGE_KEY}
          initialBarcodes={returnBarcodes}
          onBarcodesChange={setReturnBarcodes}
          onCancel={clearSessionAndGoHome}
          onSubmit={submitReturn}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}
