import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((tone, title, text, duration = 4200) => {
    window.clearTimeout(timerRef.current);
    setToast({ tone, title, text });
    timerRef.current = window.setTimeout(() => setToast(null), duration);
  }, []);

  const clearToast = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { toast, showToast, clearToast };
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toast, onClose]);

  if (!toast) {
    return null;
  }

  return (
    <div className="toast-overlay">
      <section className={`toast toast-${toast.tone}`} role="alertdialog" aria-live="assertive" aria-modal="true">
        <button type="button" className="toast-close" onClick={onClose} aria-label="Close notification">
          <span aria-hidden="true">&times;</span>
        </button>
        <div className="toast-content">
          <strong>{toast.title}</strong>
          {toast.text ? <p>{toast.text}</p> : null}
        </div>
      </section>
    </div>
  );
}
