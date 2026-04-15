import { useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  function showToast(tone, title, text, duration = 4200) {
    window.clearTimeout(timerRef.current);
    setToast({ tone, title, text });
    timerRef.current = window.setTimeout(() => setToast(null), duration);
  }

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { toast, showToast, clearToast: () => setToast(null) };
}

export function Toast({ toast, onClose }) {
  if (!toast) {
    return null;
  }

  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite" onClick={onClose}>
      <strong>{toast.title}</strong>
      {toast.text ? <span>{toast.text}</span> : null}
    </div>
  );
}
