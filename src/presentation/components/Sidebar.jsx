import React from 'react';
function Sidebar({ pages, currentPage, navigateTo, isOpen, onToggle }) {
  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onToggle}></div>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-brand"><span>⛰️</span> نظام الكسارات</div>
        <nav className="sidebar-nav">
          {Object.values(pages).map(page => (
            <a key={page.id} href="#" className={currentPage === page.id ? 'active' : ''} onClick={(e) => { e.preventDefault(); navigateTo(page.id); }}>
              <span className="nav-icon">{page.icon}</span>{page.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">v4.0 · محلي بالكامل</div>
      </aside>
    </>
  );
}
export default Sidebar;
