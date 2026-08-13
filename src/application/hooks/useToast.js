import { useState, useCallback } from 'react';

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type };
    
    setToasts(prev => [...prev, toast]);
    
    // إزالة تلقائية بعد المدة
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    
    return id;
  }, []);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message, duration) => show(message, 'success', duration), [show]);
  const error = useCallback((message, duration) => show(message, 'error', duration), [show]);
  const warning = useCallback((message, duration) => show(message, 'warning', duration), [show]);
  const info = useCallback((message, duration) => show(message, 'info', duration), [show]);

  return { toasts, show, remove, success, error, warning, info };
}