import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { deleteJson, postJson, requestJson } from '../shared/api';
import { Modal } from '../shared/modal';
import { formatDateTimeGmtPlus5 } from '../shared/time';
import { Toast, useToast } from '../shared/toast';
import { getTranslations } from '../shared/translations';

const UsersPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersPanel })));
const UsersTable = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersTable })));
const LaptopsTable = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsTable })));
const LaptopsPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsPanel })));
const AdSyncLogPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.AdSyncLogPanel })));

export function AdminPage() {
  const [adminToken, setAdminToken] = useState('');
  const [users, setUsers] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showUsersListModal, setShowUsersListModal] = useState(false);
  const [showDevicesListModal, setShowDevicesListModal] = useState(false);
  const [showAdSyncLogModal, setShowAdSyncLogModal] = useState(false);
  const [adSyncLogLines, setAdSyncLogLines] = useState([]);
  const [borrowStatusFilter, setBorrowStatusFilter] = useState('all');
  const [borrowSearchText, setBorrowSearchText] = useState('');
  const emptyUserForm = { guid: '', uid: '', first_name: '', last_name: '', name: '', email: '', description: '', category: '', is_admin: false };
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [laptopForm, setLaptopForm] = useState({ name: '', barcode: '', device_number: '', status: 'available' });
  const { toast, showToast, clearToast } = useToast();
  const t = useMemo(() => getTranslations('ru'), []);

  const filteredBorrowRecords = useMemo(() => {
    let filtered = borrowRecords;
    if (borrowStatusFilter === 'active') {
      filtered = filtered.filter(r => r.status === 'active');
    } else if (borrowStatusFilter === 'returned') {
      filtered = filtered.filter(r => r.status === 'returned');
    }
    if (borrowSearchText.trim()) {
      const query = borrowSearchText.trim().toLowerCase();
      filtered = filtered.filter(r =>
        String(r.employee_name || '').toLowerCase().includes(query) ||
        String(r.employee_email || '').toLowerCase().includes(query) ||
        String(r.device_number || '').toLowerCase().includes(query) ||
        String(r.barcode || '').toLowerCase().includes(query) ||
        String(r.device_name || '').toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [borrowRecords, borrowStatusFilter, borrowSearchText]);

  const activeCount = borrowRecords.filter(r => r.status === 'active').length;
  const returnedCount = borrowRecords.filter(r => r.status === 'returned').length;

  function authHeaders() {
    return adminToken ? { 'X-Admin-Token': adminToken } : {};
  }

  const loadAdminData = useCallback(async (nextToken = adminToken) => {
    const data = await requestJson('/admin/overview', authHeaders());
    setUsers(data.users || []);
    setLaptops(data.laptops || []);
    setBorrowRecords(data.borrow_records || []);
  }, [adminToken]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const state = await requestJson('/admin_state');
        if (!mounted) return;

        if (state.admin_session_active && state.admin_token) {
          setAdminToken(state.admin_token);
          await loadAdminData(state.admin_token);
        } else if (state.admin_redirect) {
          try {
            const loginData = await postJson('/admin/login', {});
            if (!mounted) return;
            if (loginData.admin_token) {
              setAdminToken(loginData.admin_token);
              await loadAdminData(loginData.admin_token);
            }
          } catch (error) {
            if (mounted) {
              showToast('error', t.admin.toasts.adminErrorTitle, error.message);
            }
          }
        }
      } catch (error) {
        if (mounted) {
          showToast('error', t.admin.toasts.adminErrorTitle, error.message);
        }
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [adminToken, loadAdminData, showToast, t]);

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
    window.location.href = '/';
  }

  async function handleAddUser(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/users', userForm, authHeaders());
      setUserForm(emptyUserForm);
      setShowUserModal(false);
      await loadAdminData();
      showToast('success', t.admin.toasts.userAddedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handleAddLaptop(event) {
    event.preventDefault();
    try {
      const data = await postJson('/admin/laptops', laptopForm, authHeaders());
      setLaptopForm({ name: '', barcode: '', device_number: '', status: 'available' });
      setShowDeviceModal(false);
      await loadAdminData();
      showToast('success', t.admin.toasts.deviceAddedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handleImportUsers(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/admin/users/import', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Import failed');
      }

      await loadAdminData();
      showToast('success', t.admin.toasts.importSuccessTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    } finally {
      event.target.value = '';
    }
  }

  async function removeUser(user) {
    try {
      const uid = typeof user === 'string' ? user : user?.uid;
      const guid = typeof user === 'string' ? '' : user?.guid;
      const path = uid
        ? `/admin/users/${encodeURIComponent(uid)}`
        : `/admin/users/by-guid/${encodeURIComponent(guid)}`;
      const data = await deleteJson(path, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.userRemovedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function removeLaptop(name) {
    try {
      const data = await deleteJson(`/admin/laptops/${encodeURIComponent(name)}`, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.deviceRemovedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function openAdSyncLog() {
    try {
      const data = await requestJson('/admin/ad-sync-log', authHeaders());
      setAdSyncLogLines(data.lines || []);
      setShowAdSyncLogModal(true);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handlePruneUsers() {
    try {
      const data = await postJson('/admin/ad-sync/prune', {}, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.pruneUsersTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handleRunAdSync() {
    try {
      const data = await postJson('/admin/ad-sync/run', {}, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.adSyncRunTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  return (
    <div className="admin-screen">
      <Toast toast={toast} onClose={clearToast} />
      {!adminToken ? (
        <div className="admin-login-wrap">
          <div className="admin-login-panel">
            <h1>{t.admin.accessTitle}</h1>
            <p>{t.admin.connectingText}</p>
            <div className="admin-actions">
              <button type="button" className="ghost-button" onClick={() => { window.location.href = '/'; }}>{t.common.backHome}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="admin-page">
          <header className="admin-hero">
            <div>
              <p className="admin-eyebrow">{t.admin.controlRoom}</p>
              <h1>{t.admin.panelTitle}</h1>
            </div>
            <div className="admin-hero-actions">
              <button type="button" className="ghost-button" onClick={() => loadAdminData()}>{t.common.refresh}</button>
              <button type="button" className="danger-button" onClick={handleLogout}>{t.common.logout}</button>
            </div>
          </header>

          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <span className="admin-stat-value">{users.length}</span>
              <span className="admin-stat-label">{t.admin.stats.totalUsers}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{laptops.length}</span>
              <span className="admin-stat-label">{t.admin.stats.totalDevices}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-value">{borrowRecords.length}</span>
              <span className="admin-stat-label">{t.admin.borrowRecordsTitle}</span>
            </div>
          </div>

          <div className="admin-toolbar">
            <div className="admin-toolbar-group">
              <button type="button" className="primary-button" onClick={() => setShowUserModal(true)}>{t.admin.addUser}</button>
              <button type="button" className="primary-button" onClick={() => setShowDeviceModal(true)}>{t.admin.addDevice}</button>
            </div>
            <div className="admin-toolbar-group">
              <button type="button" className="ghost-button" onClick={() => setShowUsersListModal(true)}>{t.admin.registeredUsers}</button>
              <button type="button" className="ghost-button" onClick={() => setShowDevicesListModal(true)}>{t.admin.registeredDevices}</button>
            </div>
            <div className="admin-toolbar-group">
              <button type="button" className="ghost-button" onClick={handleRunAdSync}>{t.admin.runAdSync}</button>
              <button type="button" className="ghost-button" onClick={handlePruneUsers}>{t.admin.pruneUsers}</button>
              <button type="button" className="ghost-button" onClick={openAdSyncLog}>{t.admin.viewAdSyncLog}</button>
            </div>
          </div>

          <section className="admin-panel admin-wide-panel">
            <div className="admin-panel-head admin-panel-head-with-filters">
              <h2>{t.admin.borrowRecordsTitle}</h2>
              <div className="admin-filter-row">
                <input
                  type="text"
                  className="admin-filter-input"
                  placeholder={t.admin.searchPlaceholder}
                  value={borrowSearchText}
                  onChange={(e) => setBorrowSearchText(e.target.value)}
                />
                <div className="admin-filter-tabs">
                  <button
                    type="button"
                    className={`admin-filter-tab ${borrowStatusFilter === 'all' ? 'admin-filter-tab-active' : ''}`}
                    onClick={() => setBorrowStatusFilter('all')}
                  >
                    {t.admin.filterAll} ({borrowRecords.length})
                  </button>
                  <button
                    type="button"
                    className={`admin-filter-tab ${borrowStatusFilter === 'active' ? 'admin-filter-tab-active' : ''}`}
                    onClick={() => setBorrowStatusFilter('active')}
                  >
                    {t.admin.filterActive} ({activeCount})
                  </button>
                  <button
                    type="button"
                    className={`admin-filter-tab ${borrowStatusFilter === 'returned' ? 'admin-filter-tab-active' : ''}`}
                    onClick={() => setBorrowStatusFilter('returned')}
                  >
                    {t.admin.filterReturned} ({returnedCount})
                  </button>
                </div>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t.admin.columns.id}</th>
                    <th>{t.admin.columns.name}</th>
                    <th>{t.admin.columns.barcode}</th>
                    <th>{t.admin.columns.device}</th>
                    <th>{t.admin.columns.taken}</th>
                    <th>{t.admin.columns.returned}</th>
                    <th>{t.admin.columns.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBorrowRecords.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="admin-table-empty">
                        {t.admin.noBorrowRecords}
                      </td>
                    </tr>
                  ) : (
                    filteredBorrowRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="admin-cell-id">{record.id}</td>
                        <td>
                          <span className="admin-cell-name">{record.employee_name || '-'}</span>
                          <span className="admin-cell-sub">{record.employee_email || record.employee_uid || '-'}</span>
                        </td>
                        <td><code>{record.barcode || '-'}</code></td>
                        <td>{record.device_name || record.device_number || '-'}</td>
                        <td>{formatDateTimeGmtPlus5(record.taken_at, { language: 'ru' })}</td>
                        <td>{formatDateTimeGmtPlus5(record.returned_at, { language: 'ru' })}</td>
                        <td>
                          <span className={`status-badge ${record.status === 'active' ? 'status-active' : 'status-returned'}`}>
                            {record.status === 'active' ? t.admin.statusActive : t.admin.statusReturned}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title={t.admin.addUser}>
            <Suspense fallback={<div className="admin-loading">...</div>}>
              <UsersPanel
                userForm={userForm}
                setUserForm={setUserForm}
                users={[]}
                t={t}
                onSubmit={handleAddUser}
                onRemove={() => {}}
                onImport={handleImportUsers}
                onBackToHome={() => { window.location.href = '/'; }}
              />
            </Suspense>
          </Modal>

          <Modal isOpen={showDeviceModal} onClose={() => setShowDeviceModal(false)} title={t.admin.addDevice}>
            <Suspense fallback={<div className="admin-loading">...</div>}>
              <LaptopsPanel
                laptopForm={laptopForm}
                setLaptopForm={setLaptopForm}
                laptops={[]}
                t={t}
                onSubmit={handleAddLaptop}
                onRemove={() => {}}
                onBackToHome={() => { window.location.href = '/'; }}
              />
            </Suspense>
          </Modal>

          <Modal isOpen={showUsersListModal} onClose={() => setShowUsersListModal(false)} title={t.admin.registeredUsers} fullscreen>
            <Suspense fallback={<div className="admin-loading">...</div>}>
              <UsersTable
                users={users}
                t={t}
                onRemove={removeUser}
              />
            </Suspense>
          </Modal>

          <Modal isOpen={showDevicesListModal} onClose={() => setShowDevicesListModal(false)} title={t.admin.registeredDevices} fullscreen>
            <Suspense fallback={<div className="admin-loading">...</div>}>
              <LaptopsTable
                laptops={laptops}
                t={t}
                onRemove={removeLaptop}
              />
            </Suspense>
          </Modal>

          <Modal isOpen={showAdSyncLogModal} onClose={() => setShowAdSyncLogModal(false)} title={t.admin.adSyncLogTitle} fullscreen>
            <Suspense fallback={<div className="admin-loading">...</div>}>
              <AdSyncLogPanel
                lines={adSyncLogLines}
                t={t}
              />
            </Suspense>
          </Modal>
        </div>
      )}
    </div>
  );
}
