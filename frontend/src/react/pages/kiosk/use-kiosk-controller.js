import { useEffect, useMemo, useRef, useState } from 'react';
import { requestJson, postJson } from '../../shared/api';
import { ensureNetworkWarmup, preloadImages } from '../../shared/network';
import {
  LANGUAGE_STORAGE_KEY,
  TAKE_BARCODES_STORAGE_KEY,
  RETURN_BARCODES_STORAGE_KEY,
  readStoredArray
} from '../../shared/storage';
import { getTranslations, resolveLanguage } from '../../shared/translations';
import {
  HOME_STATE_POLL_DEBOUNCE_MS,
  INACTIVITY_TIMEOUT_MS,
  KIOSK_PRELOAD_IMAGES,
  POLL_INTERVAL_MS
} from './constants';

export function useKioskController(showToast) {
  const [language, setLanguage] = useState(resolveLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en'));
  const [laptopCount, setLaptopCount] = useState('0/0');
  const [view, setView] = useState('home');
  const [takeBarcodes, setTakeBarcodes] = useState(() => readStoredArray(TAKE_BARCODES_STORAGE_KEY));
  const [returnBarcodes, setReturnBarcodes] = useState(() => readStoredArray(RETURN_BARCODES_STORAGE_KEY));
  const [lastAckedUserActionsEventId, setLastAckedUserActionsEventId] = useState(0);
  const [stationCellsStatus, setStationCellsStatus] = useState('0/0');
  const [activeBorrowedRecords, setActiveBorrowedRecords] = useState([]);
  const [isActiveBorrowedOpen, setIsActiveBorrowedOpen] = useState(false);
  const [isActiveBorrowedLoading, setIsActiveBorrowedLoading] = useState(false);

  const inactivityTimerRef = useRef(null);
  const homePollTimerRef = useRef(null);
  const homePollInFlightRef = useRef(false);
  const homePollQueuedRef = useRef(false);

  useEffect(() => {
    const resolvedLanguage = resolveLanguage(language);
    if (resolvedLanguage !== language) {
      setLanguage(resolvedLanguage);
      return;
    }

    localStorage.setItem(LANGUAGE_STORAGE_KEY, resolvedLanguage);
  }, [language]);

  const t = useMemo(() => getTranslations(language), [language]);

  useEffect(() => {
    ensureNetworkWarmup();
    preloadImages(KIOSK_PRELOAD_IMAGES);
  }, []);

  useEffect(() => {
    function resetBarcodeState() {
      setTakeBarcodes([]);
      setReturnBarcodes([]);
      localStorage.removeItem(TAKE_BARCODES_STORAGE_KEY);
      localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
    }

    async function updateHomeState() {
      try {
        const data = await requestJson('/home_state', { cache: 'no-store' });
        setLaptopCount(data.laptop_count || '0/0');
        setStationCellsStatus(data.station_cells_status || data.laptop_count || '0/0');

        if (data.admin_redirect) {
          window.location.href = '/admin';
          return;
        }

        if (data.user_session_active) {
          const eventId = Number.parseInt(data.user_actions_event_id || 0, 10);
          const shouldOpenActions = Boolean(data.user_actions_redirect);

          if (shouldOpenActions && eventId > lastAckedUserActionsEventId) {
            setView('actions');

            try {
              await postJson('/user_actions_event/ack', { event_id: eventId });
              setLastAckedUserActionsEventId(eventId);
            } catch {
              // Ignore ack transport errors, next poll will retry.
            }
          }
        } else {
          setView('home');
          resetBarcodeState();
          setLastAckedUserActionsEventId(0);
        }
      } catch (error) {
        showToast('error', t.kiosk.homeStateFailTitle, error.message);
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
          const eventId = Number.parseInt(data.user_actions_event_id || 0, 10);
          if (eventId > 0) {
            try {
              await postJson('/user_actions_event/ack', { event_id: eventId });
              setLastAckedUserActionsEventId(eventId);
            } catch {
              // Ignore debug ack transport errors.
            }
          }
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
  }, [lastAckedUserActionsEventId, showToast, t]);

  async function loadActiveBorrowedRecords() {
    setIsActiveBorrowedLoading(true);
    try {
      const data = await requestJson('/active_borrow_records', { method: 'GET', cache: 'no-store' });
      setActiveBorrowedRecords(data.records || []);
    } catch (error) {
      showToast('error', t.kiosk.activeBorrowedLoadFailTitle, error.message);
    } finally {
      setIsActiveBorrowedLoading(false);
    }
  }

  async function toggleActiveBorrowedInfo() {
    if (isActiveBorrowedOpen) {
      setIsActiveBorrowedOpen(false);
      return;
    }

    setIsActiveBorrowedOpen(true);
    await loadActiveBorrowedRecords();
  }

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

      showToast('info', t.kiosk.noDevicesAvailableTitle, t.kiosk.noDevicesAvailableText);
    } catch (error) {
      showToast('error', t.kiosk.statusCheckFailedTitle, error.message);
    }
  }

  async function goToReturn() {
    try {
      await postJson('/check_user_laptops', {});
      fetch('/send_arduino_signal', { method: 'POST' });
      setReturnBarcodes(readStoredArray(RETURN_BARCODES_STORAGE_KEY));
      setView('return');
    } catch (error) {
      showToast('info', t.kiosk.returnCheckFailedTitle, error.message);
    }
  }

  async function submitTake() {
    if (!takeBarcodes.length) {
      showToast('info', t.kiosk.submitEmptyTitle, t.kiosk.submitEmptyText);
      return;
    }

    try {
      const data = await postJson('/submit_scan', { barcodes: takeBarcodes });
      showToast('success', t.kiosk.checkoutSuccessTitle, data.message || t.kiosk.checkoutSuccessFallback);
      setTakeBarcodes([]);
      localStorage.removeItem(TAKE_BARCODES_STORAGE_KEY);
      fetch('/send_arduino_signal_on', { method: 'POST' });
      setView('home');
    } catch (error) {
      showToast('error', t.kiosk.checkoutFailTitle, error.message);
    }
  }

  async function submitReturn() {
    if (!returnBarcodes.length) {
      showToast('info', t.kiosk.submitEmptyTitle, t.kiosk.submitEmptyText);
      return;
    }

    try {
      const data = await postJson('/return_laptops', { barcodes: returnBarcodes });
      showToast('success', t.kiosk.returnSuccessTitle, data.message || t.kiosk.returnSuccessFallback);
      setReturnBarcodes([]);
      localStorage.removeItem(RETURN_BARCODES_STORAGE_KEY);
      fetch('/send_arduino_signal_on', { method: 'POST' });
      setView('home');
    } catch (error) {
      showToast('error', t.kiosk.returnFailTitle, error.message);
    }
  }

  const screenClassName = useMemo(() => {
    if (view === 'actions') {
      return 'screen screen-actions';
    }
    if (view === 'checkout' || view === 'return') {
      return 'screen screen-session';
    }
    return 'screen screen-home';
  }, [view]);

  return {
    language,
    setLanguage,
    t,
    laptopCount,
    stationCellsStatus,
    activeBorrowedRecords,
    isActiveBorrowedOpen,
    isActiveBorrowedLoading,
    view,
    takeBarcodes,
    setTakeBarcodes,
    returnBarcodes,
    setReturnBarcodes,
    screenClassName,
    clearSessionAndGoHome,
    toggleActiveBorrowedInfo,
    goToCheckout,
    goToReturn,
    submitTake,
    submitReturn
  };
}
