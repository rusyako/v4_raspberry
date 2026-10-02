import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { deleteJson, postJson, requestJson } from '../shared/api';
import { Modal } from '../shared/modal';
import { formatDateTimeGmtPlus5 } from '../shared/time';
import { Toast, useToast } from '../shared/toast';
import { useSound } from '../shared/use-sound';
import { getTranslations } from '../shared/translations';
import { IconUsers, IconLaptop, IconAnalytics, IconSettings, IconLogs, IconUser, IconShield, IconCalendarClock, IconSync, IconSearch, IconClear, IconWarning, IconCheckCircle, IconAlertCircle, IconBell, IconRefresh, IconLogout } from '../shared/admin-icons';

function isIncompleteUser(user) {
  const hasRfid = Boolean((user.uid_hex || user.uid || '').trim());
  const hasEmail = Boolean(String(user.email || '').trim());
  return !hasRfid || !hasEmail;
}

function getUserWarning(user, t) {
  const hasRfid = Boolean((user.uid_hex || user.uid || '').trim());
  const hasEmail = Boolean(String(user.email || '').trim());
  if (!hasRfid && !hasEmail) return t.admin.incompleteNoBoth;
  if (!hasRfid) return t.admin.incompleteNoRfid;
  if (!hasEmail) return t.admin.incompleteNoEmail;
  return '';
}

const UsersTable = lazy(() => import('./admin-panels').then((module) => ({ default: module.UsersTable })));
const LaptopsTable = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsTable })));
const LaptopsPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.LaptopsPanel })));
const AdSyncLogPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.AdSyncLogPanel })));
const AnalysisPanel = lazy(() => import('./admin-panels').then((module) => ({ default: module.AnalysisPanel })));

function getAdSyncSummary(lines) {
  if (!Array.isArray(lines) || !lines.length) {
    return { syncedAt: '', status: 'never', added: null, updated: null, skipped: null, removed: null };
  }

  // Timestamped header lines mark the start of every sync run — from the admin
  // panel ("AD import ...") or the systemd auto-sync ("Start AD sync" /
  // "AD sync finished"). Any line that begins with a [YYYY-MM-DD HH:MM:SS] stamp
  // counts as a run boundary, so both variants are recognized.
  const isStampLine = (line) => /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/.test(line);

  // Find the newest completed import result (produced by Export_AD_users.py for
  // both manual and auto runs).
  let resultIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/Импорт завершен/i.test(lines[index])) {
      resultIndex = index;
      break;
    }
  }

  // Find the newest timestamped boundary to use as the sync moment.
  let lastStampIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isStampLine(lines[index])) {
      lastStampIndex = index;
      break;
    }
  }

  if (resultIndex < 0 && lastStampIndex < 0) {
    return { syncedAt: '', status: 'never', added: null, updated: null, skipped: null, removed: null };
  }

  // Prefer the timestamp of the run boundary that owns the latest result; if the
  // newest event is a bare boundary (auto-sync just started/finished) use that.
  let syncedAt = '';
  if (resultIndex >= 0) {
    for (let index = resultIndex; index >= 0; index -= 1) {
      if (isStampLine(lines[index])) {
        syncedAt = lines[index].match(/^\[([^\]]+)\]/)?.[1] || '';
        break;
      }
    }
  }
  if (lastStampIndex > resultIndex) {
    syncedAt = lines[lastStampIndex].match(/^\[([^\]]+)\]/)?.[1] || syncedAt;
  }
  if (!syncedAt && lastStampIndex >= 0) {
    syncedAt = lines[lastStampIndex].match(/^\[([^\]]+)\]/)?.[1] || '';
  }

  const resultMatch = resultIndex >= 0
    ? lines[resultIndex].match(/Добавлено:\s*(\d+),\s*обновлено:\s*(\d+),\s*пропущено:\s*(\d+),\s*удалено:\s*(\d+)/i)
    : null;

  // Consider the tail of the log for failure signals.
  const tail = lines.slice(Math.max(0, (resultIndex >= 0 ? resultIndex : lastStampIndex) - 2)).join('\n');
  const failed = /FAILED|Traceback|\[-\]|\[!\]\s*Ошибка/i.test(tail) && !resultMatch;

  return {
    syncedAt,
    status: failed ? 'failed' : 'ok',
    added: resultMatch ? Number(resultMatch[1]) : null,
    updated: resultMatch ? Number(resultMatch[2]) : null,
    skipped: resultMatch ? Number(resultMatch[3]) : null,
    removed: resultMatch ? Number(resultMatch[4]) : null
  };
}

function formatAdSyncDate(value) {
  if (!value) return 'Нет данных';
  // Log timestamps are written in the container's UTC clock; render them in
  // GMT+5 so admins see local Almaty time.
  const formatted = formatDateTimeGmtPlus5(value, { language: 'ru', compact: true });
  return formatted === '--' ? 'Нет данных' : formatted;
}

export function AdminPage({ onClose, lite }) {
  const [adminToken, setAdminToken] = useState('');
  const [activeTab, setActiveTab] = useState('analytics');
  const [logsSubTab, setLogsSubTab] = useState('rfid');
  const [analyticsSubTab, setAnalyticsSubTab] = useState('overview');
  const PAGE_SIZE = lite ? 24 : 50;
  const [users, setUsers] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [adSyncLogLines, setAdSyncLogLines] = useState([]);
  const [adSyncLogLastModified, setAdSyncLogLastModified] = useState(null);
  const [adSyncRunning, setAdSyncRunning] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferStep, setTransferStep] = useState(1);
  const [transferDeviceNames, setTransferDeviceNames] = useState([]);
  const [transferDeviceSearchText, setTransferDeviceSearchText] = useState('');
  const [transferAdminGuid, setTransferAdminGuid] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [deviceSortKey, setDeviceSortKey] = useState('device_number');
  const [deviceSortDir, setDeviceSortDir] = useState('asc');
  const [adminSearchText, setAdminSearchText] = useState('');
  const [userSearchText, setUserSearchText] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifySearchText, setNotifySearchText] = useState('');
  const [deviceSearchText, setDeviceSearchText] = useState('');
  const [deviceStatusFilter, setDeviceStatusFilter] = useState('all');
  const [borrowPage, setBorrowPage] = useState(0);
  const [borrowStatusFilter, setBorrowStatusFilter] = useState('all');
  const [borrowSearchText, setBorrowSearchText] = useState('');
  const [borrowDateFilter, setBorrowDateFilter] = useState('all');
  const [laptopForm, setLaptopForm] = useState({ name: '', barcode: '', device_number: '', status: 'available' });
  const { toast, showToast, clearToast } = useToast();
  const { settings: soundSettings, updateSettings: updateSoundSettings, play } = useSound('ru');
  const t = useMemo(() => getTranslations('ru'), []);
  const [localSoundEnabled, setLocalSoundEnabled] = useState(soundSettings.enabled);
  const [localSoundVolume, setLocalSoundVolume] = useState(Math.round(soundSettings.volume * 100));
  const [testSoundName, setTestSoundName] = useState('access-granted');
  const [rfidLogEvents, setRfidLogEvents] = useState([]);
  const [rfidLogLoading, setRfidLogLoading] = useState(false);

  const filteredBorrowRecords = useMemo(() => {
    let filtered = borrowRecords;
    if (borrowStatusFilter === 'active') {
      filtered = filtered.filter(r => r.status === 'active' && !r.comment);
    } else if (borrowStatusFilter === 'returned') {
      filtered = filtered.filter(r => r.status === 'returned');
    } else if (borrowStatusFilter === 'transferred') {
      filtered = filtered.filter(r => Boolean(r.comment));
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
    if (borrowDateFilter !== 'all') {
      const now = new Date();
      let since;
      if (borrowDateFilter === 'today') {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (borrowDateFilter === 'week') {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      } else if (borrowDateFilter === 'month') {
        since = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      }
      if (since) {
        const sinceStr = since.toISOString().slice(0, 10);
        filtered = filtered.filter(r => r.taken_at && String(r.taken_at) >= sinceStr);
      }
    }
    return filtered;
  }, [borrowRecords, borrowStatusFilter, borrowSearchText, borrowDateFilter]);

  const activeCount = borrowRecords.filter(r => r.status === 'active' && !r.comment).length;
  const returnedCount = borrowRecords.filter(r => r.status === 'returned').length;
  const transferredCount = borrowRecords.filter(r => Boolean(r.comment)).length;
  const totalPages = Math.max(1, Math.ceil(filteredBorrowRecords.length / PAGE_SIZE));
  const safePage = Math.min(borrowPage, totalPages - 1);
  const paginatedRecords = filteredBorrowRecords.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const adminUsers = useMemo(() => users.filter((user) => user.is_admin), [users]);
  const filteredAdminUsers = useMemo(() => {
    const selectableAdmins = adminUsers.filter((user) => String(user.uid || '').trim());
    if (!adminSearchText.trim()) return selectableAdmins;
    const q = adminSearchText.trim().toLowerCase();
    return selectableAdmins.filter(u =>
      String(u.name || '').toLowerCase().includes(q) ||
      String(u.uid || '').toLowerCase().includes(q) ||
      String(u.email || '').toLowerCase().includes(q)
    );
  }, [adminUsers, adminSearchText]);
  const adSyncSummary = useMemo(() => getAdSyncSummary(adSyncLogLines), [adSyncLogLines]);

  const userCounts = useMemo(() => {
    let admins = 0;
    let regular = 0;
    let incomplete = 0;
    users.forEach((user) => {
      if (isIncompleteUser(user)) {
        incomplete += 1;
      } else if (user.is_admin) {
        admins += 1;
      } else {
        regular += 1;
      }
    });
    return { total: admins + regular, admins, regular, incomplete };
  }, [users]);

  const emailUsers = useMemo(() => users.filter((user) => String(user.email || '').trim()), [users]);
  const notifyCount = useMemo(() => emailUsers.filter((user) => user.notify_reminder).length, [emailUsers]);

  const visibleUsers = useMemo(() => {
    let result = userRoleFilter === 'incomplete'
      ? users.filter((user) => isIncompleteUser(user))
      : users.filter((user) => !isIncompleteUser(user));
    if (userRoleFilter === 'admin') {
      result = result.filter((user) => user.is_admin);
    } else if (userRoleFilter === 'user') {
      result = result.filter((user) => !user.is_admin);
    }
    const query = userSearchText.trim().toLowerCase();
    if (query) {
      result = result.filter((user) => {
        const fullName = user.name || `${user.first_name || ''} ${user.last_name || ''}`;
        return (
          fullName.toLowerCase().includes(query) ||
          String(user.email || '').toLowerCase().includes(query) ||
          String(user.uid_hex || user.uid || '').toLowerCase().includes(query) ||
          String(user.uid_dec || '').toLowerCase().includes(query)
        );
      });
    }
    return result;
  }, [users, userRoleFilter, userSearchText]);
  const usersFilterActive = userRoleFilter !== 'all' || Boolean(userSearchText.trim());

  const handleDeviceSort = (key) => {
    if (deviceSortKey === key) {
      setDeviceSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDeviceSortKey(key);
      setDeviceSortDir('asc');
    }
  };

  const laptopRows = useMemo(() => laptops.map((laptop) => {
    const activeRecord = borrowRecords.find((record) => record.status === 'active' && (record.device_number === laptop.device_number || record.barcode === laptop.barcode));
    return {
      ...laptop,
      bookingStatus: activeRecord ? t.admin.statusActive : t.admin.statusAvailable,
      borrowerName: activeRecord?.employee_name || '-',
      borrowerUid: activeRecord?.employee_uid || '',
      canAssign: Boolean(activeRecord)
    };
  }), [laptops, borrowRecords, t]);

  const sortedLaptopRows = useMemo(() => {
    const sorted = [...laptopRows];
    sorted.sort((a, b) => {
      const va = String(a[deviceSortKey] || '');
      const vb = String(b[deviceSortKey] || '');
      return deviceSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return sorted;
  }, [laptopRows, deviceSortKey, deviceSortDir]);

  const deviceCounts = useMemo(() => {
    let busy = 0;
    laptopRows.forEach((laptop) => { if (laptop.canAssign) busy += 1; });
    return { total: laptopRows.length, available: laptopRows.length - busy, busy };
  }, [laptopRows]);

  const lastDeviceAddedAt = useMemo(() => {
    const dates = laptops.map((laptop) => String(laptop.created_at || '').trim()).filter(Boolean);
    return dates.length ? dates.sort()[dates.length - 1] : '';
  }, [laptops]);

  const transferableLaptops = useMemo(() => laptopRows.filter((laptop) => laptop.canAssign), [laptopRows]);
  const filteredTransferLaptops = useMemo(() => {
    const query = transferDeviceSearchText.trim().toLowerCase();
    if (!query) return transferableLaptops;
    return transferableLaptops.filter((laptop) => (
      String(laptop.device_number || laptop.name || '').toLowerCase().includes(query) ||
      String(laptop.barcode || '').toLowerCase().includes(query) ||
      String(laptop.borrowerName || '').toLowerCase().includes(query)
    ));
  }, [transferableLaptops, transferDeviceSearchText]);
  const selectedTransferAdmin = adminUsers.find((user) => user.guid === transferAdminGuid);

  const visibleLaptops = useMemo(() => {
    let result = sortedLaptopRows;
    if (deviceStatusFilter === 'available') {
      result = result.filter((laptop) => !laptop.canAssign);
    } else if (deviceStatusFilter === 'busy') {
      result = result.filter((laptop) => laptop.canAssign);
    }
    const query = deviceSearchText.trim().toLowerCase();
    if (query) {
      result = result.filter((laptop) => (
        String(laptop.device_number || '').toLowerCase().includes(query) ||
        String(laptop.name || '').toLowerCase().includes(query) ||
        String(laptop.barcode || '').toLowerCase().includes(query) ||
        String(laptop.borrowerName || '').toLowerCase().includes(query)
      ));
    }
    return result;
  }, [sortedLaptopRows, deviceStatusFilter, deviceSearchText]);
  const devicesFilterActive = deviceStatusFilter !== 'all' || Boolean(deviceSearchText.trim());

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

  useEffect(() => {
    if (!adminToken || activeTab !== 'logs') return;
    if (logsSubTab === 'rfid') {
      loadRfidLogs();
    } else {
      openAdSyncLog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, activeTab, logsSubTab]);

  useEffect(() => {
    if (!adminToken || activeTab !== 'users') return;
    openAdSyncLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, activeTab]);

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
    if (onClose) {
      onClose();
    } else {
      window.location.href = '/';
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

  async function handleToggleUserNotify(user) {
    try {
      const guid = user.guid;
      if (!guid) return;
      const data = await postJson(`/admin/users/${encodeURIComponent(guid)}/toggle-notify`, {}, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.notifyToggledTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function removeLaptop(name) {
    if (!window.confirm(t.admin.confirmDeleteDevice.replace('{name}', name))) {
      return;
    }
    try {
      const data = await deleteJson(`/admin/laptops/${encodeURIComponent(name)}`, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.deviceRemovedTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  function closeTransferWizard() {
    if (transferSubmitting) return;
    setShowTransferModal(false);
    setTransferStep(1);
    setTransferDeviceNames([]);
    setTransferDeviceSearchText('');
    setTransferAdminGuid('');
    setAdminSearchText('');
    setTransferReason('');
  }

  function openTransferWizard(laptop) {
    setTransferStep(1);
    setTransferDeviceNames(laptop?.name ? [laptop.name] : []);
    setTransferDeviceSearchText('');
    setTransferAdminGuid('');
    setAdminSearchText('');
    setTransferReason('');
    setShowTransferModal(true);
  }

  function toggleTransferDevice(laptopName) {
    setTransferDeviceNames((current) => current.includes(laptopName)
      ? current.filter((name) => name !== laptopName)
      : [...current, laptopName]);
  }

  async function handleTransferBookings(event) {
    event.preventDefault();
    if (!transferDeviceNames.length || !selectedTransferAdmin || !transferReason.trim()) return;

    setTransferSubmitting(true);
    const errors = [];
    let transferred = 0;
    for (const laptopName of transferDeviceNames) {
      try {
        await postJson(`/admin/laptops/${encodeURIComponent(laptopName)}/assign-admin`, {
          guid: transferAdminGuid,
          reason: transferReason.trim()
        }, authHeaders());
        transferred += 1;
      } catch (error) {
        errors.push(`${laptopName}: ${error.message}`);
      }
    }

    try {
      await loadAdminData();
    } catch (error) {
      errors.push(`${t.common.refresh}: ${error.message}`);
    }

    const summary = `${t.admin.transferSuccessCount} ${transferred} ${t.admin.transferOfCount} ${transferDeviceNames.length}.`;
    if (errors.length) {
      showToast('error', t.admin.toasts.adminErrorTitle, `${summary} ${errors.slice(0, 2).join(' ')}`);
    } else {
      showToast('success', t.admin.toasts.deviceTransferredTitle, summary);
    }
    setShowTransferModal(false);
    setTransferStep(1);
    setTransferDeviceNames([]);
    setTransferDeviceSearchText('');
    setTransferAdminGuid('');
    setAdminSearchText('');
    setTransferReason('');
    setTransferSubmitting(false);
  }

  function handleExportBorrowRecords() {
    const csvRows = [['ID','Сотрудник','Email','Штрихкод','№ уст-ва','Устройство','Выдано','Возвращено','Статус','Комментарий']];
    borrowRecords.forEach(r => {
      csvRows.push([r.id, r.employee_name, r.employee_email, r.barcode, r.device_number, r.device_name, r.taken_at, r.returned_at, r.comment ? 'Перенесено' : r.status, r.comment || '']);
    });
    const csvContent = '\uFEFF' + csvRows.map(row => row.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `borrow_records_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openAdSyncLog() {
    try {
      const data = await requestJson('/admin/ad-sync-log', authHeaders());
      setAdSyncLogLines(data.lines || []);
      setAdSyncLogLastModified(data.last_modified || null);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handlePruneUsers() {
    if (!window.confirm(t.admin.confirmPruneUsers)) return;
    try {
      const data = await postJson('/admin/ad-sync/prune', {}, authHeaders());
      await loadAdminData();
      showToast('success', t.admin.toasts.pruneUsersTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    }
  }

  async function handleRunAdSync() {
    if (!window.confirm(t.admin.confirmRunAdSync)) return;
    setAdSyncRunning(true);
    try {
      const data = await postJson('/admin/ad-sync/run', {}, authHeaders());
      await loadAdminData();
      await openAdSyncLog();
      showToast('success', t.admin.toasts.adSyncRunTitle, data.message);
    } catch (error) {
      showToast('error', t.admin.toasts.adminErrorTitle, error.message);
    } finally {
      setAdSyncRunning(false);
    }
  }

  async function loadRfidLogs() {
    setRfidLogLoading(true);
    try {
      const data = await requestJson('/admin/rfid-logs', authHeaders());
      setRfidLogEvents(data.events || []);
    } catch (error) {
      showToast('error', t.admin.rfidLogError, error.message);
    } finally {
      setRfidLogLoading(false);
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
              <button type="button" className="ghost-button" onClick={() => { if (onClose) onClose(); else window.location.href = '/'; }}>{t.common.backHome}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className={`admin-page admin-page-tabbed admin-page-no-topbar ${lite ? 'admin-page-lite' : ''}`}>
          <div className="admin-tab-content">
            {activeTab === 'users' && (
              <section className="admin-panel admin-wide-panel users-table-panel">
                <div className="ad-sync-bar">
                  <strong className="admin-summary-title">{t.admin.tabs.users}</strong>
                  <span className="ad-sync-divider" aria-hidden="true" />
                  {adSyncSummary.status === 'never' ? (
                    <div className="ad-sync-status ad-sync-status-neutral" title={t.admin.adStatusNever}>
                      <IconAlertCircle size={16} />
                      <span>{t.admin.adStatusNever}</span>
                    </div>
                  ) : adSyncSummary.status === 'failed' ? (
                    <div className="ad-sync-status ad-sync-status-failed" title={t.admin.adStatusFailed}>
                      <IconAlertCircle size={16} />
                      <span>{t.admin.adStatusFailed}</span>
                    </div>
                  ) : (
                    <div className="ad-sync-status ad-sync-status-ok" title={t.admin.adStatusOk}>
                      <IconCheckCircle size={16} />
                      <span>{t.admin.adStatusOk}</span>
                    </div>
                  )}

                  <div className="ad-sync-stat" title="Дата последней синхронизации с AD">
                    <IconCalendarClock className="ad-sync-stat-icon" size={16} />
                    <span className="ad-sync-date-value">{formatAdSyncDate(adSyncSummary.syncedAt || adSyncLogLastModified)}</span>
                  </div>

                  {adSyncSummary.status === 'ok' ? (
                    <>
                      {(adSyncSummary.added || adSyncSummary.removed) ? (
                        <div className="ad-sync-delta">
                          {adSyncSummary.added ? <span className="ad-sync-delta-add">+{adSyncSummary.added} {t.admin.adDeltaNew}</span> : null}
                          {adSyncSummary.removed ? <span className="ad-sync-delta-remove">−{adSyncSummary.removed} {t.admin.adDeltaRemoved}</span> : null}
                        </div>
                      ) : null}
                      {adSyncSummary.skipped ? (
                        <div className="ad-sync-skipped" title="Записи в AD без обязательных полей">
                          <IconWarning size={15} />
                          <span>{adSyncSummary.skipped} {t.admin.adSkipped}</span>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className="admin-summary-total" title={`${t.admin.registeredUsers}: ${users.length}`}>
                    <IconUsers size={18} />
                    <strong>{users.length}</strong>
                  </div>

                  <button
                    type="button"
                    className="ad-sync-icon-button admin-summary-action"
                    onClick={handleRunAdSync}
                    disabled={adSyncRunning}
                    title={t.admin.runAdSync}
                    aria-label={t.admin.runAdSync}
                  >
                    <IconSync className={`ad-sync-btn-icon ${adSyncRunning ? 'ad-sync-spinning' : ''}`} size={18} />
                    <span>{adSyncRunning ? 'Синхронизация...' : 'AD синхронизация'}</span>
                  </button>

                  <button
                    type="button"
                    className="ad-sync-icon-btn"
                    onClick={() => loadAdminData()}
                    title={t.common.refresh}
                    aria-label={t.common.refresh}
                  >
                    <IconRefresh size={18} />
                  </button>

                  <button
                    type="button"
                    className="ad-sync-icon-btn ad-sync-icon-btn-danger"
                    onClick={() => { if (onClose) onClose(); else handleLogout(); }}
                    title={onClose ? t.common.backHome : t.common.logout}
                    aria-label={onClose ? t.common.backHome : t.common.logout}
                  >
                    <IconLogout size={18} />
                  </button>
                </div>

                <div className="users-toolbar">
                  <div className="users-search">
                    <IconSearch className="users-search-icon" size={16} />
                    <input
                      type="text"
                      className="users-search-input"
                      placeholder={t.admin.usersSearchPlaceholder}
                      value={userSearchText}
                      onChange={(event) => setUserSearchText(event.target.value)}
                    />
                    {userSearchText ? (
                      <button
                        type="button"
                        className="users-search-clear"
                        onClick={() => setUserSearchText('')}
                        title={t.common.cancel}
                        aria-label={t.common.cancel}
                      >
                        <IconClear size={15} />
                      </button>
                    ) : null}
                  </div>

                  <div className="users-role-filters" role="group" aria-label={t.admin.roleLabel}>
                    <button
                      type="button"
                      className={`users-role-filter ${userRoleFilter === 'all' ? 'users-role-filter-active' : ''}`}
                      onClick={() => setUserRoleFilter('all')}
                      title={t.admin.usersFilterAll}
                    >
                      <IconUsers size={16} />
                      <span className="users-role-count">{userCounts.total}</span>
                      <span className="users-role-text">{t.admin.usersFilterAll}</span>
                    </button>
                    <button
                      type="button"
                      className={`users-role-filter ${userRoleFilter === 'admin' ? 'users-role-filter-active' : ''}`}
                      onClick={() => setUserRoleFilter('admin')}
                      title={t.admin.usersFilterAdmins}
                    >
                      <IconShield size={16} className="ad-sync-icon-admin" />
                      <span className="users-role-count">{userCounts.admins}</span>
                      <span className="users-role-text">{t.admin.usersFilterAdmins}</span>
                    </button>
                    <button
                      type="button"
                      className={`users-role-filter ${userRoleFilter === 'user' ? 'users-role-filter-active' : ''}`}
                      onClick={() => setUserRoleFilter('user')}
                      title={t.admin.usersFilterUsers}
                    >
                      <IconUser size={16} className="ad-sync-icon-user" />
                      <span className="users-role-count">{userCounts.regular}</span>
                      <span className="users-role-text">{t.admin.usersFilterUsers}</span>
                    </button>
                    {userCounts.incomplete > 0 ? (
                      <button
                        type="button"
                        className={`users-role-filter users-role-filter-warn ${userRoleFilter === 'incomplete' ? 'users-role-filter-active' : ''}`}
                        onClick={() => setUserRoleFilter('incomplete')}
                        title={t.admin.usersFilterIncomplete}
                      >
                        <IconWarning size={16} />
                        <span className="users-role-count">{userCounts.incomplete}</span>
                        <span className="users-role-text">{t.admin.usersFilterIncomplete}</span>
                      </button>
                    ) : null}
                  </div>

                </div>

                <Suspense fallback={<div className="admin-loading">...</div>}>
                  <UsersTable
                    users={visibleUsers}
                    t={t}
                    getWarning={(user) => getUserWarning(user, t)}
                    emptyText={usersFilterActive ? t.admin.usersNothingFound : t.admin.noUsers}
                  />
                </Suspense>
              </section>
            )}

            {activeTab === 'devices' && (
              <section className="admin-panel admin-wide-panel users-table-panel">
                <div className="ad-sync-bar devices-summary-bar">
                  <strong className="admin-summary-title">{t.admin.tabs.devices}</strong>
                  <span className="ad-sync-divider" aria-hidden="true" />
                  <div className="ad-sync-stat" title={t.admin.devicesLastAdded}>
                    <IconCalendarClock className="ad-sync-stat-icon" size={16} />
                    <span className="ad-sync-stat-muted">{t.admin.devicesLastAdded}:</span>
                    <span className="ad-sync-date-value">
                      {lastDeviceAddedAt ? formatDateTimeGmtPlus5(lastDeviceAddedAt, { language: 'ru', compact: true }) : '—'}
                    </span>
                  </div>

                  <div className="admin-summary-total" title={`${t.admin.devicesFilterAll}: ${deviceCounts.total}`}>
                    <IconLaptop size={18} />
                    <strong>{deviceCounts.total}</strong>
                  </div>

                  <button type="button" className="primary-button small device-add-summary-button admin-summary-action" onClick={() => setShowDeviceModal(true)}>
                    + {t.admin.addDevice}
                  </button>
                  <button type="button" className="ad-sync-icon-btn" onClick={() => loadAdminData()} title={t.common.refresh} aria-label={t.common.refresh}>
                    <IconRefresh size={18} />
                  </button>
                  <button
                    type="button"
                    className="ad-sync-icon-btn ad-sync-icon-btn-danger"
                    onClick={() => { if (onClose) onClose(); else handleLogout(); }}
                    title={onClose ? t.common.backHome : t.common.logout}
                    aria-label={onClose ? t.common.backHome : t.common.logout}
                  >
                    <IconLogout size={18} />
                  </button>
                </div>

                <div className="users-toolbar">
                  <div className="users-search">
                    <IconSearch className="users-search-icon" size={16} />
                    <input
                      type="text"
                      className="users-search-input"
                      placeholder={t.admin.devicesSearchPlaceholder}
                      value={deviceSearchText}
                      onChange={(event) => setDeviceSearchText(event.target.value)}
                    />
                    {deviceSearchText ? (
                      <button
                        type="button"
                        className="users-search-clear"
                        onClick={() => setDeviceSearchText('')}
                        title={t.common.cancel}
                        aria-label={t.common.cancel}
                      >
                        <IconClear size={15} />
                      </button>
                    ) : null}
                  </div>

                  <div className="users-role-filters" role="group" aria-label={t.admin.statusLabel}>
                    <button
                      type="button"
                      className={`users-role-filter ${deviceStatusFilter === 'all' ? 'users-role-filter-active' : ''}`}
                      onClick={() => setDeviceStatusFilter('all')}
                      title={t.admin.devicesFilterAll}
                    >
                      <IconLaptop size={16} />
                      <span className="users-role-count">{deviceCounts.total}</span>
                      <span className="users-role-text">{t.admin.devicesFilterAll}</span>
                    </button>
                    <button
                      type="button"
                      className={`users-role-filter ${deviceStatusFilter === 'available' ? 'users-role-filter-active' : ''}`}
                      onClick={() => setDeviceStatusFilter('available')}
                      title={t.admin.devicesFilterAvailable}
                    >
                      <span className="device-status-dot device-status-dot-available" />
                      <span className="users-role-count">{deviceCounts.available}</span>
                      <span className="users-role-text">{t.admin.devicesFilterAvailable}</span>
                    </button>
                    <button
                      type="button"
                      className={`users-role-filter ${deviceStatusFilter === 'busy' ? 'users-role-filter-active' : ''}`}
                      onClick={() => setDeviceStatusFilter('busy')}
                      title={t.admin.devicesFilterBusy}
                    >
                      <span className="device-status-dot device-status-dot-busy" />
                      <span className="users-role-count">{deviceCounts.busy}</span>
                      <span className="users-role-text">{t.admin.devicesFilterBusy}</span>
                    </button>
                  </div>
                </div>

                <Suspense fallback={<div className="admin-loading">...</div>}>
                  <LaptopsTable
                    laptops={visibleLaptops}
                    t={t}
                    onRemove={removeLaptop}
                    onAction={openTransferWizard}
                    onSort={handleDeviceSort}
                    sortKey={deviceSortKey}
                    sortDir={deviceSortDir}
                    emptyText={devicesFilterActive ? t.admin.devicesNothingFound : t.admin.noDevices}
                  />
                </Suspense>
              </section>
            )}

            {activeTab === 'analytics' && (
              <>
                <div className="admin-analytics-tabs">
                  <button type="button" className={`admin-filter-tab ${analyticsSubTab === 'overview' ? 'admin-filter-tab-active' : ''}`} onClick={() => setAnalyticsSubTab('overview')}>Обзор</button>
                  <button type="button" className={`admin-filter-tab ${analyticsSubTab === 'journal' ? 'admin-filter-tab-active' : ''}`} onClick={() => setAnalyticsSubTab('journal')}>Журнал выдач</button>
                </div>

                {analyticsSubTab === 'overview' ? (
                  <Suspense fallback={<div className="admin-loading">...</div>}>
                    <AnalysisPanel
                      users={users}
                      laptops={laptops}
                      borrowRecords={borrowRecords}
                      t={t}
                    />
                  </Suspense>
                ) : (
                  <section className="admin-panel admin-wide-panel">
                  <div className="admin-panel-head admin-panel-head-with-filters">
                    <h2>{t.admin.borrowRecordsTitle}</h2>
                    <button type="button" className="ghost-button small" onClick={handleExportBorrowRecords} style={{ marginLeft: 'auto' }}>{t.admin.exportLabel}</button>
                    <div className="admin-filter-row">
                      <input
                        type="text"
                        className="admin-filter-input"
                        placeholder={t.admin.searchPlaceholder}
                        value={borrowSearchText}
                        onChange={(e) => setBorrowSearchText(e.target.value)}
                      />
                      <div className="admin-filter-tabs">
                        <button type="button" className={`admin-filter-tab ${borrowDateFilter === 'all' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowDateFilter('all')}>{t.admin.filterAllDate}</button>
                        <button type="button" className={`admin-filter-tab ${borrowDateFilter === 'today' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowDateFilter('today')}>{t.admin.filterToday}</button>
                        <button type="button" className={`admin-filter-tab ${borrowDateFilter === 'week' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowDateFilter('week')}>{t.admin.filterWeek}</button>
                        <button type="button" className={`admin-filter-tab ${borrowDateFilter === 'month' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowDateFilter('month')}>{t.admin.filterMonth}</button>
                      </div>
                    </div>
                    <div className="admin-filter-row">
                      <div className="admin-filter-tabs">
                        <button type="button" className={`admin-filter-tab ${borrowStatusFilter === 'all' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowStatusFilter('all')}>{t.admin.filterAll} ({borrowRecords.length})</button>
                        <button type="button" className={`admin-filter-tab ${borrowStatusFilter === 'active' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowStatusFilter('active')}>{t.admin.filterActive} ({activeCount})</button>
                        <button type="button" className={`admin-filter-tab ${borrowStatusFilter === 'returned' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowStatusFilter('returned')}>{t.admin.filterReturned} ({returnedCount})</button>
                        <button type="button" className={`admin-filter-tab ${borrowStatusFilter === 'transferred' ? 'admin-filter-tab-active' : ''}`} onClick={() => setBorrowStatusFilter('transferred')}>{t.admin.filterTransferred} ({transferredCount})</button>
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
                          <th>{t.admin.columns.taken}</th>
                          <th>{t.admin.columns.returned}</th>
                          <th>{t.admin.columns.status}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBorrowRecords.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="admin-table-empty">
                              {t.admin.noBorrowRecords}
                            </td>
                          </tr>
                        ) : (
                          paginatedRecords.map((record) => (
                            <tr key={record.id} className={record.comment ? 'admin-row-transferred' : ''}>
                              <td className="admin-cell-id">{record.id}</td>
                              <td>
                                <span className="admin-cell-name">{record.employee_name || '-'}</span>
                                <span className="admin-cell-sub">{record.employee_email || record.employee_uid || '-'}</span>
                                {record.comment ? <span className="admin-cell-note">{t.admin.transferReasonPrefix}: {record.comment.replace(/^transferred:/, '')}</span> : null}
                              </td>
                              <td><code>{record.barcode || '-'}</code></td>
                              <td>{formatDateTimeGmtPlus5(record.taken_at, { language: 'ru' })}</td>
                              <td>{formatDateTimeGmtPlus5(record.returned_at, { language: 'ru' })}</td>
                              <td>
                                <span className={`status-badge ${record.comment ? 'status-admin' : record.status === 'active' ? 'status-active' : 'status-returned'}`}>
                                  {record.comment ? t.admin.statusTransferred : record.status === 'active' ? t.admin.statusActive : t.admin.statusReturned}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="admin-pagination">
                    <button type="button" className="ghost-button small" disabled={safePage === 0} onClick={() => setBorrowPage(safePage - 1)}>←</button>
                    <span className="admin-pagination-info">{t.admin.pageLabel}: {safePage + 1} / {totalPages} — {filteredBorrowRecords.length} {t.admin.records}</span>
                    <button type="button" className="ghost-button small" disabled={safePage >= totalPages - 1} onClick={() => setBorrowPage(safePage + 1)}>→</button>
                  </div>
                  </section>
                )}
              </>
            )}

            {activeTab === 'settings' && (
              <div className="admin-settings-grid">
                <section className="admin-panel admin-session-panel">
                  <div className="admin-panel-head">
                    <h2>{t.admin.panelTitle}</h2>
                  </div>
                  <div className="admin-session-actions">
                    <button type="button" className="ghost-button" onClick={() => loadAdminData()}>{t.common.refresh}</button>
                    {onClose ? (
                      <button type="button" className="danger-button" onClick={onClose}>{t.common.backHome}</button>
                    ) : (
                      <button type="button" className="danger-button" onClick={handleLogout}>{t.common.logout}</button>
                    )}
                  </div>
                </section>

                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>{t.admin.soundSettings}</h2>
                  </div>
                  <form className="admin-form" onSubmit={(e) => {
                    e.preventDefault();
                    updateSoundSettings({ enabled: localSoundEnabled, volume: localSoundVolume / 100 });
                    showToast('success', t.admin.soundSaved, '');
                  }}>
                    <label className="admin-checkbox" style={{ marginBottom: '16px' }}>
                      <input checked={localSoundEnabled} onChange={(e) => setLocalSoundEnabled(e.target.checked)} type="checkbox" />
                      <span>{t.admin.soundEnabled}</span>
                    </label>
                    <label className="admin-field">
                      <span>{t.admin.soundVolume}: {localSoundVolume}%</span>
                      <input type="range" min="0" max="100" value={localSoundVolume} onChange={(e) => setLocalSoundVolume(Number(e.target.value))} style={{ width: '100%', accentColor: '#ffbb30' }} />
                    </label>
                    <label className="admin-field">
                      <span>{t.admin.soundTestLabel}</span>
                      <select value={testSoundName} onChange={(e) => setTestSoundName(e.target.value)} style={{ width: '100%' }}>
                        <option value="access-granted">access-granted</option>
                        <option value="access-denied">access-denied</option>
                        <option value="select-action">select-action</option>
                        <option value="take-scan">take-scan</option>
                        <option value="return-scan">return-scan</option>
                        <option value="success-take">success-take</option>
                        <option value="success-return">success-return</option>
                        <option value="close-door">close-door</option>
                      </select>
                      <button type="button" className="ghost-button small" style={{ marginTop: '8px', width: '100%' }} onClick={() => { updateSoundSettings({ enabled: localSoundEnabled, volume: localSoundVolume / 100 }); play(testSoundName); }}>{t.admin.soundTestPlay}</button>
                    </label>
                    <div className="admin-actions" style={{ marginTop: '20px' }}>
                      <button type="submit" className="primary-button">{t.admin.soundSave}</button>
                    </div>
                  </form>
                </section>

                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>{t.admin.adManage}</h2>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button type="button" className="primary-button" onClick={handleRunAdSync}>{t.admin.runAdSync}</button>
                    {!lite && <button type="button" className="danger-button" onClick={handlePruneUsers}>{t.admin.pruneUsers}</button>}
                  </div>
                </section>

                <section className="admin-panel">
                  <div className="admin-panel-head">
                    <h2>{t.admin.notifTitle}</h2>
                  </div>
                  <div className="notif-card">
                    <div className="notif-card-info">
                      <IconBell className="notif-card-icon" size={22} />
                      <div>
                        <div className="notif-card-count">
                          {t.admin.notifRecipients}: <strong>{notifyCount}</strong> {t.admin.notifOfWithEmail} {emailUsers.length}
                        </div>
                        <div className="notif-card-sub">{t.admin.notifWithEmailSuffix}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => { setNotifySearchText(''); setShowNotifyModal(true); }}
                    >
                      {t.admin.notifConfigure}
                    </button>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'logs' && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-head admin-panel-head-with-filters">
                  <div className="admin-filter-tabs">
                    <button type="button" className={`admin-filter-tab ${logsSubTab === 'rfid' ? 'admin-filter-tab-active' : ''}`} onClick={() => setLogsSubTab('rfid')}>{t.admin.logsRfidTab}</button>
                    <button type="button" className={`admin-filter-tab ${logsSubTab === 'ad' ? 'admin-filter-tab-active' : ''}`} onClick={() => setLogsSubTab('ad')}>{t.admin.logsAdTab}</button>
                  </div>
                  <button
                    type="button"
                    className="ghost-button small"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => (logsSubTab === 'rfid' ? loadRfidLogs() : openAdSyncLog())}
                    disabled={rfidLogLoading}
                  >
                    {t.admin.rfidLogRefresh}
                  </button>
                </div>

                {logsSubTab === 'rfid' ? (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>{t.admin.rfidLogTime}</th>
                          <th>{t.admin.rfidLogUid}</th>
                          <th>{t.admin.rfidLogName}</th>
                          <th>{t.admin.rfidLogStatus}</th>
                          <th>{t.admin.rfidLogDoor}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rfidLogEvents.length === 0 ? (
                          <tr><td colSpan="5" className="admin-table-empty">{rfidLogLoading ? '...' : t.admin.rfidLogEmpty}</td></tr>
                        ) : (
                          rfidLogEvents.map((event, i) => (
                            <tr key={`${event.time}-${event.uid}-${i}`}>
                              <td>{event.time || '-'}</td>
                              <td><code>{event.uid || '-'}</code></td>
                              <td>{event.name || <span style={{ color: '#6a8a9e' }}>—</span>}</td>
                              <td>
                                <span className={`status-badge ${event.status === 'accepted' ? 'status-available' : 'status-unavailable'}`}>
                                  {event.status === 'accepted' ? t.admin.rfidLogAccepted : t.admin.rfidLogRejected}
                                </span>
                              </td>
                              <td>
                                <span className={`status-badge ${event.door ? 'status-active' : ''}`} style={event.door ? {} : { background: 'rgba(255,255,255,0.06)', color: '#6a8a9e' }}>
                                  {event.door ? t.admin.rfidLogDoorYes : t.admin.rfidLogDoorNo}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Suspense fallback={<div className="admin-loading">...</div>}>
                    <AdSyncLogPanel lines={adSyncLogLines} lastModified={adSyncLogLastModified} t={t} />
                  </Suspense>
                )}
              </section>
            )}
          </div>

          <nav className="admin-bottom-nav" aria-label={t.admin.panelTitle}>
            <button type="button" className={`admin-nav-item ${activeTab === 'users' ? 'admin-nav-item-active' : ''}`} onClick={() => setActiveTab('users')}>
              <IconUsers className="admin-nav-icon" />
              <span>{t.admin.tabs.users}</span>
            </button>
            <button type="button" className={`admin-nav-item ${activeTab === 'devices' ? 'admin-nav-item-active' : ''}`} onClick={() => setActiveTab('devices')}>
              <IconLaptop className="admin-nav-icon" />
              <span>{t.admin.tabs.devices}</span>
            </button>
            <button type="button" className={`admin-nav-item ${activeTab === 'analytics' ? 'admin-nav-item-active' : ''}`} onClick={() => setActiveTab('analytics')}>
              <IconAnalytics className="admin-nav-icon" />
              <span>{t.admin.tabs.analytics}</span>
            </button>
            <button type="button" className={`admin-nav-item ${activeTab === 'settings' ? 'admin-nav-item-active' : ''}`} onClick={() => {
              setLocalSoundEnabled(soundSettings.enabled);
              setLocalSoundVolume(Math.round(soundSettings.volume * 100));
              setActiveTab('settings');
            }}>
              <IconSettings className="admin-nav-icon" />
              <span>{t.admin.tabs.settings}</span>
            </button>
            <button type="button" className={`admin-nav-item ${activeTab === 'logs' ? 'admin-nav-item-active' : ''}`} onClick={() => setActiveTab('logs')}>
              <IconLogs className="admin-nav-icon" />
              <span>{t.admin.tabs.logs}</span>
            </button>
          </nav>

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

          <Modal isOpen={showTransferModal} onClose={closeTransferWizard} title={t.admin.transferWizardTitle} className="transfer-modal-content">
            <form className="transfer-wizard" onSubmit={handleTransferBookings}>
              <div className="transfer-steps" aria-label={t.admin.transferWizardTitle}>
                {[t.admin.transferStepDevices, t.admin.transferStepAdmin, t.admin.transferStepReason].map((label, index) => {
                  const stepNumber = index + 1;
                  return (
                    <div key={label} className={`transfer-step ${transferStep === stepNumber ? 'transfer-step-active' : ''} ${transferStep > stepNumber ? 'transfer-step-done' : ''}`}>
                      <span>{stepNumber}</span>
                      <small>{label}</small>
                    </div>
                  );
                })}
              </div>

              {transferStep === 1 && (
                <div className="transfer-stage">
                  <div className="notif-modal-head">
                    <div className="users-search">
                      <IconSearch className="users-search-icon" size={16} />
                      <input
                        type="text"
                        className="users-search-input"
                        placeholder={t.admin.transferDevicesSearch}
                        value={transferDeviceSearchText}
                        onChange={(event) => setTransferDeviceSearchText(event.target.value)}
                      />
                      {transferDeviceSearchText ? (
                        <button type="button" className="users-search-clear" onClick={() => setTransferDeviceSearchText('')} aria-label={t.common.cancel}>
                          <IconClear size={15} />
                        </button>
                      ) : null}
                    </div>
                    <span className="notif-selected-count">{t.admin.transferSelected}: {transferDeviceNames.length}</span>
                  </div>
                  <div className="notif-modal-list transfer-list">
                    {filteredTransferLaptops.length ? filteredTransferLaptops.map((laptop) => (
                      <label key={laptop.name} className={`transfer-row ${transferDeviceNames.includes(laptop.name) ? 'transfer-row-selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={transferDeviceNames.includes(laptop.name)}
                          onChange={() => toggleTransferDevice(laptop.name)}
                        />
                        <span className="transfer-row-main">
                          <strong>{laptop.device_number || laptop.name}</strong>
                          <small>{laptop.barcode || '—'}</small>
                        </span>
                        <span className="transfer-row-holder">{laptop.borrowerName || '—'}</span>
                      </label>
                    )) : <div className="admin-empty">{t.admin.transferNoActiveDevices}</div>}
                  </div>
                  <div className="transfer-actions">
                    <button type="button" className="ghost-button" onClick={closeTransferWizard}>{t.common.cancel}</button>
                    <button type="button" className="primary-button" disabled={!transferDeviceNames.length} onClick={() => setTransferStep(2)}>{t.admin.transferNext}</button>
                  </div>
                </div>
              )}

              {transferStep === 2 && (
                <div className="transfer-stage">
                  <div className="users-search">
                    <IconSearch className="users-search-icon" size={16} />
                    <input
                      type="text"
                      className="users-search-input"
                      placeholder={t.admin.searchAdminPlaceholder}
                      value={adminSearchText}
                      onChange={(event) => setAdminSearchText(event.target.value)}
                    />
                    {adminSearchText ? (
                      <button type="button" className="users-search-clear" onClick={() => setAdminSearchText('')} aria-label={t.common.cancel}>
                        <IconClear size={15} />
                      </button>
                    ) : null}
                  </div>
                  <div className="notif-modal-list transfer-list">
                    {filteredAdminUsers.length ? filteredAdminUsers.map((user) => (
                      <label key={user.guid} className={`transfer-row ${transferAdminGuid === user.guid ? 'transfer-row-selected' : ''}`}>
                        <input type="radio" name="transferAdmin" checked={transferAdminGuid === user.guid} onChange={() => setTransferAdminGuid(user.guid)} />
                        <span className="transfer-row-main">
                          <strong>{user.name || user.uid}</strong>
                          <small>{user.email || user.uid}</small>
                        </span>
                        <span className="users-role-dot users-role-dot-admin" aria-hidden="true" />
                      </label>
                    )) : <div className="admin-empty">{t.admin.noAdminUsers}</div>}
                  </div>
                  <div className="transfer-actions">
                    <button type="button" className="ghost-button" onClick={() => setTransferStep(1)}>{t.admin.transferBack}</button>
                    <button type="button" className="primary-button" disabled={!transferAdminGuid} onClick={() => setTransferStep(3)}>{t.admin.transferNext}</button>
                  </div>
                </div>
              )}

              {transferStep === 3 && (
                <div className="transfer-stage">
                  <div className="transfer-summary">
                    <span>{t.admin.transferSummaryPrefix}: <strong>{transferDeviceNames.length}</strong></span>
                    <span>{t.admin.transferToAdmin}: <strong>{selectedTransferAdmin?.name || selectedTransferAdmin?.uid || '—'}</strong></span>
                  </div>
                  <label className="admin-field">
                    <span>{t.admin.transferReasonLabel}</span>
                    <input
                      value={transferReason}
                      onChange={(event) => setTransferReason(event.target.value)}
                      type="text"
                      placeholder={t.admin.transferReasonPlaceholder}
                      required
                      autoFocus
                    />
                  </label>
                  <div className="transfer-actions">
                    <button type="button" className="ghost-button" disabled={transferSubmitting} onClick={() => setTransferStep(2)}>{t.admin.transferBack}</button>
                    <button type="submit" className="primary-button" disabled={transferSubmitting || !transferReason.trim()}>
                      {transferSubmitting ? '...' : t.admin.transferSubmit}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </Modal>

          <Modal isOpen={showNotifyModal} onClose={() => setShowNotifyModal(false)} title={t.admin.notifModalTitle}>
            <div className="notif-modal">
              <div className="notif-modal-head">
                <div className="users-search">
                  <IconSearch className="users-search-icon" size={16} />
                  <input
                    type="text"
                    className="users-search-input"
                    placeholder={t.admin.notifSearchPlaceholder}
                    value={notifySearchText}
                    onChange={(event) => setNotifySearchText(event.target.value)}
                  />
                  {notifySearchText ? (
                    <button type="button" className="users-search-clear" onClick={() => setNotifySearchText('')} aria-label={t.common.cancel}>
                      <IconClear size={15} />
                    </button>
                  ) : null}
                </div>
                <span className="notif-selected-count">{t.admin.notifSelected}: {notifyCount}</span>
              </div>

              <p className="notif-modal-hint">{t.admin.notifDisabledHint}</p>

              <div className="notif-modal-list">
                {(() => {
                  const query = notifySearchText.trim().toLowerCase();
                  const rows = emailUsers.filter((user) => {
                    if (!query) return true;
                    const fullName = user.name || `${user.first_name || ''} ${user.last_name || ''}`;
                    return fullName.toLowerCase().includes(query) || String(user.email || '').toLowerCase().includes(query);
                  });
                  if (!rows.length) {
                    return <div className="admin-empty">{t.admin.notifNobody}</div>;
                  }
                  return rows.map((user) => (
                    <label key={user.guid || user.uid} className="notif-row">
                      <span className="notif-row-info">
                        <strong>{user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '-'}</strong>
                        <small>{user.email}</small>
                      </span>
                      <input
                        type="checkbox"
                        className="notif-row-toggle"
                        checked={Boolean(user.notify_reminder)}
                        onChange={() => handleToggleUserNotify(user)}
                      />
                    </label>
                  ));
                })()}
              </div>
            </div>
          </Modal>

        </div>
      )}
    </div>
  );
}
