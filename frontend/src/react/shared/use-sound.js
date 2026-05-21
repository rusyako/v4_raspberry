import { useCallback, useEffect, useRef, useState } from 'react';
import { AUDIO_SETTINGS_STORAGE_KEY } from './storage';
import { resolveLanguage } from './translations';

const SOUND_NAMES = [
  'access-granted',
  'access-denied',
  'select-action',
  'take-scan',
  'return-scan',
  'success-take',
  'success-return',
  'close-door'
];

function loadSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled !== false,
        volume: Math.min(1, Math.max(0, Number(parsed.volume) || 0.7))
      };
    }
  } catch {
    // ignore
  }
  return { enabled: true, volume: 0.7 };
}

function saveSettings(settings) {
  localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function useSound(language) {
  const [settings, setSettings] = useState(loadSettings);
  const poolsRef = useRef({});
  const lastPlayedRef = useRef({});
  const langRef = useRef(resolveLanguage(language));
  langRef.current = resolveLanguage(language);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const preload = useCallback((lang) => {
    if (poolsRef.current[lang]) return;
    const pool = {};
    SOUND_NAMES.forEach((name) => {
      const audio = new Audio(`/audio/${lang}/${name}.wav`);
      audio.preload = 'auto';
      audio.load();
      pool[name] = audio;
    });
    poolsRef.current[lang] = pool;
  }, []);

  useEffect(() => {
    const lang = resolveLanguage(language);
    preload(lang);
  }, [language, preload]);

  const play = useCallback((name) => {
    if (!settings.enabled) return;
    const lang = langRef.current;
    preload(lang);
    const pool = poolsRef.current[lang];
    if (!pool || !pool[name]) return;

    const now = Date.now();
    const last = lastPlayedRef.current[name] || 0;
    if (now - last < 300) return;
    lastPlayedRef.current[name] = now;

    const audio = pool[name].cloneNode();
    audio.volume = settings.volume;
    audio.play().catch(() => {});
  }, [settings, preload]);

  const playDelayed = useCallback((name, delayMs) => {
    window.setTimeout(() => play(name), delayMs);
  }, [play]);

  return { play, playDelayed, settings, updateSettings };
}
