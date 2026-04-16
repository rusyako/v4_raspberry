import { lazy, Suspense, useEffect, useState } from 'react';
import { deleteJson, postJson, requestJson } from '../shared/api';
import { Toast, useToast } from '../shared/toast';

const UsersPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersPanel })));
const LaptopsPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsPanel })));

export function AdminPage() {
  const [adminToken, setAdminToken] = useState('');
  const [users, setUsers] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [userForm, setUserForm] = useState({ uid: '', name: '', email: '', is_admin: false });
  const [laptopForm, setLaptopForm] = useState({ name: '', barcode: '', device_number: '', status: 'available' });
  const { toast, showToast, clearToast } = useToast();

  function authHeaders() {
    return adminToken ? { 'X-Admin-Token': adminToken } : {};
  }

  async function loadAdminData(nextToken = adminToken) {
    const data = await requestJson('/admin/overview', {
      method: 'GET',
      headers: nextToken ? { 'X-Admin-Token': nextToken } : {}
    });
    setUsers(data.users || []);
    setLaptops(data.laptops || []);
    setBorrowRecords(data.borrow_records || []);
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const state = await requestJson('/admin_state', { method: 'GET' });
        if (mounted && state.admin_token) {
          setAdminToken(state.admin_token);
          await loadAdminData(state.admin_token);
          return;
        }

        if (mounted && state.admin_redirect && !adminToken) {
          showToast('info', 'Admin card detected', 'Admin card recognized. Opening dashboard...');
        }
      } catch {
        return;
      }

      if (!adminToken) {
        return;
      }

      try {
        await loadAdminData(adminToken);
      } catch (error) {
        if (mounted) {
          setAdminToken('');
          showToast('error', 'Admin login required', error.message);
        }
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [adminToken, showToast]);

  async function handleLogout() {
    try {
      await postJson('/admin/logout', {}, authHeaders());
    } catch {
      // Ignore logout transport errors and clear local state anyway.
    }
    setAdminToken('');
    setUsers([]);
    setLaptops([]);
    setBorrowRecords([]);
  }

  async function handleAddUser(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/users', userForm, authHeaders());
      setUserForm({ uid: '', name: '', email: '', is_admin: false });
      await loadAdminData();
      showToast('success', 'User added', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  async function handleAddLaptop(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/laptops', laptopForm, authHeaders());
      setLaptopForm({ name: '', barcode: '', device_number: '', status: 'available' });
      await loadAdminData();
      showToast('success', 'Device added', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  async function removeUser(uid) {
    try {
      const data = await deleteJson(`/admin/users/${encodeURIComponent(uid)}`, authHeaders());
      await loadAdminData();
      showToast('success', 'User removed', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  async function removeLaptop(name) {
    try {
      const data = await deleteJson(`/admin/laptops/${encodeURIComponent(name)}`, authHeaders());
      await loadAdminData();
      showToast('success', 'Device removed', data.message);
    } catch (error) {
      showToast('error', 'Admin error', error.message);
    }
  }

  return (
    <div className="admin-screen">
      <Toast toast={toast} onClose={clearToast} />
      {!adminToken ? (
        <div className="admin-login-wrap">
          <div className="admin-login-panel">
            <h1>Admin Access</h1>
            <p>Connecting to admin dashboard...</p>
            <div className="admin-actions">
              <button type="button" className="ghost-button" onClick={() => { window.location.href = '/'; }}>Back Home</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="admin-page">
          <header className="admin-hero">
            <div>
              <p className="admin-eyebrow">Smart Box control room</p>
              <h1>Admin Panel</h1>
              <p>Manage access cards and MacBook inventory from one dashboard.</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="ghost-button" onClick={() => loadAdminData()}>Refresh</button>
              <button type="button" className="danger-button" onClick={handleLogout}>Logout</button>
            </div>
          </header>

          <div className="admin-grid">
            <Suspense fallback={<div className="admin-panel admin-loading">Loading users panel...</div>}>
              <UsersPanel
                userForm={userForm}
                setUserForm={setUserForm}
                users={users}
                onSubmit={handleAddUser}
                onRemove={removeUser}
              />
            </Suspense>

            <Suspense fallback={<div className="admin-panel admin-loading">Loading devices panel...</div>}>
              <LaptopsPanel
                laptopForm={laptopForm}
                setLaptopForm={setLaptopForm}
                laptops={laptops}
                onSubmit={handleAddLaptop}
                onRemove={removeLaptop}
              />
            </Suspense>
          </div>

          <section className="admin-panel admin-wide-panel">
            <div className="admin-panel-head">
              <h2>Borrow Records</h2>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>UID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Device #</th>
                    <th>Device</th>
                    <th>Barcode</th>
                    <th>Taken</th>
                    <th>Returned</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {borrowRecords.length ? borrowRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{record.id}</td>
                      <td>{record.employee_uid}</td>
                      <td>{record.employee_name || '-'}</td>
                      <td>{record.employee_email || '-'}</td>
                      <td>{record.device_number || '-'}</td>
                      <td>{record.device_name || '-'}</td>
                      <td>{record.barcode || '-'}</td>
                      <td>{record.taken_at || '-'}</td>
                      <td>{record.returned_at || '-'}</td>
                      <td>
                        <span className={`status-badge ${record.status === 'active' ? 'status-available' : 'status-unavailable'}`}>
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="10" className="admin-empty">No borrow records yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
