import React, { useState, useMemo } from 'react';
import './Account.css';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { handleLogout } from '../utils/auth';


export default function Account() {
  const navigate = useNavigate();
  const stored = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const [profile] = useState({
    first_name: stored.first_name || stored.name?.split(' ')[0] || '',
    last_name: stored.last_name || stored.name?.split(' ').slice(1).join(' ') || '',
    email: stored.email || '',
    phone: stored.phone || '',
    station: stored.station_code || stored.station || '',
  });

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const changePassword = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!curPwd || !newPwd || !confirmPwd) {
      setMsg({ type: 'err', text: 'Please fill all password fields.' });
      return;
    }
    if (newPwd.length < 8) {
      setMsg({ type: 'err', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPwd !== confirmPwd) {
      setMsg({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    try {
      setBusy(true);
      // backend endpoint you can add: POST /auth/change-password
      await authAPI.changePassword({ current_password: curPwd, new_password: newPwd });
      setMsg({ type: 'ok', text: 'Password updated successfully.' });
      setCurPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || err.message || 'Failed to update password.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-page">
      <div className="account-header">
        <h1>My Account</h1>
        <button className="btn btn--ghost" onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>
      </div>

      <div className="account-grid">
        {/* Profile card (read-only for now) */}
        <div className="card">
          <div className="card-title">Profile</div>
          <div className="profile-rows">
            <div className="row"><span>First Name</span><strong>{profile.first_name || '—'}</strong></div>
            <div className="row"><span>Last Name</span><strong>{profile.last_name || '—'}</strong></div>
            <div className="row"><span>Email</span><strong>{profile.email || '—'}</strong></div>
            <div className="row"><span>Phone</span><strong>{profile.phone || '—'}</strong></div>
            <div className="row"><span>Station</span><strong>{profile.station || '—'}</strong></div>
          </div>
        </div>

        {/* Change password */}
        <div className="card">
          <div className="card-title">Change Password</div>
          <form className="pwd-form" onSubmit={changePassword}>
            <label>Current Password</label>
            <input type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} />

            <label>New Password</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="At least 8 characters" />

            <label>Confirm New Password</label>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />

            {msg && (
              <div className={`alert ${msg.type === 'ok' ? 'alert--ok' : 'alert--err'}`}>{msg.text}</div>
            )}

            <div className="actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</button>
              <button className="btn btn--danger" type="button" onClick={handleLogout}>Logout</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}