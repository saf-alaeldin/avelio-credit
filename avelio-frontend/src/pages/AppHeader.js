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
        {/* Brand (clickable to home - Dashboard for most users, Settlements for auditors) */}
        <Link to={user.role === 'auditor' ? '/settlements' : '/dashboard'} className="brand-link" aria-label="Go to Home">
          <div className="brand-logo">
            <img
              src="/images/kushair-logo.png"
              alt="Kush Air"
              style={{ height: '45px', width: 'auto' }}
            />
          </div>
        </Link>

        {/* Global top navigation */}
        <nav className="app-nav">
          {user.role !== 'auditor' && (
            <NavLink to="/dashboard"  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
          )}
          {user.role !== 'auditor' && (
            <>
              <NavLink to="/receipts"   className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Receipts</NavLink>
              <NavLink to="/agencies"   className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Agencies</NavLink>
              <NavLink to="/station-settlement" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Station Settlement</NavLink>
            </>
          )}
          {(user.role === 'admin' || user.role === 'manager' || user.role === 'auditor') && (
            <NavLink to="/settlements" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Settlements</NavLink>
          )}
          {(user.role === 'admin' || user.role === 'manager' || user.role === 'auditor') && (
            <NavLink to="/station-summary" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>Station Summary</NavLink>
          )}
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
              <div className="dropdown-divider"></div>
              <div className="dropdown-section">Tools</div>
              <Link className="dropdown-item" to="/export" onClick={() => setOpen(false)}>Export</Link>
              <Link className="dropdown-item" to="/analytics" onClick={() => setOpen(false)}>Analytics</Link>
              {user.role === 'admin' && (
                <Link className="dropdown-item" to="/users" onClick={() => setOpen(false)}>Users</Link>
              )}
              {(user.role === 'admin' || user.role === 'manager') && (
                <>
                  <div className="dropdown-divider"></div>
                  <div className="dropdown-section">Settlement Admin</div>
                  <Link className="dropdown-item" to="/stations-admin" onClick={() => setOpen(false)}>Stations</Link>
                  <Link className="dropdown-item" to="/sales-agents" onClick={() => setOpen(false)}>Sales Agents</Link>
                  <Link className="dropdown-item" to="/expense-codes" onClick={() => setOpen(false)}>Expense Codes</Link>
                </>
              )}
              <div className="dropdown-divider"></div>
              <button className="dropdown-item dropdown-item--danger" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </header>
    )
  );
}