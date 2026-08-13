import React, { useState, useEffect } from 'react';

function Header({ currentPage, pages, user, onToggleSidebar }) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setClock(new Date().toLocaleString('ar-EG', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pageLabel = pages[currentPage]?.label || 'الرئيسية';

  return (
    <header className="header">
      <div className="header-actions">
        <button className="hamburger" onClick={onToggleSidebar}>☰</button>
        <span className="status-badge">✅ محلي</span>
        <span className="clock-display">{clock}</span>
      </div>
      <div className="header-title">{pageLabel}</div>
      <div className="user-info">
        <span className="user-name">{user?.name || 'مستخدم'}</span>
        <span className="role-badge">
          {user?.role === 'admin' ? '👑 مدير' : 'مستخدم'}
        </span>
        {/* تم إزالة زر تسجيل الخروج */}
      </div>
    </header>
  );
}

export default Header;