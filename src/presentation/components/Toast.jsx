import React, { useEffect } from 'react';

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((toast, index) => (
        <div 
          key={toast.id || index} 
          className={`toast toast-${toast.type}`}
          style={{
            animation: 'toastSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            position: 'relative',
            zIndex: 99999
          }}
        >
          <span className="toast-icon">
            {toast.type === 'success' && '✅'}
            {toast.type === 'error' && '❌'}
            {toast.type === 'warning' && '⚠️'}
            {toast.type === 'info' && 'ℹ️'}
          </span>
          <span>{toast.message}</span>
          <button 
            className="toast-close"
            onClick={() => {
              const el = document.querySelector(`.toast[data-id="${toast.id}"]`);
              if (el) {
                el.classList.add('toast-exit');
                setTimeout(() => {
                  // إزالة يدوية
                }, 350);
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              marginLeft: '0.5rem'
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toast;