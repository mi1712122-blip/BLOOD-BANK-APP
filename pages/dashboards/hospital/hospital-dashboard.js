import {
  collection,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { authManager } from '../../../assets/js/auth.js';
import { bloodInventoryManager } from '../../../assets/js/inventory.js';
import { bloodRequestManager } from '../../../assets/js/requests.js';
import { db } from '../../../assets/js/firebase-config.js';

let currentHospital = null;
let currentView = 'dashboard';
let notificationsListener = null;
let inventoryListener = null;
let organizationsListener = null;

let allOrganizations = [];
let allInventoryItems = [];

const viewSelectors = {
  dashboard: 'dashboardView',
  'request-blood': 'request-bloodView',
  'blood-availability': 'blood-availabilityView',
  'request-history': 'request-historyView',
  notifications: 'notificationsView',
  settings: 'settingsView'
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const rareBloodGroups = ['AB-', 'O-', 'B-', 'A-'];

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadHospital();
  setupNavigation();
  setupAvailabilityControls();
  setupRealtimeListeners();
  showView('dashboard');
  await loadDashboardData();
});

async function checkAuthAndLoadHospital() {
  const user = await authManager.getCurrentUser();
  if (!user || user.role !== 'hospital') {
    window.location.href = '../../auth/login.html';
    return;
  }
  
  currentHospital = user.data;
  document.getElementById('hospitalName').textContent = currentHospital.hospitalName || 'Hospital';

  if (notificationsListener) notificationsListener();

  notificationsListener = bloodRequestManager.listenNotifications(currentHospital.uid, (result) => {
    if (!result.success) return;
    const notifications = result.data || [];
    const unreadCount = notifications.filter((item) => !item.isRead).length;
    updateHospitalNotificationBadges(unreadCount);
    if (currentView === 'notifications') {
      displayNotifications(notifications);
    }
  });
}

function setupRealtimeListeners() {
  // Listen for organizations
  organizationsListener = onSnapshot(collection(db, 'organizations'), (snapshot) => {
    allOrganizations = [];
    snapshot.forEach((docSnap) => {
      allOrganizations.push({ id: docSnap.id, ...docSnap.data() });
    });
    populateCityFilter();
    populateOrganizationSelector();
    renderBloodAvailability();
  });

  // Listen for blood inventory items
  inventoryListener = onSnapshot(collection(db, 'bloodInventory'), (snapshot) => {
    allInventoryItems = [];
    snapshot.forEach((docSnap) => {
      allInventoryItems.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderBloodAvailability();
  });
}

function populateCityFilter() {
  const select = document.getElementById('hospAvailCityFilter');
  if (!select) return;
  const cities = [...new Set(allOrganizations.map((o) => o.city).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All Cities</option>' +
    cities.map((city) => `<option value="${city}">${city}</option>`).join('');
}

function populateOrganizationSelector(selectedOrganizationId = '') {
  const select = document.getElementById('requestOrganization');
  if (!select) return;

  const organizations = allOrganizations.filter((org) => org.isApproved !== false);
  if (!organizations.length) {
    select.innerHTML = '<option value="">No organization available</option>';
    return;
  }

  const chosenValue = selectedOrganizationId || organizations[0]?.uid || organizations[0]?.id || '';
  select.innerHTML = '<option value="">Select organization</option>' +
    organizations.map((org) => `<option value="${org.uid || org.id}">${org.organizationName || org.hospitalName || 'Organization'}</option>`).join('');
  select.value = chosenValue;
}

async function loadDashboardData() {
  try {
    const requestsResult = await bloodRequestManager.getHospitalRequests(currentHospital.uid);
    if (requestsResult.success) {
      displayRecentRequests(requestsResult.data.slice(0, 5));
      displayRequestHistory(requestsResult.data);
      
      const active = requestsResult.data.filter(r => r.status !== 'Completed').length;
      const approved = requestsResult.data.filter(r => r.status === 'Approved' || r.status === 'Processing').length;
      const pending = requestsResult.data.filter(r => r.status === 'Pending').length;
      const rejected = requestsResult.data.filter(r => r.status === 'Rejected').length;
      
      document.getElementById('activeRequests').textContent = active;
      document.getElementById('approvedRequests').textContent = approved;
      document.getElementById('pendingRequests').textContent = pending;
      document.getElementById('rejectedRequests').textContent = rejected;
    }
    
    loadSettings();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

/* ==========================================================================
   BLOOD AVAILABILITY MODULE
   ========================================================================== */

function setupAvailabilityControls() {
  document.getElementById('hospAvailSearch')?.addEventListener('input', renderBloodAvailability);
  document.getElementById('hospAvailGroupFilter')?.addEventListener('change', renderBloodAvailability);
  document.getElementById('hospAvailCityFilter')?.addEventListener('change', renderBloodAvailability);
  document.getElementById('hospAvailSort')?.addEventListener('change', renderBloodAvailability);
  document.getElementById('hospAvailRefreshBtn')?.addEventListener('click', () => renderBloodAvailability());
  document.getElementById('viewPreviousRequestsBtn')?.addEventListener('click', () => showView('request-history'));
}

function getAvailabilityStatus(units) {
  if (units <= 0) return { text: 'Out of Stock', className: 'badge-stock-out' };
  if (units < 10) return { text: 'Low Stock', className: 'badge-stock-low' };
  return { text: 'Available', className: 'badge-stock-available' };
}

function renderBloodAvailability() {
  const orgMap = {};
  allOrganizations.forEach((org) => {
    orgMap[org.uid || org.id] = org;
  });

  const stockMap = {};
  allInventoryItems.forEach((item) => {
    if (item.status !== 'Available') return;

    const orgId = item.organizationId;
    const bloodGroup = item.bloodGroup;
    const key = `${orgId}_${bloodGroup}`;

    if (!stockMap[key]) {
      const org = orgMap[orgId] || { organizationName: 'Blood Bank Org', city: 'N/A' };
      stockMap[key] = {
        bloodGroup,
        organizationId: orgId,
        organizationName: org.organizationName || 'Organization',
        city: org.city || 'N/A',
        phone: org.phone || 'N/A',
        units: 0,
        lastUpdated: null
      };
    }

    stockMap[key].units += Number(item.units) || 0;
    const itemDate = item.updatedAt?.seconds ? new Date(item.updatedAt.seconds * 1000) : (item.updatedAt ? new Date(item.updatedAt) : null);
    if (itemDate && (!stockMap[key].lastUpdated || itemDate > stockMap[key].lastUpdated)) {
      stockMap[key].lastUpdated = itemDate;
    }
  });

  const records = Object.values(stockMap);
  const totalAvailableUnits = records.reduce((sum, item) => sum + item.units, 0);
  const rareGroupsAvailable = bloodGroups.filter((group) => {
    const totalForGroup = records.filter((item) => item.bloodGroup === group).reduce((sum, item) => sum + item.units, 0);
    return rareBloodGroups.includes(group) && totalForGroup > 0;
  }).length;
  const lowStockGroupsCount = bloodGroups.filter((group) => {
    const totalForGroup = records.filter((item) => item.bloodGroup === group).reduce((sum, item) => sum + item.units, 0);
    return totalForGroup > 0 && totalForGroup < 10;
  }).length;

  if (document.getElementById('availTotalUnits')) document.getElementById('availTotalUnits').textContent = totalAvailableUnits;
  if (document.getElementById('availRareGroups')) document.getElementById('availRareGroups').textContent = rareGroupsAvailable;
  if (document.getElementById('availLowStockGroups')) document.getElementById('availLowStockGroups').textContent = lowStockGroupsCount;

  const searchTerm = (document.getElementById('hospAvailSearch')?.value || '').trim().toLowerCase();
  const groupFilter = document.getElementById('hospAvailGroupFilter')?.value || '';
  const cityFilter = document.getElementById('hospAvailCityFilter')?.value || '';
  const sortOption = document.getElementById('hospAvailSort')?.value || 'desc';

  let filtered = records.filter((record) => {
    if (searchTerm) {
      const text = `${record.bloodGroup} ${record.organizationName} ${record.city}`.toLowerCase();
      if (!text.includes(searchTerm)) return false;
    }
    if (groupFilter && record.bloodGroup !== groupFilter) return false;
    if (cityFilter && record.city !== cityFilter) return false;
    return true;
  });

  filtered.sort((a, b) => (sortOption === 'asc' ? a.units - b.units : b.units - a.units));

  const container = document.getElementById('availabilityResults');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">No blood availability records match your search query.</p>';
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>Blood Group</th>
            <th>Available Units</th>
            <th>Last Updated</th>
            <th>Availability Status</th>
            <th>Organization</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((record) => {
            const status = getAvailabilityStatus(record.units);
            return `
              <tr>
                <td><strong>${record.bloodGroup}</strong></td>
                <td>${record.units} Units</td>
                <td>${record.lastUpdated ? record.lastUpdated.toLocaleDateString() : 'Recently'}</td>
                <td><span class="badge ${status.className}">${status.text}</span></td>
                <td>${record.organizationName} (${record.city})</td>
                <td>
                  <button type="button" class="btn btn-primary btn-sm btn-quick-request" data-group="${record.bloodGroup}" data-organization-id="${record.organizationId}">Request Blood</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.btn-quick-request').forEach((button) => {
    button.addEventListener('click', () => {
      const bloodGroup = button.dataset.group;
      const organizationId = button.dataset.organizationId || '';
      showView('request-blood');
      const requestSelect = document.getElementById('requestBloodGroup');
      const orgSelect = document.getElementById('requestOrganization');
      if (requestSelect && bloodGroup) requestSelect.value = bloodGroup;
      if (orgSelect && organizationId) orgSelect.value = organizationId;
    });
  });
}

/* ==========================================================================
   REQUESTS & NOTIFICATIONS DISPLAY
   ========================================================================== */

function displayRecentRequests(requests) {
  let html = '';
  if (requests.length === 0) {
    html = '<p class="text-center">No requests yet</p>';
  } else {
    requests.forEach((req) => {
      const statusClass = req.status.toLowerCase();
      html += `
        <div class="request-card ${statusClass}">
          <div class="request-header">
            <div class="request-title">${req.bloodGroup} - ${req.units} Units</div>
            <span class="request-status status-${statusClass}">${req.status}</span>
          </div>
          <div class="request-details">
            <div class="request-detail">
              <span class="request-detail-label">Date</span>
              <span class="request-detail-value">${req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div class="request-detail">
              <span class="request-detail-label">Urgency</span>
              <span class="request-detail-value">${req.urgencyLevel}</span>
            </div>
          </div>
        </div>
      `;
    });
  }
  document.getElementById('recentRequestsList').innerHTML = html;
}

function displayRequestHistory(requests) {
  let html = '';
  if (requests.length === 0) {
    html = '<div class="card"><p class="text-center">No requests</p></div>';
  } else {
    requests.forEach((req) => {
      const statusClass = req.status.toLowerCase();
      html += `
        <div class="request-card ${statusClass}">
          <div class="request-header">
            <div class="request-title">${req.bloodGroup} - ${req.units} Units</div>
            <span class="request-status status-${statusClass}">${req.status}</span>
          </div>
          <div class="request-details">
            <div class="request-detail">
              <span class="request-detail-label">Patient</span>
              <span class="request-detail-value">${req.patientName || 'N/A'}</span>
            </div>
            <div class="request-detail">
              <span class="request-detail-label">Date</span>
              <span class="request-detail-value">${req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div class="request-detail">
              <span class="request-detail-label">Urgency</span>
              <span class="request-detail-value">${req.urgencyLevel}</span>
            </div>
            <div class="request-detail">
              <span class="request-detail-label">Purpose</span>
              <span class="request-detail-value">${req.purpose || 'N/A'}</span>
            </div>
          </div>
        </div>
      `;
    });
  }
  document.getElementById('requestHistoryList').innerHTML = html;
}

async function loadNotifications() {
  try {
    const result = await bloodRequestManager.getNotifications(currentHospital.uid);
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

function displayNotifications(notifications) {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  if (!notifications || notifications.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No notifications available.</p></div>';
    return;
  }

  let html = '';
  notifications.forEach((notif) => {
    const date = notif.createdAt?.seconds ? new Date(notif.createdAt.seconds * 1000) : new Date(notif.createdAt || Date.now());
    const timeAgo = getTimeAgo(date);
    const formattedDateTime = date.toLocaleString();
    const senderLabel = notif.senderName ? `From: ${notif.senderName}` : 'From: System';
    html += `
      <div class="notification-item ${!notif.isRead ? 'unread' : ''}" data-notification-id="${notif.id}">
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
      await bloodRequestManager.deleteNotification(notificationId);
    });
  });
}

function updateHospitalNotificationBadges(unreadCount) {
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
    element.addEventListener('click', async (event) => {
      event.preventDefault();
      const view = element.dataset.view;
      if (!view) return;
      if (view === 'notifications') {
        await markHospitalNotificationsRead();
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

async function markHospitalNotificationsRead() {
  try {
    if (!currentHospital?.uid) return;
    updateHospitalNotificationBadges(0);
    await bloodRequestManager.markAllNotificationsRead(currentHospital.uid);
  } catch (error) {
    console.error('Error marking hospital notifications read:', error);
  }
}

function showView(view) {
  const viewId = viewSelectors[view];
  if (!viewId) return;

  document.querySelectorAll('.dashboard-view').forEach((section) => section.classList.add('hidden'));
  const target = document.getElementById(viewId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  currentView = view;
  if (view === 'notifications') markHospitalNotificationsRead();
  if (view === 'blood-availability') renderBloodAvailability();
}

document.getElementById('requestBloodForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const organizationId = document.getElementById('requestOrganization')?.value;
  const bloodGroup = document.getElementById('requestBloodGroup').value;
  const units = parseInt(document.getElementById('requestUnits').value, 10);
  const patientName = document.getElementById('requestPatientName').value;
  const patientAge = document.getElementById('requestPatientAge').value;
  const purpose = document.getElementById('requestPurpose').value;
  const urgencyLevel = document.getElementById('requestUrgency').value;

  if (!organizationId) {
    alert('Please select the organization you want to request blood from.');
    return;
  }

  const organization = allOrganizations.find((item) => (item.uid || item.id) === organizationId);

  try {
    const result = await bloodRequestManager.createBloodRequest({
      hospitalId: currentHospital.uid,
      hospitalName: currentHospital.hospitalName,
      organizationId,
      organizationName: organization?.organizationName || organization?.hospitalName || 'Organization',
      bloodGroup,
      units,
      patientName,
      patientAge,
      purpose,
      urgencyLevel
    });

    if (result.success) {
      alert('Blood request submitted successfully!');
      document.getElementById('requestBloodForm').reset();
      populateOrganizationSelector();
      showView('dashboard');
      await loadDashboardData();
    }
  } catch (error) {
    console.error('Error submitting request:', error);
    alert('Failed to submit request');
  }
});

function loadSettings() {
  document.getElementById('settingsHospitalName').value = currentHospital.hospitalName || '';
  document.getElementById('settingsPhone').value = currentHospital.phone || '';
  document.getElementById('settingsAddress').value = currentHospital.address || '';
  document.getElementById('settingsCity').value = currentHospital.city || '';
}

document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const updateData = {
    hospitalName: document.getElementById('settingsHospitalName').value,
    phone: document.getElementById('settingsPhone').value,
    address: document.getElementById('settingsAddress').value,
    city: document.getElementById('settingsCity').value
  };
  
  try {
    const result = await authManager.updateProfile(currentHospital.uid, updateData);
    if (result.success) {
      alert('Settings updated successfully!');
      location.reload();
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    alert('Failed to update settings');
  }
});

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  
  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}
