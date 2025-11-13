import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import './AppHeader.css';
import { handleLogout } from '../utils/auth';
import logger from '../utils/logger';

export default function AppHeader() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const initials = (user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'U')
    .split(' ')
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // close on outside click or ESC
  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const isLoginPage = location.pathname === '/login';

  return (
    !isLoginPage && (
      <header className="appheader">
        {/* Brand (clickable to Dashboard) */}
        <Link to="/dashboard" className="brand-link" aria-label="Go to Dashboard">
          <div className="brand-logo">
            <img
              src="/images/kushair-logo-square.png"
              alt="KU"
              style={{ width: '28px', height: '28px', borderRadius: '4px' }}
            />
          </div>
          <div className="brand-text">
            <span className="brand-title">Kush Air</span>
            <span className="brand-subtitle">Credit Management</span>
          </div>
        </Link>

        {/* Global top navigation */}
        <nav className="app-nav">
          <NavLink to="/dashboard"  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/receipts"   className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Receipts</NavLink>
          <NavLink to="/agencies"   className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Agencies</NavLink>
          <NavLink to="/export"     className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Export</NavLink>
          <NavLink to="/analytics"  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Analytics</NavLink>
        </nav>

        {/* User menu */}
        <div className="avatar-wrap" ref={menuRef}>
          <button
            className={`avatar ${open ? 'avatar--open' : ''}`}
            onClick={() => setOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={open ? 'true' : 'false'}
            aria-label="User menu"
          >
            {initials}
          </button>

          {open && (
            <div className="dropdown" role="menu">
              <div className="dropdown-header">
                <div className="dropdown-name">
                  {user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User'}
                </div>
                {user.email && <div className="dropdown-email">{user.email}</div>}
              </div>
              <Link className="dropdown-item" to="/account" onClick={() => setOpen(false)}>My Account</Link>
              <button className="dropdown-item dropdown-item--danger" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </header>
    )
  );
}