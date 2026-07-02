import { authManager } from '../../../assets/js/auth.js';
import { bloodRequestManager } from '../../../assets/js/requests.js';

// Donor Dashboard Script
let currentDonor = null;
let currentView = 'dashboard';
let notificationsListener = null;

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

  if (notificationsListener) {
    notificationsListener();
  }

  notificationsListener = bloodRequestManager.listenNotifications(currentDonor.uid, (result) => {
    if (!result.success) return;
    const notifications = result.data || [];
    const unreadCount = notifications.filter((item) => !item.isRead).length;
    document.getElementById('notificationBadge').textContent = unreadCount;
    document.getElementById('notificationBadge2').textContent = unreadCount;
    if (currentView === 'notifications') {
      displayNotifications(notifications);
    }
  });
}

async function loadDashboardData() {
  try {
    document.getElementById('totalDonations').textContent = currentDonor.totalDonations || 0;
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

  if (!requests || requests.length === 0) {
    container.innerHTML = '<p class="text-center">No recent requests</p>';
    return;
  }

  let html = '<table><thead><tr><th>Hospital</th><th>Blood Group</th><th>Units</th><th>Status</th></tr></thead><tbody>';
  requests.forEach((req) => {
    html += `
      <tr>
        <td>${req.hospitalName || 'N/A'}</td>
        <td>${req.bloodGroup || 'N/A'}</td>
        <td>${req.units || 0}</td>
        <td><span class="badge badge-${(req.status || '').toLowerCase()}">${req.status || 'Unknown'}</span></td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function displayAllBloodRequests(requests) {
  const container = document.getElementById('bloodRequestsList');
  if (!container) return;

  if (!requests || requests.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-inbox"></i></div>
          <div class="empty-state-title">No Blood Requests</div>
          <p class="empty-state-message">No hospitals have requested blood from you yet.</p>
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  requests.forEach((req) => {
    const statusClass = (req.status || 'pending').toLowerCase();
    html += `
      <div class="request-card ${statusClass}">
        <div class="request-header">
          <div class="request-title">${req.hospitalName || 'Hospital'}</div>
          <span class="request-status status-${statusClass}">${req.status || 'Unknown'}</span>
        </div>
        <div class="request-details">
          <div class="request-detail">
            <span class="request-detail-label">Blood Group</span>
            <span class="request-detail-value">${req.bloodGroup || 'N/A'}</span>
          </div>
          <div class="request-detail">
            <span class="request-detail-label">Units Needed</span>
            <span class="request-detail-value">${req.units || 0}</span>
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
        ${req.status === 'Pending' ? `
          <div class="request-actions">
            <button type="button" class="btn btn-primary" data-action="accept-request" data-request-id="${req.id}">
              <i class="fas fa-check"></i> Accept
            </button>
            <button type="button" class="btn btn-secondary" data-action="reject-request" data-request-id="${req.id}">
              <i class="fas fa-times"></i> Reject
            </button>
          </div>
        ` : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}

async function acceptRequest(requestId) {
  if (!confirm('Are you sure you want to accept this request?')) return;

  try {
    const result = await bloodRequestManager.approveRequest(requestId, currentDonor.uid);
    if (result.success) {
      alert('Request accepted successfully!');
      await loadBloodRequests();
    } else {
      alert('Failed to accept request');
    }
  } catch (error) {
    console.error('Error accepting request:', error);
    alert('An error occurred');
  }
}

async function rejectRequest(requestId) {
  const reason = prompt('Please provide a reason for rejection:');
  if (!reason) return;

  try {
    const result = await bloodRequestManager.rejectRequest(requestId, reason);
    if (result.success) {
      alert('Request rejected');
      await loadBloodRequests();
    } else {
      alert('Failed to reject request');
    }
  } catch (error) {
    console.error('Error rejecting request:', error);
    alert('An error occurred');
  }
}

async function loadNotifications() {
  try {
    const result = await bloodRequestManager.getNotifications(currentDonor.uid);
    if (!result.success) return;

    const notifications = result.data || [];
    const unreadCount = notifications.filter((item) => !item.isRead).length;
    document.getElementById('notificationBadge').textContent = unreadCount;
    document.getElementById('notificationBadge2').textContent = unreadCount;
    displayNotifications(notifications);
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

function displayNotifications(notifications) {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  if (!notifications || notifications.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-bell"></i></div>
        <div class="empty-state-title">No Notifications</div>
        <p class="empty-state-message">You're all caught up!</p>
      </div>
    `;
    return;
  }

  let html = '';
  notifications.forEach((notif) => {
    const createdAt = notif.createdAt ? new Date(notif.createdAt.seconds * 1000) : new Date();
    const timeAgo = getTimeAgo(createdAt);
    const formattedDateTime = createdAt.toLocaleString();
    const senderLabel = notif.senderName ? `From: ${notif.senderName}` : 'From: System';
    html += `
      <div class="notification-item ${notif.isRead ? '' : 'unread'}">
        <div class="notification-icon">
          <i class="fas fa-bell"></i>
        </div>
        <div class="notification-content">
          <div class="notification-title">${notif.title || 'Notification'}</div>
          <div class="notification-sender">${senderLabel}</div>
          <div class="notification-message">${notif.message || ''}</div>
          <div class="notification-time">${timeAgo} · ${formattedDateTime}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      const view = element.dataset.view;
      if (view) showView(view);
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

  if (view === 'notifications') {
    loadNotifications();
  }
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
    if (action === 'accept-request') {
      await acceptRequest(requestId);
    } else if (action === 'reject-request') {
      await rejectRequest(requestId);
    }
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
    alert('Password change functionality coming soon!');
  });
}

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  const result = await authManager.logout();
  if (result.success) window.location.href = '../../auth/login.html';
}

