import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { authManager } from '../../../assets/js/auth.js';
import { bloodRequestManager } from '../../../assets/js/requests.js';
import { db } from '../../../assets/js/firebase-config.js';

let currentDonor = null;
let currentView = 'dashboard';
let notificationsListener = null;
let donationsListener = null;
let donorDonations = [];
let donationTablePage = 1;
const donationPageSize = 8;

const viewSelectors = {
  dashboard: 'dashboardView',
  profile: 'profileView',
  'donation-history': 'donationHistoryView',
  'blood-requests': 'bloodRequestsView',
  notifications: 'notificationsView',
  settings: 'settingsView'
};

document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
  await checkAuthAndLoadDonor();
  setupNavigation();
  setupRequestActions();
  setupForms();
  setupDonationHistoryControls();
  setupRealtimeListeners();
  showView('dashboard');
  await loadDashboardData();
}

async function checkAuthAndLoadDonor() {
  const user = await authManager.getCurrentUser();
  if (!user || user.role !== 'donor') {
    window.location.href = '../../auth/login.html';
    return;
  }

  currentDonor = user.data;
  document.getElementById('donorName').textContent = currentDonor.fullName || 'Donor';
  document.getElementById('welcomeName').textContent = currentDonor.fullName || 'Donor';

  if (notificationsListener) notificationsListener();

  notificationsListener = bloodRequestManager.listenNotifications(currentDonor.uid, (result) => {
    if (!result.success) return;
    const notifications = result.data || [];
    const unreadCount = notifications.filter((item) => !item.isRead).length;
    updateDonorNotificationBadges(unreadCount);
    if (currentView === 'notifications') {
      displayNotifications(notifications);
    }
  });
}

function setupRealtimeListeners() {
  if (!currentDonor) return;

  donationsListener = onSnapshot(collection(db, 'donations'), (snapshot) => {
    donorDonations = [];
    snapshot.forEach((docSnap) => {
      const record = normalizeDonationRecord({ id: docSnap.id, ...docSnap.data() });
      if (record && matchesCurrentDonor(record)) {
        donorDonations.push(record);
      }
    });
    donorDonations.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
    renderDonationHistory();
  });
}

function matchesCurrentDonor(donation) {
  if (!currentDonor) return false;
  const donorIdValues = [
    donation.donorId,
    donation.donorUid,
    donation.donor_id,
    donation.userId,
    donation.uid,
    donation.user?.uid,
    currentDonor.uid
  ].filter(Boolean);

  const donorNameValues = [
    donation.donorName,
    donation.fullName,
    donation.userName,
    currentDonor.fullName,
    currentDonor.email
  ].filter(Boolean);

  return donorIdValues.includes(currentDonor.uid)
    || donorNameValues.some((value) => value && value.toString().toLowerCase() === (currentDonor.fullName || '').toLowerCase())
    || donorNameValues.some((value) => value && value.toString().toLowerCase() === (currentDonor.email || '').toLowerCase());
}

function normalizeDonationRecord(record) {
  if (!record) return null;

  const createdAt = record.createdAt || record.date || record.donationDate || record.donationTime || record.timestamp || new Date();
  const dateValue = parseDonationDate(createdAt);
  const timeValue = record.donationTime || record.time || record.timeOfDonation || (dateValue ? dateValue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  return {
    ...record,
    id: record.id || '',
    bloodGroup: record.bloodGroup || record.blood_group || currentDonor?.bloodGroup || '-',
    units: Number(record.units ?? record.quantity ?? record.amount ?? 1) || 1,
    organizationName: record.organizationName || record.organization || record.location || 'Blood Center',
    hospitalName: record.hospitalName || record.hospital || '-',
    donationLocation: record.donationLocation || record.location || record.organizationName || 'Blood Center',
    status: record.status || record.donationStatus || 'Completed',
    createdAt,
    donationDate: dateValue,
    donationTime: timeValue
  };
}

function parseDonationDate(value) {
  if (!value) return new Date();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  if (value.seconds) return new Date(value.seconds * 1000);
  if (value.toDate) return value.toDate();
  return new Date(value);
}

async function loadDashboardData() {
  try {
    document.getElementById('totalDonations').textContent = donorDonations.length || currentDonor.totalDonations || 0;
    document.getElementById('bloodGroupDisplay').textContent = currentDonor.bloodGroup || '-';
    document.getElementById('eligibilityStatus').textContent = currentDonor.isEligible ? 'Eligible' : 'Not Eligible';

    document.getElementById('profileFullName').value = currentDonor.fullName || '';
    document.getElementById('profileEmail').value = currentDonor.email || '';
    document.getElementById('profilePhone').value = currentDonor.phone || '';
    document.getElementById('profileBloodGroup').value = currentDonor.bloodGroup || '';
    document.getElementById('profileAge').value = currentDonor.age || '';
    document.getElementById('profileGender').value = currentDonor.gender || '';
    document.getElementById('profileCity').value = currentDonor.city || '';
    document.getElementById('profileAddress').value = currentDonor.address || '';

    await loadBloodRequests();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

/* ==========================================================================
   DONOR DONATION HISTORY MODULE
   ========================================================================== */

function setupDonationHistoryControls() {
  document.getElementById('donorHistorySearch')?.addEventListener('input', renderDonationHistory);
  document.getElementById('donorHistoryGroupFilter')?.addEventListener('change', renderDonationHistory);
  document.getElementById('donorHistoryDateFilter')?.addEventListener('change', renderDonationHistory);
  document.getElementById('donorHistorySort')?.addEventListener('change', renderDonationHistory);
}

function renderDonationHistory() {
  const now = new Date();
  const sorted = [...donorDonations].sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));

  const totalCount = sorted.length;
  const totalVolumeUnits = sorted.reduce((sum, d) => sum + Number(d.units || 1), 0);

  let lastDonationDateStr = '-';
  let nextEligibleDateStr = 'Eligible Now';

  if (sorted.length > 0) {
    const lastDate = parseDonationDate(sorted[0].createdAt || sorted[0].donationDate || new Date());
    if (!Number.isNaN(lastDate.getTime())) {
      lastDonationDateStr = lastDate.toLocaleDateString();
      const nextEligible = new Date(lastDate.getTime() + (56 * 24 * 60 * 60 * 1000));
      nextEligibleDateStr = nextEligible > now ? nextEligible.toLocaleDateString() : 'Eligible Now';
    }
  }

  if (document.getElementById('donorTotalDonations')) document.getElementById('donorTotalDonations').textContent = totalCount;
  if (document.getElementById('donorTotalVolume')) document.getElementById('donorTotalVolume').textContent = `${totalVolumeUnits} Units`;
  if (document.getElementById('donorLastDonationDate')) document.getElementById('donorLastDonationDate').textContent = lastDonationDateStr;
  if (document.getElementById('donorNextEligibleDate')) document.getElementById('donorNextEligibleDate').textContent = nextEligibleDateStr;
  if (document.getElementById('totalDonations')) document.getElementById('totalDonations').textContent = totalCount;

  const searchTerm = (document.getElementById('donorHistorySearch')?.value || '').trim().toLowerCase();
  const groupFilter = document.getElementById('donorHistoryGroupFilter')?.value || '';
  const dateFilter = document.getElementById('donorHistoryDateFilter')?.value || 'all';
  const sortOption = document.getElementById('donorHistorySort')?.value || 'desc';

  let filtered = sorted.filter((d) => {
    if (searchTerm) {
      const text = `${d.id || ''} ${d.organizationName || ''} ${d.hospitalName || ''} ${d.bloodGroup || ''} ${d.donationLocation || ''}`.toLowerCase();
      if (!text.includes(searchTerm)) return false;
    }
    if (groupFilter && d.bloodGroup !== groupFilter) return false;

    if (dateFilter !== 'all') {
      const date = parseDonationDate(d.createdAt || d.donationDate || new Date());
      const diffDays = (now - date) / (1000 * 60 * 60 * 24);
      if (dateFilter === 'year' && diffDays > 365) return false;
      if (dateFilter === '6months' && diffDays > 180) return false;
      if (dateFilter === '30days' && diffDays > 30) return false;
    }
    return true;
  });

  filtered = filtered.sort((a, b) => {
    const aTime = getTimestamp(a.createdAt || a.donationDate || new Date());
    const bTime = getTimestamp(b.createdAt || b.donationDate || new Date());
    return sortOption === 'asc' ? aTime - bTime : bTime - aTime;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / donationPageSize));
  donationTablePage = Math.min(donationTablePage, totalPages);
  const startIndex = (donationTablePage - 1) * donationPageSize;
  const paginated = filtered.slice(startIndex, startIndex + donationPageSize);

  const tableContainer = document.getElementById('donationHistoryTable');
  if (tableContainer) {
    if (!filtered.length) {
      tableContainer.innerHTML = '<p class="empty-state">No donation history records found.</p>';
    } else {
      tableContainer.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>Donation ID</th>
              <th>Blood Group</th>
              <th>Quantity</th>
              <th>Organization</th>
              <th>Hospital</th>
              <th>Donation Date</th>
              <th>Donation Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${paginated.map((d) => {
              const dateObj = parseDonationDate(d.createdAt || d.donationDate || new Date());
              const dateStr = dateObj.toLocaleDateString();
              const timeStr = d.donationTime || dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const status = d.status || 'Completed';
              const badgeClass = status === 'Pending' ? 'badge-pending' : status === 'Cancelled' ? 'badge-rejected' : 'badge-completed';

              return `
                <tr>
                  <td><code>${(d.id || 'DON').substring(0, 8)}</code></td>
                  <td><strong>${d.bloodGroup || currentDonor.bloodGroup || '-'}</strong></td>
                  <td>${d.units || 1} Unit(s)</td>
                  <td>${d.organizationName || d.donationLocation || 'Blood Center'}</td>
                  <td>${d.hospitalName || '-'}</td>
                  <td>${dateStr}</td>
                  <td>${timeStr}</td>
                  <td><span class="badge ${badgeClass}">${status}</span></td>
                  <td>
                    <button type="button" class="btn btn-sm btn-danger btn-delete-donation" data-id="${d.id}">
                      <i class="fas fa-trash"></i> Delete
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div class="table-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <span>Page ${donationTablePage} of ${totalPages}</span>
          <div>
            <button type="button" class="btn btn-secondary btn-sm" data-donation-page="prev" ${donationTablePage <= 1 ? 'disabled' : ''}>Previous</button>
            <button type="button" class="btn btn-secondary btn-sm" data-donation-page="next" ${donationTablePage >= totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      `;

      tableContainer.querySelectorAll('.btn-delete-donation').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const donationId = btn.dataset.id;
          if (donationId) await deleteDonation(donationId);
        });
      });

      tableContainer.querySelectorAll('[data-donation-page]').forEach((button) => {
        button.addEventListener('click', () => {
          const direction = button.dataset.donationPage;
          if (direction === 'prev') donationTablePage = Math.max(1, donationTablePage - 1);
          if (direction === 'next') donationTablePage = Math.min(totalPages, donationTablePage + 1);
          renderDonationHistory();
        });
      });
    }
  }

  renderDonationTimeline(filtered);
}

function renderDonationTimeline(items) {
  const container = document.getElementById('donorDonationTimeline');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<p class="empty-state">No donation history events to show in timeline.</p>';
    return;
  }

  container.innerHTML = items.map((d) => {
    const dateObj = d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000) : new Date(d.createdAt || Date.now());
    return `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>Donated Blood Group ${d.bloodGroup || currentDonor.bloodGroup || '-'} (${d.units || d.quantity || 1} Unit)</strong>
            <span class="badge badge-completed">${d.status || 'Completed'}</span>
          </div>
          <p style="margin: 6px 0 0 0; color: #555;">Location: ${d.organizationName || d.location || 'Blood Center'}</p>
          <div class="timeline-time">${dateObj.toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteDonation(donationId) {
  if (!confirm('Are you sure you want to delete this donation record? This will immediately remove it from your history.')) return;
  try {
    await deleteDoc(doc(db, 'donations', donationId));
    donorDonations = donorDonations.filter((item) => item.id !== donationId);
    donationTablePage = 1;
    renderDonationHistory();
    alert('Donation record deleted successfully.');
  } catch (error) {
    console.error('Error deleting donation record:', error);
    alert('Failed to delete donation record: ' + error.message);
  }
}

/* ==========================================================================
   REQUESTS & NOTIFICATIONS DISPLAY
   ========================================================================== */

async function loadBloodRequests() {
  try {
    const result = await bloodRequestManager.getHospitalRequests(currentDonor.uid);
    if (!result.success) {
      document.getElementById('recentRequestsTable').innerHTML = '<p class="text-center">Unable to load requests</p>';
      document.getElementById('bloodRequestsList').innerHTML = '<p class="text-center">Unable to load requests</p>';
      return;
    }

    const requests = result.data || [];
    const recentRequests = requests.slice(0, 3);
    displayRecentRequests(recentRequests);
    displayAllBloodRequests(requests);

    const pendingCount = requests.filter((r) => r.status === 'Pending').length;
    document.getElementById('pendingRequests').textContent = pendingCount;
  } catch (error) {
    console.error('Error loading blood requests:', error);
  }
}

function displayRecentRequests(requests) {
  const container = document.getElementById('recentRequestsTable');
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = '<p class="text-center">No recent requests</p>';
    return;
  }

  let html = '<table><thead><tr><th>Blood Group</th><th>Hospital</th><th>Urgency</th><th>Status</th></tr></thead><tbody>';
  requests.forEach((req) => {
    html += `
      <tr>
        <td><strong>${req.bloodGroup}</strong></td>
        <td>${req.hospitalName || 'Hospital'}</td>
        <td>${req.urgencyLevel || 'Normal'}</td>
        <td><span class="badge badge-warning">${req.status}</span></td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function displayAllBloodRequests(requests) {
  const container = document.getElementById('bloodRequestsList');
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = '<div class="card"><p class="text-center">No blood requests available</p></div>';
    return;
  }

  let html = '';
  requests.forEach((req) => {
    const statusClass = (req.status || 'pending').toLowerCase();
    html += `
      <div class="request-card ${statusClass}">
        <div class="request-header">
          <div class="request-title">${req.bloodGroup} - ${req.units} Units Needed</div>
          <span class="request-status status-${statusClass}">${req.status}</span>
        </div>
        <div class="request-details">
          <div class="request-detail">
            <span class="request-detail-label">Hospital</span>
            <span class="request-detail-value">${req.hospitalName || 'N/A'}</span>
          </div>
          <div class="request-detail">
            <span class="request-detail-label">Urgency</span>
            <span class="request-detail-value">${req.urgencyLevel || 'Normal'}</span>
          </div>
          <div class="request-detail">
            <span class="request-detail-label">Purpose</span>
            <span class="request-detail-value">${req.purpose || 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

async function loadNotifications() {
  try {
    const result = await bloodRequestManager.getNotifications(currentDonor.uid);
    if (result.success) {
      const unreadCount = result.data.filter((n) => !n.isRead).length;
      document.getElementById('notificationBadge').textContent = unreadCount;
      document.getElementById('notificationBadge2').textContent = unreadCount;
      displayNotifications(result.data);
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

async function markDonorNotificationsRead() {
  try {
    if (!currentDonor?.uid) return;
    updateDonorNotificationBadges(0);
    await bloodRequestManager.markAllNotificationsRead(currentDonor.uid);
  } catch (error) {
    console.error('Error marking donor notifications read:', error);
  }
}

function updateDonorNotificationBadges(unreadCount) {
  const badge1 = document.getElementById('notificationBadge');
  const badge2 = document.getElementById('notificationBadge2');
  [badge1, badge2].forEach((b) => {
    if (!b) return;
    b.textContent = unreadCount;
    if (unreadCount > 0) {
      b.classList.remove('hidden');
      b.style.display = 'flex';
    } else {
      b.classList.add('hidden');
      b.style.display = 'none';
    }
  });
}

function displayNotifications(notifications) {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  if (!notifications || notifications.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No notifications available.</p></div>';
    return;
  }

  let html = '';
  notifications.forEach((notif) => {
    const createdAt = notif.createdAt?.seconds ? new Date(notif.createdAt.seconds * 1000) : notif.createdAt ? new Date(notif.createdAt) : new Date();
    const timeAgo = getTimeAgo(createdAt);
    const formattedDateTime = createdAt.toLocaleString();
    const senderLabel = notif.senderName ? `From: ${notif.senderName}` : 'From: System';
    html += `
      <div class="notification-item ${notif.isRead ? '' : 'unread'}" data-notification-id="${notif.id}">
        <div class="notification-icon">
          <i class="fas fa-bell"></i>
        </div>
        <div class="notification-content">
          <div class="notification-title">${notif.title || 'Notification'}</div>
          <div class="notification-sender">${senderLabel}</div>
          <div class="notification-message">${notif.message || ''}</div>
          <div class="notification-time">${timeAgo} · ${formattedDateTime}</div>
        </div>
        <button type="button" class="btn btn-danger btn-sm delete-notification-btn" data-notification-id="${notif.id}" aria-label="Delete notification" title="Delete notification">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
  });
  container.innerHTML = html;

  container.querySelectorAll('.delete-notification-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const notificationId = button.dataset.notificationId;
      if (!notificationId) return;
      await deleteNotification(notificationId);
    });
  });
}

async function deleteNotification(notificationId) {
  try {
    await bloodRequestManager.deleteNotification(notificationId);
  } catch (error) {
    console.error('Error deleting notification:', error);
  }
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function getTimestamp(value) {
  if (!value) return 0;
  if (value.seconds) return value.seconds * 1000;
  if (value.toMillis) return value.toMillis();
  return new Date(value).getTime();
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach((element) => {
    element.addEventListener('click', async (event) => {
      event.preventDefault();
      const view = element.dataset.view;
      if (!view) return;
      if (view === 'notifications') {
        await markDonorNotificationsRead();
      }
      showView(view);
    });
  });

  document.querySelectorAll('[data-action="logout"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      logout();
    });
  });
}

function showView(view) {
  const viewId = viewSelectors[view];
  if (!viewId) return;

  document.querySelectorAll('.dashboard-view').forEach((section) => {
    section.classList.add('hidden');
  });

  const target = document.getElementById(viewId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  currentView = view;
  if (view === 'notifications') loadNotifications();
  if (view === 'donation-history') renderDonationHistory();
}

function setupRequestActions() {
  const container = document.getElementById('bloodRequestsList');
  if (!container) return;

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const requestId = button.dataset.requestId;
    if (!requestId) return;

    event.preventDefault();
  });
}

function setupForms() {
  document.getElementById('profileForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const updateData = {
      phone: document.getElementById('profilePhone').value,
      age: parseInt(document.getElementById('profileAge').value, 10) || null,
      city: document.getElementById('profileCity').value,
      address: document.getElementById('profileAddress').value
    };

    try {
      const result = await authManager.updateProfile(currentDonor.uid, updateData);
      if (result.success) {
        alert('Profile updated successfully!');
        await checkAuthAndLoadDonor();
        await loadDashboardData();
        showView('profile');
      } else {
        alert('Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('An error occurred');
    }
  });

  document.getElementById('settingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    alert('Password change saved successfully!');
  });
}

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  const result = await authManager.logout();
  if (result.success) window.location.href = '../../auth/login.html';
}
