import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { authManager } from '../../../assets/js/auth.js';
import { bloodInventoryManager } from '../../../assets/js/inventory.js';
import { bloodRequestManager } from '../../../assets/js/requests.js';
import { db } from '../../../assets/js/firebase-config.js';

let currentOrganization = null;
let currentView = 'dashboard';
let notificationsListener = null;
let inventoryListener = null;
let donorsListener = null;
let hospitalsListener = null;
let requestsListener = null;
let donationsListener = null;
let issuesListener = null;
let inventoryHistoryListener = null;
let allNotifications = [];
let donorsList = [];
let hospitalsList = [];
let requestsList = [];
let donationsList = [];
let issuesList = [];
let inventoryHistoryList = [];
let inventoryItems = [];
let currentInventorySummary = {};

const viewSelectors = {
  dashboard: 'dashboardView',
  inventory: 'inventoryView',
  donations: 'donationsView',
  requests: 'requestsView',
  issueHistory: 'issueHistoryView',
  donationHistory: 'donationHistoryView',
  inventoryHistory: 'inventoryHistoryView',
  donors: 'donorsView',
  hospitals: 'hospitalsView',
  sendNotification: 'sendNotificationView',
  notifications: 'notificationsView',
  settings: 'settingsView'
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const chartInstances = {};

async function initDashboard() {
  const isAuthLoaded = await checkAuthAndLoadOrganization();
  if (!isAuthLoaded) return;

  loadSettings();
  populateRecipientSelector('specificDonor');
  setupNavigation();
  setupNotificationSendHandlers();
  setupSearchAndFilters();
  setupGlobalActions();
  setupQuickActions();
  setupExportActions();
  setupDashboardReportActions();
  setupGlobalSearch();
  setupRealtimeDataListeners();
  showView('dashboard');
  await refreshAllData();
}

document.addEventListener('DOMContentLoaded', initDashboard);

async function checkAuthAndLoadOrganization() {
  const user = await authManager.getCurrentUser();
  if (!user || user.role !== 'organization') {
    window.location.href = '../../auth/login.html';
    return false;
  }

  currentOrganization = user.data;
  document.getElementById('orgName').textContent = currentOrganization.organizationName || 'Organization';

  if (notificationsListener) notificationsListener();
  notificationsListener = bloodRequestManager.listenNotifications(currentOrganization.uid, (result) => {
    if (!result.success) return;
    const notifications = result.data || [];
    allNotifications = notifications.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
    const unreadCount = notifications.filter((item) => !item.isRead).length;
    document.getElementById('notificationBadge').textContent = unreadCount;
    document.getElementById('notificationBadge2').textContent = unreadCount;
    document.getElementById('totalNotifications').textContent = notifications.length;
    renderRecentNotificationsPreview();
    renderRecentActivityPreview();
    if (currentView === 'notifications') displayNotifications(notifications);
  });

  return true;
}

async function refreshAllData() {
  await Promise.all([
    loadDonors(),
    loadHospitals(),
    loadInventorySummary(),
    loadRequests(),
    loadDonations(),
    loadIssueHistory(),
    loadInventoryHistory(),
    loadNotifications()
  ]);
  renderDashboardCards();
}

function setupRealtimeDataListeners() {
  if (!currentOrganization) return;

  if (donorsListener) donorsListener();
  donorsListener = onSnapshot(collection(db, 'donors'), (snapshot) => {
    donorsList = [];
    snapshot.forEach((docSnap) => donorsList.push({ id: docSnap.id, ...docSnap.data() }));
    document.getElementById('totalDonors').textContent = donorsList.length;
    populateDonorOptions();
    renderDashboardCards();
    renderCurrentView();
  });

  if (hospitalsListener) hospitalsListener();
  hospitalsListener = onSnapshot(collection(db, 'hospitals'), (snapshot) => {
    hospitalsList = [];
    snapshot.forEach((docSnap) => hospitalsList.push({ id: docSnap.id, ...docSnap.data() }));
    document.getElementById('connectedHospitals').textContent = hospitalsList.length;
    renderDashboardCards();
    renderCurrentView();
  });

  if (requestsListener) requestsListener();
  requestsListener = onSnapshot(
    query(collection(db, 'bloodRequests'), where('organizationId', '==', currentOrganization.uid)),
    (snapshot) => {
      requestsList = [];
      snapshot.forEach((docSnap) => requestsList.push({ id: docSnap.id, ...docSnap.data() }));
      document.getElementById('pendingHospitalRequests').textContent = requestsList.filter((req) => req.status === 'Pending').length;
      document.getElementById('completedRequests').textContent = requestsList.filter((req) => req.status === 'Completed').length;
      renderDashboardCards();
      renderCurrentView();
    }
  );

  if (donationsListener) donationsListener();
  donationsListener = onSnapshot(
    query(collection(db, 'donations'), where('organizationId', '==', currentOrganization.uid)),
    (snapshot) => {
      donationsList = [];
      snapshot.forEach((docSnap) => donationsList.push({ id: docSnap.id, ...docSnap.data() }));
      document.getElementById('todaysDonations').textContent = donationsList.filter((donation) => isSameDay(donation.createdAt, new Date())).length;
      renderDashboardCards();
      renderCurrentView();
    }
  );

  if (issuesListener) issuesListener();
  issuesListener = onSnapshot(
    query(collection(db, 'bloodIssues'), where('organizationId', '==', currentOrganization.uid)),
    (snapshot) => {
      issuesList = [];
      snapshot.forEach((docSnap) => issuesList.push({ id: docSnap.id, ...docSnap.data() }));
      renderDashboardCards();
      renderCurrentView();
    }
  );

  if (inventoryHistoryListener) inventoryHistoryListener();
  inventoryHistoryListener = onSnapshot(
    query(collection(db, 'inventoryHistory'), where('organizationId', '==', currentOrganization.uid)),
    (snapshot) => {
      inventoryHistoryList = [];
      snapshot.forEach((docSnap) => inventoryHistoryList.push({ id: docSnap.id, ...docSnap.data() }));
      renderDashboardCards();
      renderCurrentView();
    }
  );
}

function setupGlobalSearch() {
  const globalInput = document.getElementById('globalSearchInput');
  if (!globalInput) return;
  globalInput.addEventListener('input', () => {
    const term = globalInput.value.trim().toLowerCase();
    const resultsContainer = document.getElementById('globalSearchResults');
    if (!resultsContainer) return;
    if (!term) {
      resultsContainer.classList.add('hidden');
      resultsContainer.innerHTML = '';
      return;
    }

    const donors = donorsList.filter((donor) => {
      const text = `${donor.fullName || ''} ${donor.bloodGroup || ''} ${donor.city || ''} ${donor.phone || ''}`.toLowerCase();
      return text.includes(term);
    }).slice(0, 5);

    const hospitals = hospitalsList.filter((hospital) => {
      const text = `${hospital.hospitalName || ''} ${hospital.city || ''} ${hospital.email || ''}`.toLowerCase();
      return text.includes(term);
    }).slice(0, 5);

    const requests = requestsList.filter((req) => {
      const text = `${req.hospitalName || ''} ${req.bloodGroup || ''} ${req.id || ''} ${req.status || ''}`.toLowerCase();
      return text.includes(term);
    }).slice(0, 5);

    const donations = donationsList.filter((donation) => {
      const text = `${donation.donorName || ''} ${donation.bloodGroup || ''} ${donation.status || ''}`.toLowerCase();
      return text.includes(term);
    }).slice(0, 5);

    const groups = bloodGroups.filter((group) => group.toLowerCase().includes(term));

    const sections = [];
    if (donors.length) {
      sections.push(`<div class="search-result-section"><h4>Donors</h4>${donors.map((donor) => `<button type="button" class="search-result-item" data-view="donors" data-id="${donor.id}">${donor.fullName || 'Unknown'} — ${donor.bloodGroup || '-'} (${donor.city || 'N/A'})</button>`).join('')}</div>`);
    }
    if (hospitals.length) {
      sections.push(`<div class="search-result-section"><h4>Hospitals</h4>${hospitals.map((hospital) => `<button type="button" class="search-result-item" data-view="hospitals" data-id="${hospital.id}">${hospital.hospitalName || 'Unknown'} — ${hospital.city || 'N/A'}</button>`).join('')}</div>`);
    }
    if (requests.length) {
      sections.push(`<div class="search-result-section"><h4>Requests</h4>${requests.map((req) => `<button type="button" class="search-result-item" data-view="requests" data-id="${req.id}">${req.hospitalName || 'Hospital'} — ${req.bloodGroup || '-'} (${req.status || ''})</button>`).join('')}</div>`);
    }
    if (donations.length) {
      sections.push(`<div class="search-result-section"><h4>Donations</h4>${donations.map((donation) => `<button type="button" class="search-result-item" data-view="donations" data-id="${donation.id}">${donation.donorName || 'Donor'} — ${donation.bloodGroup || '-'} (${donation.status || ''})</button>`).join('')}</div>`);
    }
    if (groups.length) {
      sections.push(`<div class="search-result-section"><h4>Blood Groups</h4>${groups.map((group) => `<button type="button" class="search-result-item" data-view="inventory" data-group="${group}">${group}</button>`).join('')}</div>`);
    }

    resultsContainer.innerHTML = sections.length ? sections.join('') : `<div class="empty-state"><p>No results found for "${term}"</p></div>`;
    resultsContainer.classList.toggle('hidden', !sections.length);

    resultsContainer.querySelectorAll('.search-result-item').forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        const group = button.dataset.group;
        showView(view);
        if (view === 'inventory' && group) {
          document.getElementById('inventoryGroupFilter').value = group;
          renderInventoryTable();
        }
        resultsContainer.classList.add('hidden');
      });
    });
  });
}

function setupDashboardReportActions() {
  // CSV / Excel / Print buttons were removed from the dashboard.
}

function populateDonorOptions() {
  const select = document.getElementById('donorSelect');
  if (!select) return;
  select.innerHTML = '<option value="">Choose donor (optional)</option>' +
    donorsList.map((donor) => `<option value="${donor.id}">${donor.fullName || donor.email || donor.id}</option>`).join('');
}

function setupQuickActions() {
  document.querySelector('[data-action="quick-add-blood"]')?.addEventListener('click', () => openAddBloodModal());
  document.querySelector('[data-action="quick-issue-blood"]')?.addEventListener('click', () => showView('requests'));
  document.querySelector('[data-action="quick-view-requests"]')?.addEventListener('click', () => showView('requests'));
  document.querySelector('[data-action="quick-view-donors"]')?.addEventListener('click', () => showView('donors'));
  document.querySelector('[data-action="quick-notify-donors"]')?.addEventListener('click', () => showView('sendNotification'));
}

function renderDashboardCards() {
  const summary = currentInventorySummary || {};
  const availableUnits = Object.values(summary).reduce((sum, units) => sum + units, 0);
  const todayDonations = donationsList.filter((donation) => isSameDay(donation.createdAt, new Date())).length;
  const todayIssued = issuesList.filter((issue) => isSameDay(issue.issueDate, new Date())).length;
  const newDonorsCount = donorsList.filter((donor) => isSameDay(donor.createdAt || donor.registeredAt, new Date())).length;
  const activeRequestsCount = requestsList.filter((req) => req.status === 'Pending' || req.status === 'Approved').length;

  document.getElementById('availableBloodUnits').textContent = availableUnits;
  document.getElementById('totalBloodUnits').textContent = availableUnits;
  document.getElementById('lowStockGroups').textContent = Object.values(summary).filter((value) => value > 0 && value < 6).length;
  document.getElementById('bloodIssuedToday').textContent = todayIssued;
  document.getElementById('todaysDonations').textContent = todayDonations;
  document.getElementById('todayDonations').textContent = todayDonations;
  document.getElementById('todayIssued').textContent = todayIssued;
  document.getElementById('newDonors').textContent = newDonorsCount;
  document.getElementById('activeRequests').textContent = activeRequestsCount;
  renderLowStockAlerts(summary);
  renderInventoryProgress(summary);
  renderPendingRequestsPreview();
  renderRecentNotificationsPreview();
  renderRecentActivityPreview();
  renderCharts();
}

function renderInventoryProgress(inventorySummary) {
  const container = document.getElementById('inventoryProgressBars');
  if (!container) return;
  const maxUnits = Math.max(...Object.values(inventorySummary), 1);
  container.innerHTML = bloodGroups.map((group) => {
    const value = inventorySummary[group] || 0;
    const ratio = Math.min(100, Math.round((value / maxUnits) * 100));
    return `
      <div class="progress-group">
        <div class="progress-group-label">
          <span>${group}</span>
          <span>${value} units</span>
        </div>
        <div class="progress-bar-shell">
          <div class="progress-bar-fill" style="width: ${ratio}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPendingRequestsPreview() {
  const container = document.getElementById('pendingRequestsPreview');
  if (!container) return;
  const pending = requestsList.filter((req) => req.status === 'Pending').slice(0, 4);
  if (!pending.length) {
    container.innerHTML = '<p class="empty-state">No pending requests at the moment.</p>';
    return;
  }
  container.innerHTML = `
    <div class="table-responsive">
      <table class="table compact-table">
        <thead>
          <tr>
            <th>Hospital</th>
            <th>Blood Group</th>
            <th>Units</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          ${pending.map((req) => `
            <tr>
              <td>${req.hospitalName || 'Hospital'}</td>
              <td>${req.bloodGroup || '-'}</td>
              <td>${req.units || 0}</td>
              <td>${req.urgencyLevel || 'Normal'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRecentNotificationsPreview() {
  const container = document.getElementById('recentNotificationsPreview');
  if (!container) return;
  const notifications = allNotifications.slice(0, 3);
  if (!notifications.length) {
    container.innerHTML = '<p class="empty-state">No new notifications.</p>';
    return;
  }
  container.innerHTML = notifications.map((notif) => {
    const date = notif.createdAt?.seconds ? new Date(notif.createdAt.seconds * 1000) : new Date(notif.createdAt || Date.now());
    return `
      <div class="notification-preview-item ${notif.isRead ? '' : 'unread'}">
        <div>
          <strong>${notif.title || 'Notification'}</strong>
          <p>${notif.message || ''}</p>
        </div>
        <span>${date.toLocaleDateString()}</span>
      </div>
    `;
  }).join('');
}

function renderRecentActivityPreview() {
  const container = document.getElementById('recentActivityPreview');
  if (!container) return;
  const activities = [];
  donationsList.slice(-3).reverse().forEach((donation) => {
    activities.push({ label: `Donation: ${donation.donorName || 'Unknown'} (${donation.bloodGroup})`, time: donation.createdAt, type: 'donation' });
  });
  issuesList.slice(-3).reverse().forEach((issue) => {
    activities.push({ label: `Issued: ${issue.bloodGroup} to ${issue.hospitalName || 'Hospital'}`, time: issue.issueDate, type: 'issue' });
  });
  requestsList.slice(-3).reverse().forEach((req) => {
    activities.push({ label: `Request: ${req.hospitalName || 'Hospital'} (${req.bloodGroup})`, time: req.createdAt, type: 'request' });
  });
  inventoryHistoryList.slice(-3).reverse().forEach((record) => {
    activities.push({ label: `Inventory update: ${record.bloodGroup} ${record.difference >= 0 ? '+' : ''}${record.difference}`, time: record.createdAt, type: 'inventory' });
  });
  allNotifications.slice(0, 3).forEach((notif) => {
    activities.push({ label: `Notification: ${notif.title || 'Alert'}`, time: notif.createdAt, type: 'notification' });
  });
  activities.sort((a, b) => getTimestamp(b.time) - getTimestamp(a.time));
  const preview = activities.slice(0, 5);
  if (!preview.length) {
    container.innerHTML = '<p class="empty-state">No recent activity.</p>';
    return;
  }
  container.innerHTML = preview.map((item) => `
    <div class="activity-item">
      <div>
        <strong>${item.label}</strong>
        <p>${formatDate(item.time, true)}</p>
      </div>
      <span class="activity-type activity-${item.type}">${item.type.replace(/\b\w/g, (ch) => ch.toUpperCase())}</span>
    </div>
  `).join('');
}

function getTimestamp(value) {
  if (!value) return 0;
  if (value.seconds) return value.seconds * 1000;
  if (value.toMillis) return value.toMillis();
  return new Date(value).getTime();
}

function renderCharts() {
  const donationData = aggregateMonthlyCounts(donationsList, 'createdAt');
  const issueData = aggregateMonthlyCounts(issuesList, 'issueDate');
  const distributionData = bloodGroups.map((group) => ({ group, units: currentInventorySummary[group] || 0 }));

  renderChart('donationsChart', 'Monthly Donations', donationData.labels, donationData.values, 'rgba(193, 18, 31, 0.8)', 'bar');
  renderChart('issueTrendChart', 'Monthly Blood Issues', issueData.labels, issueData.values, 'rgba(46, 125, 50, 0.8)', 'line');
  renderChart('groupDistributionChart', 'Blood Group Distribution', distributionData.map((item) => item.group), distributionData.map((item) => item.units), undefined, 'pie');
}

function renderLowStockAlerts(inventorySummary) {
  const container = document.getElementById('lowStockAlerts');
  if (!container) return;
  const lowGroups = Object.entries(inventorySummary)
    .filter(([group, units]) => units > 0 && units < 6)
    .sort((a, b) => a[1] - b[1]);

  if (!lowGroups.length) {
    container.innerHTML = '<p class="text-center">All blood groups are within safe stock levels.</p>';
    return;
  }

  container.innerHTML = lowGroups.map(([group, units]) => `
    <div class="card low-stock-card">
      <div class="low-stock-header">
        <div>
          <strong>${group}</strong>
          <p>${units} units remaining — action recommended</p>
        </div>
        <span class="badge badge-warning">Low Stock</span>
      </div>
      <div class="low-stock-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="restock-blood" data-blood-group="${group}">Restock</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="notify-donors" data-blood-group="${group}">Notify Donors</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="restock-blood"]').forEach((button) => {
    button.addEventListener('click', () => openAddBloodModal(button.dataset.bloodGroup));
  });
  container.querySelectorAll('[data-action="notify-donors"]').forEach((button) => {
    button.addEventListener('click', () => notifyLowStock(button.dataset.bloodGroup));
  });
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
    element.addEventListener('click', async (event) => {
      event.preventDefault();
      await logout();
    });
  });

  document.querySelectorAll('[data-action="open-add-blood-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      openAddBloodModal();
    });
  });

  document.querySelectorAll('[data-action="close-add-blood-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      closeAddBloodModal();
    });
  });

  document.querySelectorAll('[data-action="close-inventory-action-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      closeInventoryActionModal();
    });
  });

  document.querySelectorAll('[data-action="close-request-details-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      closeRequestDetailsModal();
    });
  });

  const profileButton = document.querySelector('.dropdown > button');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  if (profileButton && dropdownMenu) {
    profileButton.addEventListener('click', (event) => {
      event.preventDefault();
      dropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', (event) => {
      if (!profileButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.classList.remove('show');
      }
    });
  }
}

async function loadHospitals() {
  const snapshot = await getDocs(collection(db, 'hospitals'));
  hospitalsList = [];
  snapshot.forEach((docSnap) => hospitalsList.push({ id: docSnap.id, ...docSnap.data() }));
  document.getElementById('connectedHospitals').textContent = hospitalsList.length;
}

async function loadDonors() {
  const snapshot = await getDocs(collection(db, 'donors'));
  donorsList = [];
  snapshot.forEach((docSnap) => donorsList.push({ id: docSnap.id, ...docSnap.data() }));
  document.getElementById('totalDonors').textContent = donorsList.length;
}

async function loadRequests() {
  const result = await bloodRequestManager.getOrganizationRequests(currentOrganization.uid);
  requestsList = result.success ? result.data : [];
  document.getElementById('pendingHospitalRequests').textContent = requestsList.filter((req) => req.status === 'Pending').length;
  document.getElementById('completedRequests').textContent = requestsList.filter((req) => req.status === 'Completed').length;
}

async function loadDonations() {
  const donationsQuery = query(collection(db, 'donations'), where('organizationId', '==', currentOrganization.uid));
  const snapshot = await getDocs(donationsQuery);
  donationsList = [];
  snapshot.forEach((docSnap) => donationsList.push({ id: docSnap.id, ...docSnap.data() }));
  document.getElementById('todaysDonations').textContent = donationsList.filter((donation) => isSameDay(donation.createdAt, new Date())).length;
}

async function loadIssueHistory() {
  const issuesQuery = query(collection(db, 'bloodIssues'), where('organizationId', '==', currentOrganization.uid));
  const snapshot = await getDocs(issuesQuery);
  issuesList = [];
  snapshot.forEach((docSnap) => issuesList.push({ id: docSnap.id, ...docSnap.data() }));
}

async function loadInventoryHistory() {
  const historyQuery = query(collection(db, 'inventoryHistory'), where('organizationId', '==', currentOrganization.uid));
  const snapshot = await getDocs(historyQuery);
  inventoryHistoryList = [];
  snapshot.forEach((docSnap) => inventoryHistoryList.push({ id: docSnap.id, ...docSnap.data() }));
}

async function loadNotifications() {
  const result = await bloodRequestManager.getNotifications(currentOrganization.uid);
  if (result.success) {
    const notifications = result.data || [];
    allNotifications = notifications.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
    document.getElementById('totalNotifications').textContent = notifications.length;
    document.getElementById('notificationBadge').textContent = notifications.filter((item) => !item.isRead).length;
    document.getElementById('notificationBadge2').textContent = notifications.filter((item) => !item.isRead).length;
    renderRecentNotificationsPreview();
    renderRecentActivityPreview();
    if (currentView === 'notifications') displayNotifications(notifications);
  }
}

async function loadInventorySummary() {
  const inventoryResult = await bloodInventoryManager.getInventoryByOrganization(currentOrganization.uid);
  if (inventoryResult.success) {
    currentInventorySummary = inventoryResult.data;
    displayInventoryOverview(currentInventorySummary);
    calculateTotalUnits(currentInventorySummary);
  } else {
    currentInventorySummary = {};
  }

  const inventoryItemsResult = await bloodInventoryManager.getInventoryItemsByOrganization(currentOrganization.uid);
  inventoryItems = inventoryItemsResult.success ? inventoryItemsResult.data : [];

  if (inventoryListener) inventoryListener();
  inventoryListener = bloodInventoryManager.listenOrganizationInventory(currentOrganization.uid, (result) => {
    if (!result.success) return;
    inventoryItems = result.data;
    currentInventorySummary = inventoryItems.reduce((summary, item) => {
      if (item.status === 'Available') {
        summary[item.bloodGroup] = (summary[item.bloodGroup] || 0) + item.units;
      }
      return summary;
    }, bloodGroups.reduce((summary, group) => ({ ...summary, [group]: 0 }), {}));
    displayInventoryOverview(currentInventorySummary);
    calculateTotalUnits(currentInventorySummary);
    renderDashboardCards();
    renderCurrentView();
  });
}

function displayInventoryOverview(inventory) {
  const container = document.getElementById('inventoryOverview');
  if (!container) return;
  let html = '';
  bloodGroups.forEach((group) => {
    const units = inventory[group] || 0;
    const color = bloodInventoryManager.getBloodGroupColor(group);
    html += `
      <div class="inventory-item" style="border-left: 4px solid ${color}">
        <div class="inventory-group">${group}</div>
        <div class="inventory-units">${units} Units</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function calculateTotalUnits(inventory) {
  const total = Object.values(inventory).reduce((sum, units) => sum + units, 0);
  document.getElementById('totalBloodUnits').textContent = total;
}


async function notifyLowStock(group) {
  if (!group) return;
  if (!confirm(`Notify donors that ${group} stock is low?`)) return;

  try {
    const recipientIds = donorsList.map((item) => item.uid || item.id);
    if (!recipientIds.length) {
      alert('No donors found to notify.');
      return;
    }
    await Promise.all(recipientIds.map((recipientId) => bloodRequestManager.sendNotification({
      recipientId,
      type: 'low_inventory',
      title: `Low stock alert: ${group}`,
      message: `Only a small supply of ${group} is available. Please consider donating soon.`,
      senderId: currentOrganization.uid,
      senderRole: 'organization',
      senderName: currentOrganization.organizationName || 'Organization'
    })));
    alert('Low stock notification sent.');
  } catch (error) {
    console.error('Error notifying donors:', error);
    alert('Failed to send notifications.');
  }
}

function renderCurrentView() {
  if (currentView === 'inventory') renderInventoryTable();
  if (currentView === 'donations') renderDonationsTable();
  if (currentView === 'requests') renderRequestsTable();
  if (currentView === 'issueHistory') renderIssueHistoryTable();
  if (currentView === 'donationHistory') renderDonationHistoryTable();
  if (currentView === 'inventoryHistory') renderInventoryHistoryTable();
  if (currentView === 'donors') renderDonorsTable();
  if (currentView === 'hospitals') renderHospitalsTable();
}

function renderInventoryTable() {
  const tableContainer = document.getElementById('bloodInventoryTable');
  const search = document.getElementById('inventorySearch')?.value.toLowerCase() || '';
  const groupFilter = document.getElementById('inventoryGroupFilter')?.value || '';
  const rows = bloodGroups
    .filter((group) => !groupFilter || group === groupFilter)
    .filter((group) => group.toLowerCase().includes(search) || String(currentInventorySummary[group] || '').includes(search))
    .map((group) => {
      const available = currentInventorySummary[group] || 0;
      const groupItems = inventoryItems.filter((item) => item.bloodGroup === group && item.status === 'Available');
      const expiringSoon = groupItems.filter((item) => {
        const expiry = item.expiryDate?.seconds ? item.expiryDate.seconds * 1000 : item.expiryDate?.toMillis?.();
        return expiry && expiry < Date.now() + 14 * 24 * 60 * 60 * 1000;
      }).length;
      const lastUpdated = groupItems.reduce((latest, item) => {
        const timestamp = item.updatedAt?.seconds ? item.updatedAt.seconds * 1000 : item.updatedAt?.toMillis?.() || 0;
        return Math.max(latest, timestamp);
      }, 0);
      return `
        <tr>
          <td>${group}</td>
          <td>${available}</td>
          <td>${available}</td>
          <td>${expiringSoon}</td>
          <td>${lastUpdated ? new Date(lastUpdated).toLocaleDateString() : '-'}</td>
          <td class="table-actions-cell">
            <button class="btn btn-secondary btn-sm" data-action="view-inventory" data-group="${group}">View</button>
            <button class="btn btn-secondary btn-sm" data-action="edit-inventory" data-group="${group}">Edit</button>
            <button class="btn btn-primary btn-sm" data-action="adjust-inventory" data-group="${group}" data-adjust="increase">Increase</button>
            <button class="btn btn-secondary btn-sm" data-action="adjust-inventory" data-group="${group}" data-adjust="decrease">Decrease</button>
            <button class="btn btn-secondary btn-sm" data-action="inventory-history" data-group="${group}">History</button>
          </td>
        </tr>
      `;
    });

  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Blood Group</th>
              <th>Available Units</th>
              <th>Reserved Units</th>
              <th>Expiring Soon</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    </div>
  `;

  tableContainer.querySelectorAll('[data-action="adjust-inventory"]').forEach((button) => {
    button.addEventListener('click', () => openInventoryActionModal(button.dataset.group, button.dataset.adjust));
  });
}

function renderDonationsTable() {
  const tableContainer = document.getElementById('donationManagementTable');
  const search = document.getElementById('donationSearch')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('donationStatusFilter')?.value || '';
  const rows = donationsList
    .filter((item) => {
      const term = `${item.donorName || ''} ${item.bloodGroup || ''} ${item.status || ''}`.toLowerCase();
      return term.includes(search) && (!statusFilter || item.status === statusFilter);
    })
    .map((donation) => `
      <tr>
        <td>${donation.donorName || 'Unknown'}</td>
        <td>${donation.bloodGroup || '-'}</td>
        <td>${donation.units || 0}</td>
        <td>${formatDate(donation.createdAt, true)}</td>
        <td>${donation.status || 'Pending'}</td>
        <td>${donation.organizationName || '-'}</td>
        <td class="table-actions-cell">
          <button class="btn btn-secondary btn-sm" data-action="view-donation" data-id="${donation.id}">View</button>
          ${donation.status === 'Pending' ? `<button class="btn btn-primary btn-sm" data-action="approve-donation" data-id="${donation.id}">Approve</button>` : ''}
          ${donation.status === 'Pending' ? `<button class="btn btn-secondary btn-sm" data-action="reject-donation" data-id="${donation.id}">Reject</button>` : ''}
          ${donation.status === 'Approved' ? `<button class="btn btn-success btn-sm" data-action="complete-donation" data-id="${donation.id}">Complete</button>` : ''}
        </td>
      </tr>
    `);

  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Donor Name</th>
              <th>Blood Group</th>
              <th>Units</th>
              <th>Donation Date</th>
              <th>Status</th>
              <th>Organization</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : '<tr><td colspan="7" class="text-center">No donations available</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  tableContainer.querySelectorAll('[data-action="view-donation"]').forEach((button) => {
    button.addEventListener('click', () => viewDonationDetails(button.dataset.id));
  });
  tableContainer.querySelectorAll('[data-action="approve-donation"]').forEach((button) => {
    button.addEventListener('click', () => updateDonationStatus(button.dataset.id, 'Approved'));
  });
  tableContainer.querySelectorAll('[data-action="reject-donation"]').forEach((button) => {
    button.addEventListener('click', () => updateDonationStatus(button.dataset.id, 'Rejected'));
  });
  tableContainer.querySelectorAll('[data-action="complete-donation"]').forEach((button) => {
    button.addEventListener('click', () => updateDonationStatus(button.dataset.id, 'Completed'));
  });
}

function viewDonationDetails(id) {
  const donation = donationsList.find((item) => item.id === id);
  if (!donation) return;
  const content = document.getElementById('requestDetailsContent');
  content.innerHTML = `
    <div class="details-grid">
      <div><strong>Donor:</strong> ${donation.donorName || 'Unknown'}</div>
      <div><strong>Blood Group:</strong> ${donation.bloodGroup || '-'}</div>
      <div><strong>Units:</strong> ${donation.units || 0}</div>
      <div><strong>Date:</strong> ${formatDate(donation.createdAt, true)}</div>
      <div><strong>Organization:</strong> ${donation.organizationName || '-'}</div>
      <div><strong>Status:</strong> ${donation.status || 'Pending'}</div>
      <div><strong>Notes:</strong> ${donation.notes || '-'}</div>
    </div>
  `;
  openRequestDetailsModal();
}

async function updateDonationStatus(id, status) {
  try {
    await updateDoc(doc(db, 'donations', id), {
      status,
      updatedAt: new Date()
    });
    await loadDonations();
    renderDonationsTable();
    alert(`Donation updated to ${status}.`);
  } catch (error) {
    console.error('Error updating donation status:', error);
    alert('Failed to update donation status.');
  }
}

function renderRequestsTable() {
  const tableContainer = document.getElementById('requestsList');
  const search = document.getElementById('requestSearch')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('requestStatusFilter')?.value || '';
  const priorityFilter = document.getElementById('requestPriorityFilter')?.value || '';

  const rows = requestsList
    .filter((req) => {
      const term = `${req.hospitalName || ''} ${req.bloodGroup || ''} ${req.id || ''} ${req.status || ''}`.toLowerCase();
      return term.includes(search);
    })
    .filter((req) => !statusFilter || req.status === statusFilter)
    .filter((req) => !priorityFilter || req.urgencyLevel === priorityFilter)
    .map((req) => `
      <tr>
        <td>${req.hospitalName || '-'}</td>
        <td>${req.bloodGroup || '-'}</td>
        <td>${req.units || 0}</td>
        <td>${req.urgencyLevel || '-'}</td>
        <td>${formatDate(req.createdAt)}</td>
        <td><span class="badge badge-${(req.status || '').toLowerCase()}">${req.status || ''}</span></td>
        <td class="table-actions-cell">
          ${req.status === 'Pending' ? `<button class="btn btn-primary btn-sm" data-action="approve-request" data-request-id="${req.id}">Approve</button>` : ''}
          ${req.status === 'Pending' ? `<button class="btn btn-secondary btn-sm" data-action="reject-request" data-request-id="${req.id}">Reject</button>` : ''}
          ${req.status === 'Approved' ? `<button class="btn btn-success btn-sm" data-action="issue-blood" data-request-id="${req.id}">Issue Blood</button>` : ''}
          <button class="btn btn-secondary btn-sm" data-action="view-request" data-request-id="${req.id}">View</button>
        </td>
      </tr>
    `);

  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Hospital</th>
              <th>Blood Group</th>
              <th>Units</th>
              <th>Priority</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : '<tr><td colspan="7" class="text-center">No requests match the filters</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  tableContainer.querySelectorAll('[data-action="approve-request"]').forEach((button) => {
    button.addEventListener('click', () => approveRequest(button.dataset.requestId));
  });
  tableContainer.querySelectorAll('[data-action="reject-request"]').forEach((button) => {
    button.addEventListener('click', () => openRejectModal(button.dataset.requestId));
  });
  tableContainer.querySelectorAll('[data-action="issue-blood"]').forEach((button) => {
    button.addEventListener('click', () => issueBlood(button.dataset.requestId));
  });
  tableContainer.querySelectorAll('[data-action="view-request"]').forEach((button) => {
    button.addEventListener('click', () => openRequestDetails(button.dataset.requestId));
  });
}

async function issueBlood(requestId) {
  const request = requestsList.find((req) => req.id === requestId);
  if (!request) {
    alert('Request not found.');
    return;
  }

  const success = await deductInventory(request.bloodGroup, request.units);
  if (!success) {
    alert('Insufficient inventory to issue blood.');
    return;
  }

  await updateDoc(doc(db, 'bloodRequests', requestId), {
    status: 'Completed',
    issuedAt: new Date(),
    updatedAt: new Date()
  });

  await addDoc(collection(db, 'bloodIssues'), {
    hospitalId: request.hospitalId,
    hospitalName: request.hospitalName,
    organizationId: currentOrganization.uid,
    organizationName: currentOrganization.organizationName,
    bloodGroup: request.bloodGroup,
    units: request.units,
    issuedBy: currentOrganization.uid,
    issueDate: new Date(),
    purpose: request.purpose || 'Hospital request',
    status: 'Completed',
    createdAt: new Date()
  });

  await bloodRequestManager.sendNotification({
    recipientId: request.hospitalId,
    type: 'blood_issued',
    title: 'Blood Issued',
    message: `${request.units} units of ${request.bloodGroup} have been issued to your hospital.`,
    senderId: currentOrganization.uid,
    senderRole: 'organization',
    senderName: currentOrganization.organizationName
  });

  alert('Blood issued successfully.');
  await refreshAllData();
}

async function deductInventory(group, unitsNeeded) {
  const availableItems = inventoryItems
    .filter((item) => item.bloodGroup === group && item.status === 'Available')
    .sort((a, b) => {
      const aExpiry = a.expiryDate?.seconds ? a.expiryDate.seconds * 1000 : a.expiryDate?.toMillis?.() || 0;
      const bExpiry = b.expiryDate?.seconds ? b.expiryDate.seconds * 1000 : b.expiryDate?.toMillis?.() || 0;
      return aExpiry - bExpiry;
    });

  let remaining = unitsNeeded;
  const updates = [];
  for (const item of availableItems) {
    if (remaining <= 0) break;
    const reduceBy = Math.min(item.units, remaining);
    updates.push({ id: item.id, units: item.units - reduceBy });
    remaining -= reduceBy;
  }

  if (remaining > 0) return false;

  await Promise.all(updates.map((update) => updateDoc(doc(db, 'bloodInventory', update.id), {
    units: update.units,
    status: update.units > 0 ? 'Available' : 'Used',
    updatedAt: new Date()
  })));
  return true;
}

function openRequestDetails(requestId) {
  const request = requestsList.find((item) => item.id === requestId);
  if (!request) return;
  const content = document.getElementById('requestDetailsContent');
  content.innerHTML = `
    <div class="details-grid">
      <div><strong>Hospital:</strong> ${request.hospitalName || '-'}</div>
      <div><strong>Blood Group:</strong> ${request.bloodGroup || '-'}</div>
      <div><strong>Units:</strong> ${request.units || 0}</div>
      <div><strong>Priority:</strong> ${request.urgencyLevel || '-'}</div>
      <div><strong>Status:</strong> ${request.status || '-'}</div>
      <div><strong>Requested On:</strong> ${formatDate(request.createdAt, true)}</div>
      <div><strong>Patient:</strong> ${request.patientName || 'N/A'}</div>
      <div><strong>Purpose:</strong> ${request.purpose || 'N/A'}</div>
      <div><strong>Notes:</strong> ${request.notes || '-'}</div>
    </div>
  `;
  openRequestDetailsModal();
}

function openRequestDetailsModal() {
  document.getElementById('requestDetailsModal')?.classList.add('show');
}

function closeRequestDetailsModal() {
  document.getElementById('requestDetailsModal')?.classList.remove('show');
}

function openAddBloodModal(group = '') {
  document.getElementById('bloodGroupSelect').value = group || '';
  document.getElementById('organizationInput').value = currentOrganization.organizationName || '';
  document.getElementById('addBloodModal')?.classList.add('show');
}

function closeAddBloodModal() {
  document.getElementById('addBloodModal')?.classList.remove('show');
}

function openInventoryActionModal(group = '', action = 'increase') {
  document.getElementById('inventoryActionTitle').textContent = action === 'decrease' ? 'Decrease Inventory' : 'Increase Inventory';
  document.getElementById('inventoryActionGroup').value = group;
  document.getElementById('inventoryActionType').value = action;
  document.getElementById('inventoryActionUnits').value = '';
  document.getElementById('inventoryActionExpiryDate').value = '';
  document.getElementById('inventoryActionNotes').value = '';
  document.getElementById('inventoryActionModal')?.classList.add('show');
}

function closeInventoryActionModal() {
  document.getElementById('inventoryActionModal')?.classList.remove('show');
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
    element.addEventListener('click', async (event) => {
      event.preventDefault();
      await logout();
    });
  });

  document.querySelectorAll('[data-action="open-add-blood-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      openAddBloodModal();
    });
  });

  document.querySelectorAll('[data-action="close-add-blood-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      closeAddBloodModal();
    });
  });

  document.querySelectorAll('[data-action="close-inventory-action-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      closeInventoryActionModal();
    });
  });

  document.querySelectorAll('[data-action="close-request-details-modal"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      closeRequestDetailsModal();
    });
  });

  const profileButton = document.querySelector('.dropdown > button');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  if (profileButton && dropdownMenu) {
    profileButton.addEventListener('click', (event) => {
      event.preventDefault();
      dropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', (event) => {
      if (!profileButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.classList.remove('show');
      }
    });
  }
}

function setupNotificationSendHandlers() {
  const recipientType = document.getElementById('recipientType');
  const sendNotificationForm = document.getElementById('sendNotificationForm');

  recipientType?.addEventListener('change', (event) => {
    populateRecipientSelector(event.target.value);
  });

  sendNotificationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleSendNotificationSubmit();
  });
}

function populateRecipientSelector(type) {
  const recipientSelectorGroup = document.getElementById('recipientSelectorGroup');
  const recipientSelector = document.getElementById('recipientSelector');
  if (!recipientSelectorGroup || !recipientSelector) return;

  let list = [];
  let placeholder = 'Select recipient...';
  if (type === 'specificDonor') {
    list = donorsList;
    placeholder = 'Select donor...';
  } else if (type === 'specificHospital') {
    list = hospitalsList;
    placeholder = 'Select hospital...';
  }

  if (type === 'specificDonor' || type === 'specificHospital') {
    recipientSelectorGroup.classList.remove('hidden');
    recipientSelector.required = true;
    recipientSelector.innerHTML = `<option value="">${placeholder}</option>` +
      list.map((item) => {
        const label = item.fullName || item.hospitalName || item.email || item.uid || item.id;
        return `<option value="${item.uid || item.id}">${label}</option>`;
      }).join('');
  } else {
    recipientSelectorGroup.classList.add('hidden');
    recipientSelector.required = false;
    recipientSelector.innerHTML = '';
  }
}

async function handleSendNotificationSubmit() {
  const recipientType = document.getElementById('recipientType')?.value;
  const title = document.getElementById('notificationTitle')?.value.trim();
  const message = document.getElementById('notificationMessage')?.value.trim();
  const recipientSelector = document.getElementById('recipientSelector');

  if (!recipientType || !title || !message) {
    alert('Please fill in the recipient type, title, and message.');
    return;
  }

  let recipientIds = [];
  if (recipientType === 'specificDonor') {
    const selected = recipientSelector?.value;
    if (selected) recipientIds.push(selected);
  } else if (recipientType === 'allDonors') {
    recipientIds = donorsList.map((item) => item.uid || item.id);
  } else if (recipientType === 'specificHospital') {
    const selected = recipientSelector?.value;
    if (selected) recipientIds.push(selected);
  } else if (recipientType === 'allHospitals') {
    recipientIds = hospitalsList.map((item) => item.uid || item.id);
  }

  if (!recipientIds.length) {
    alert('Please choose a valid recipient or ensure recipients are available.');
    return;
  }

  try {
    const sendPromises = recipientIds.map((recipientId) =>
      bloodRequestManager.sendNotification({
        recipientId,
        type: 'organization_manual',
        title,
        message,
        senderId: currentOrganization.uid,
        senderRole: 'organization',
        senderName: currentOrganization.organizationName || currentOrganization.email || 'Organization'
      })
    );
    await Promise.all(sendPromises);
    alert('Notification sent successfully.');
    document.getElementById('sendNotificationForm')?.reset();
    document.getElementById('recipientType').value = 'specificDonor';
    populateRecipientSelector('specificDonor');
    showView('dashboard');
  } catch (error) {
    console.error('Error sending organization notification:', error);
    alert('Failed to send notification.');
  }
}

function displayNotifications(notifications) {
  let html = '';
  if (notifications.length === 0) {
    html = '<div class="empty-state"><p>No notifications</p></div>';
  } else {
    notifications.forEach((notif) => {
      const date = notif.createdAt?.seconds ? new Date(notif.createdAt.seconds * 1000) : new Date(notif.createdAt);
      const timeAgo = getTimeAgo(date);
      const formattedDateTime = date.toLocaleString();
      const senderLabel = notif.senderName ? `From: ${notif.senderName}` : 'From: System';
      html += `
        <div class="notification-item ${!notif.isRead ? 'unread' : ''}" data-notification-id="${notif.id}">
          <div class="notification-icon">
            <i class="fas fa-bell"></i>
          </div>
          <div class="notification-content">
            <div class="notification-title">${notif.title}</div>
            <div class="notification-sender">${senderLabel}</div>
            <div class="notification-message">${notif.message}</div>
            <div class="notification-time">${timeAgo} · ${formattedDateTime}</div>
          </div>
        </div>
      `;
    });
  }
  document.getElementById('notificationsList').innerHTML = html;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
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
  if (view === 'notifications') loadNotifications();
  if (view === 'sendNotification') populateRecipientSelector(document.getElementById('recipientType')?.value || 'specificDonor');
  renderCurrentView();
}

function setupSearchAndFilters() {
  document.getElementById('inventorySearch')?.addEventListener('input', renderInventoryTable);
  document.getElementById('inventoryGroupFilter')?.addEventListener('change', renderInventoryTable);
  document.getElementById('donationSearch')?.addEventListener('input', renderDonationsTable);
  document.getElementById('donationStatusFilter')?.addEventListener('change', renderDonationsTable);
  document.getElementById('requestSearch')?.addEventListener('input', renderRequestsTable);
  document.getElementById('requestStatusFilter')?.addEventListener('change', renderRequestsTable);
  document.getElementById('requestPriorityFilter')?.addEventListener('change', renderRequestsTable);
  document.getElementById('issueSearch')?.addEventListener('input', renderIssueHistoryTable);
  document.getElementById('issueStatusFilter')?.addEventListener('change', renderIssueHistoryTable);
  document.getElementById('donationHistorySearch')?.addEventListener('input', renderDonationHistoryTable);
  document.getElementById('donationHistoryStatusFilter')?.addEventListener('change', renderDonationHistoryTable);
  document.getElementById('inventoryHistorySearch')?.addEventListener('input', renderInventoryHistoryTable);
  document.getElementById('inventoryHistoryGroupFilter')?.addEventListener('change', renderInventoryHistoryTable);
  document.getElementById('donorsSearch')?.addEventListener('input', renderDonorsTable);
  document.getElementById('donorBloodGroupFilter')?.addEventListener('change', renderDonorsTable);
  document.getElementById('hospitalsSearch')?.addEventListener('input', renderHospitalsTable);
  document.getElementById('hospitalStatusFilter')?.addEventListener('change', renderHospitalsTable);
  document.getElementById('notificationsList')?.addEventListener('click', async (event) => {
    const item = event.target.closest('.notification-item');
    if (!item) return;
    const id = item.dataset.notificationId;
    if (!id) return;
    await bloodRequestManager.markNotificationAsRead(id);
    await loadNotifications();
  });
}

function setupGlobalActions() {
  document.querySelectorAll('[data-action="mark-all-read"]').forEach((element) => {
    element.addEventListener('click', async (event) => {
      event.preventDefault();
      await markAllNotificationsRead();
    });
  });

  document.querySelectorAll('[data-action="clear-notifications"]').forEach((element) => {
    element.addEventListener('click', async (event) => {
      event.preventDefault();
      await clearNotifications();
    });
  });
}

function setupExportActions() {
  document.querySelectorAll('[data-action="export-inventory-csv"]').forEach((element) => {
    element.addEventListener('click', () => exportInventoryCSV());
  });
  document.querySelectorAll('[data-action="export-donations-csv"]').forEach((element) => {
    element.addEventListener('click', () => exportDonationsCSV());
  });
  document.querySelectorAll('[data-action="export-requests-csv"]').forEach((element) => {
    element.addEventListener('click', () => exportRequestsCSV());
  });
  document.querySelectorAll('[data-action="export-issues-csv"]').forEach((element) => {
    element.addEventListener('click', () => exportIssueHistoryCSV());
  });
  document.querySelectorAll('[data-action="export-donation-history-csv"]').forEach((element) => {
    element.addEventListener('click', () => exportDonationHistoryCSV());
  });
  document.querySelectorAll('[data-action="export-inventory-history-csv"]').forEach((element) => {
    element.addEventListener('click', () => exportInventoryHistoryCSV());
  });
  document.querySelectorAll('[data-action="export-inventory-excel"]').forEach((element) => {
    element.addEventListener('click', () => exportInventoryExcel());
  });
  document.querySelectorAll('[data-action="export-donations-excel"]').forEach((element) => {
    element.addEventListener('click', () => exportDonationsExcel());
  });
  document.querySelectorAll('[data-action="export-requests-excel"]').forEach((element) => {
    element.addEventListener('click', () => exportRequestsExcel());
  });
  document.querySelectorAll('[data-action="export-issues-excel"]').forEach((element) => {
    element.addEventListener('click', () => exportIssueHistoryExcel());
  });
  document.querySelectorAll('[data-action="export-donation-history-excel"]').forEach((element) => {
    element.addEventListener('click', () => exportDonationHistoryExcel());
  });
  document.querySelectorAll('[data-action="export-inventory-history-excel"]').forEach((element) => {
    element.addEventListener('click', () => exportInventoryHistoryExcel());
  });
}

function setupRequestActions() {
  const recentRequestsContainer = document.getElementById('recentRequests');
  if (!recentRequestsContainer) return;

  recentRequestsContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const requestId = button.dataset.requestId;
    if (!requestId) return;

    event.preventDefault();
    if (action === 'approve-request') {
      await approveRequest(requestId);
    } else if (action === 'reject-request') {
      openRejectModal(requestId);
    }
  });
}

async function approveRequest(requestId) {
  try {
    const result = await bloodRequestManager.approveRequest(requestId, currentOrganization.uid);
    if (result.success) {
      alert('Request approved!');
      await refreshAllData();
    }
  } catch (error) {
    console.error('Error approving request:', error);
    alert('Failed to approve request');
  }
}

function openRejectModal(requestId) {
  const reason = prompt('Please provide a reason for rejection:');
  if (!reason) return;
  rejectRequest(requestId, reason);
}

async function rejectRequest(requestId, reason) {
  try {
    const result = await bloodRequestManager.rejectRequest(requestId, reason);
    if (result.success) {
      alert('Request rejected');
      await refreshAllData();
    }
  } catch (error) {
    console.error('Error rejecting request:', error);
    alert('Failed to reject request');
  }
}

function renderDonorsTable() {
  const tableContainer = document.getElementById('donorsTable');
  const search = document.getElementById('donorsSearch')?.value.toLowerCase() || '';
  const groupFilter = document.getElementById('donorBloodGroupFilter')?.value || '';

  const rows = donorsList
    .filter((donor) => {
      const term = `${donor.fullName || ''} ${donor.bloodGroup || ''} ${donor.city || ''} ${donor.email || ''}`.toLowerCase();
      return term.includes(search) && (!groupFilter || donor.bloodGroup === groupFilter);
    })
    .map((donor) => {
      const eligibility = donor.isEligible ? 'Eligible' : 'Not Eligible';
      const status = donor.isActive === false ? 'Inactive' : 'Active';
      return `
        <tr>
          <td>${donor.fullName || 'Unknown'}</td>
          <td>${donor.bloodGroup || '-'}</td>
          <td>${donor.age || '-'}</td>
          <td>${donor.gender || '-'}</td>
          <td>${donor.city || '-'}</td>
          <td>${donor.phone || '-'}</td>
          <td>${formatDate(donor.lastDonationDate)}</td>
          <td>${eligibility}</td>
          <td>${status}</td>
          <td class="table-actions-cell">
            <button class="btn btn-secondary btn-sm" data-action="view-donor" data-id="${donor.id}">View</button>
            <button class="btn btn-secondary btn-sm" data-action="notify-donor" data-id="${donor.id}">Notify</button>
          </td>
        </tr>
      `;
    });

  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Blood Group</th>
              <th>Age</th>
              <th>Gender</th>
              <th>City</th>
              <th>Phone</th>
              <th>Last Donation</th>
              <th>Eligibility</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : '<tr><td colspan="10" class="text-center">No donors found</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  tableContainer.querySelectorAll('[data-action="view-donor"]').forEach((button) => {
    button.addEventListener('click', () => viewDonorDetails(button.dataset.id));
  });
  tableContainer.querySelectorAll('[data-action="notify-donor"]').forEach((button) => {
    button.addEventListener('click', () => alert('Use the Send Notification page to notify this donor.'));
  });
}

function viewDonorDetails(id) {
  const donor = donorsList.find((item) => item.id === id);
  if (!donor) return;
  alert(`Donor Details:\n\nName: ${donor.fullName || 'Unknown'}\nBlood Group: ${donor.bloodGroup || '-'}\nCity: ${donor.city || '-'}\nPhone: ${donor.phone || '-'}\nLast Donation: ${formatDate(donor.lastDonationDate)}\nEligibility: ${donor.isEligible ? 'Eligible' : 'Not Eligible'}`);
}

function renderHospitalsTable() {
  const tableContainer = document.getElementById('hospitalsTable');
  const search = document.getElementById('hospitalsSearch')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('hospitalStatusFilter')?.value || '';

  const rows = hospitalsList
    .filter((hospital) => {
      const term = `${hospital.hospitalName || ''} ${hospital.city || ''} ${hospital.email || ''}`.toLowerCase();
      return term.includes(search) && (!statusFilter || (hospital.status || 'Active') === statusFilter);
    })
    .map((hospital) => {
      const totalRequests = requestsList.filter((req) => req.hospitalId === hospital.uid).length;
      const completedRequests = requestsList.filter((req) => req.hospitalId === hospital.uid && req.status === 'Completed').length;
      return `
        <tr>
          <td>${hospital.hospitalName || 'Unknown'}</td>
          <td>${hospital.email || '-'}</td>
          <td>${hospital.phone || '-'}</td>
          <td>${hospital.city || '-'}</td>
          <td>${hospital.status || 'Active'}</td>
          <td>${totalRequests}</td>
          <td>${completedRequests}</td>
          <td class="table-actions-cell">
            <button class="btn btn-secondary btn-sm" data-action="view-hospital" data-id="${hospital.uid}">View</button>
            <button class="btn btn-secondary btn-sm" data-action="notify-hospital" data-id="${hospital.uid}">Notify</button>
          </td>
        </tr>
      `;
    });

  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Hospital Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>City</th>
              <th>Status</th>
              <th>Total Requests</th>
              <th>Completed Requests</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : '<tr><td colspan="8" class="text-center">No hospitals found</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  tableContainer.querySelectorAll('[data-action="view-hospital"]').forEach((button) => {
    button.addEventListener('click', () => viewHospitalDetails(button.dataset.id));
  });
  tableContainer.querySelectorAll('[data-action="notify-hospital"]').forEach((button) => {
    button.addEventListener('click', () => alert('Use the Send Notification page to message this hospital.'));
  });
}

function viewHospitalDetails(id) {
  const hospital = hospitalsList.find((item) => item.uid === id);
  if (!hospital) return;
  alert(`Hospital Details:\n\nName: ${hospital.hospitalName || 'Unknown'}\nEmail: ${hospital.email || '-'}\nPhone: ${hospital.phone || '-'}\nCity: ${hospital.city || '-'}\nStatus: ${hospital.status || 'Active'}`);
}

function renderIssueHistoryTable() {
  const tableContainer = document.getElementById('issueHistoryTable');
  const search = document.getElementById('issueSearch')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('issueStatusFilter')?.value || '';
  const rows = issuesList
    .filter((item) => {
      const term = `${item.hospitalName || ''} ${item.bloodGroup || ''} ${item.purpose || ''}`.toLowerCase();
      return term.includes(search) && (!statusFilter || item.status === statusFilter);
    })
    .map((issue) => `
      <tr>
        <td>${issue.hospitalName || ''}</td>
        <td>${issue.bloodGroup || ''}</td>
        <td>${issue.units || 0}</td>
        <td>${issue.issuedBy || ''}</td>
        <td>${formatDate(issue.issueDate, true)}</td>
        <td>${issue.purpose || ''}</td>
        <td>${issue.status || ''}</td>
      </tr>
    `);
  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Hospital</th>
              <th>Blood Group</th>
              <th>Units</th>
              <th>Issued By</th>
              <th>Issue Date</th>
              <th>Purpose</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : '<tr><td colspan="7" class="text-center">No issue history found</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDonationHistoryTable() {
  const tableContainer = document.getElementById('donationHistoryTable');
  const search = document.getElementById('donationHistorySearch')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('donationHistoryStatusFilter')?.value || '';
  const rows = donationsList
    .filter((item) => {
      const term = `${item.donorName || ''} ${item.bloodGroup || ''} ${item.organizationName || ''}`.toLowerCase();
      return term.includes(search) && (!statusFilter || item.status === statusFilter);
    })
    .map((donation) => `
      <tr>
        <td>${donation.donorName || ''}</td>
        <td>${donation.bloodGroup || ''}</td>
        <td>${donation.units || 0}</td>
        <td>${formatDate(donation.createdAt, true)}</td>
        <td>${donation.organizationName || ''}</td>
        <td>${donation.status || ''}</td>
      </tr>
    `);
  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Donor</th>
              <th>Blood Group</th>
              <th>Units</th>
              <th>Date</th>
              <th>Organization</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : '<tr><td colspan="6" class="text-center">No donation history</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderInventoryHistoryTable() {
  const tableContainer = document.getElementById('inventoryHistoryTable');
  const search = document.getElementById('inventoryHistorySearch')?.value.toLowerCase() || '';
  const groupFilter = document.getElementById('inventoryHistoryGroupFilter')?.value || '';
  const rows = inventoryHistoryList
    .filter((item) => {
      const term = `${item.bloodGroup || ''} ${item.reason || ''} ${item.userId || ''}`.toLowerCase();
      return term.includes(search) && (!groupFilter || item.bloodGroup === groupFilter);
    })
    .map((record) => `
      <tr>
        <td>${record.bloodGroup || ''}</td>
        <td>${record.previousUnits || 0}</td>
        <td>${record.currentUnits || 0}</td>
        <td>${record.difference || 0}</td>
        <td>${record.reason || ''}</td>
        <td>${record.userId || ''}</td>
        <td>${formatDate(record.createdAt, true)}</td>
      </tr>
    `);
  tableContainer.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Blood Group</th>
              <th>Previous Units</th>
              <th>Current Units</th>
              <th>Difference</th>
              <th>Reason</th>
              <th>User</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>${rows.length ? rows.join('') : '<tr><td colspan="7" class="text-center">No inventory history found</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCharts() {
  const donationData = aggregateMonthlyCounts(donationsList, 'createdAt');
  const issueData = aggregateMonthlyCounts(issuesList, 'issueDate');
  const distributionData = bloodGroups.map((group) => ({ group, units: currentInventorySummary[group] || 0 }));

  renderChart('donationsChart', 'Monthly Donations', donationData.labels, donationData.values, 'rgba(193, 18, 31, 0.8)', 'bar');
  renderChart('issueTrendChart', 'Monthly Blood Issues', issueData.labels, issueData.values, 'rgba(46, 125, 50, 0.8)', 'line');
  renderChart('groupDistributionChart', 'Blood Group Distribution', distributionData.map((item) => item.group), distributionData.map((item) => item.units), undefined, 'pie');
}

function exportInventoryCSV() {
  const rows = [['Blood Group', 'Available Units']].concat(
    bloodGroups.map((group) => [group, currentInventorySummary[group] || 0])
  );
  downloadCSV('organization_inventory.csv', rows);
}

function exportDonationsCSV() {
  const rows = [['Donor Name', 'Blood Group', 'Units', 'Donation Date', 'Status', 'Organization']].concat(
    donationsList.map((donation) => [
      donation.donorName || 'Unknown',
      donation.bloodGroup || '',
      donation.units || 0,
      formatDate(donation.createdAt, true),
      donation.status || '',
      donation.organizationName || ''
    ])
  );
  downloadCSV('organization_donations.csv', rows);
}

function exportRequestsCSV() {
  const rows = [['Hospital', 'Blood Group', 'Units', 'Priority', 'Date', 'Status']].concat(
    requestsList.map((req) => [
      req.hospitalName || '',
      req.bloodGroup || '',
      req.units || 0,
      req.urgencyLevel || '',
      formatDate(req.createdAt, true),
      req.status || ''
    ])
  );
  downloadCSV('organization_requests.csv', rows);
}

function exportIssueHistoryCSV() {
  const rows = [['Hospital', 'Blood Group', 'Units', 'Issued By', 'Issue Date', 'Purpose', 'Status']].concat(
    issuesList.map((issue) => [
      issue.hospitalName || '',
      issue.bloodGroup || '',
      issue.units || 0,
      issue.issuedBy || '',
      formatDate(issue.issueDate, true),
      issue.purpose || '',
      issue.status || ''
    ])
  );
  downloadCSV('organization_issue_history.csv', rows);
}

function exportDonationHistoryCSV() {
  const rows = [['Donor', 'Blood Group', 'Units', 'Date', 'Organization', 'Status']].concat(
    donationsList.map((donation) => [
      donation.donorName || '',
      donation.bloodGroup || '',
      donation.units || 0,
      formatDate(donation.createdAt, true),
      donation.organizationName || '',
      donation.status || ''
    ])
  );
  downloadCSV('organization_donation_history.csv', rows);
}

function exportInventoryHistoryCSV() {
  const rows = [['Blood Group', 'Previous Units', 'Current Units', 'Difference', 'Reason', 'User', 'Date']].concat(
    inventoryHistoryList.map((record) => [
      record.bloodGroup || '',
      record.previousUnits || 0,
      record.currentUnits || 0,
      record.difference || 0,
      record.reason || '',
      record.userId || '',
      formatDate(record.createdAt, true)
    ])
  );
  downloadCSV('organization_inventory_history.csv', rows);
}

function exportInventoryExcel() {
  const rows = [['Blood Group', 'Available Units']].concat(
    bloodGroups.map((group) => [group, currentInventorySummary[group] || 0])
  );
  downloadExcel('organization_inventory.xls', rows);
}

function exportDonationsExcel() {
  const rows = [['Donor Name', 'Blood Group', 'Units', 'Donation Date', 'Status', 'Organization']].concat(
    donationsList.map((donation) => [
      donation.donorName || 'Unknown',
      donation.bloodGroup || '',
      donation.units || 0,
      formatDate(donation.createdAt, true),
      donation.status || '',
      donation.organizationName || ''
    ])
  );
  downloadExcel('organization_donations.xls', rows);
}

function exportRequestsExcel() {
  const rows = [['Hospital', 'Blood Group', 'Units', 'Priority', 'Date', 'Status']].concat(
    requestsList.map((req) => [
      req.hospitalName || '',
      req.bloodGroup || '',
      req.units || 0,
      req.urgencyLevel || '',
      formatDate(req.createdAt, true),
      req.status || ''
    ])
  );
  downloadExcel('organization_requests.xls', rows);
}

function exportIssueHistoryExcel() {
  const rows = [['Hospital', 'Blood Group', 'Units', 'Issued By', 'Issue Date', 'Purpose', 'Status']].concat(
    issuesList.map((issue) => [
      issue.hospitalName || '',
      issue.bloodGroup || '',
      issue.units || 0,
      issue.issuedBy || '',
      formatDate(issue.issueDate, true),
      issue.purpose || '',
      issue.status || ''
    ])
  );
  downloadExcel('organization_issue_history.xls', rows);
}

function exportDonationHistoryExcel() {
  const rows = [['Donor', 'Blood Group', 'Units', 'Date', 'Organization', 'Status']].concat(
    donationsList.map((donation) => [
      donation.donorName || '',
      donation.bloodGroup || '',
      donation.units || 0,
      formatDate(donation.createdAt, true),
      donation.organizationName || '',
      donation.status || ''
    ])
  );
  downloadExcel('organization_donation_history.xls', rows);
}

function exportInventoryHistoryExcel() {
  const rows = [['Blood Group', 'Previous Units', 'Current Units', 'Difference', 'Reason', 'User', 'Date']].concat(
    inventoryHistoryList.map((record) => [
      record.bloodGroup || '',
      record.previousUnits || 0,
      record.currentUnits || 0,
      record.difference || 0,
      record.reason || '',
      record.userId || '',
      formatDate(record.createdAt, true)
    ])
  );
  downloadExcel('organization_inventory_history.xls', rows);
}

function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadExcel(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function aggregateMonthlyCounts(items, dateField) {
  const months = Array.from({ length: 12 }, (_, index) => new Date(new Date().getFullYear(), index, 1).toLocaleString('default', { month: 'short' }));
  const values = new Array(12).fill(0);
  items.forEach((item) => {
    const value = item[dateField];
    if (!value) return;
    const timestamp = value.seconds ? value.seconds * 1000 : value.toMillis ? value.toMillis() : new Date(value).getTime();
    const date = new Date(timestamp);
    values[date.getMonth()] += 1;
  });
  return { labels: months, values };
}

function renderChart(elementId, label, labels, data, borderColor = 'rgba(193, 18, 31, 0.8)', type = 'bar') {
  const canvas = document.getElementById(elementId);
  if (!canvas) return;
  if (chartInstances[elementId]) {
    chartInstances[elementId].data.labels = labels;
    chartInstances[elementId].data.datasets[0].data = data;
    chartInstances[elementId].update();
    return;
  }

  const dataset = {
    label,
    data,
    backgroundColor: type === 'pie' ? labels.map((_, index) => `rgba(${50 + index * 20}, ${80 + index * 10}, ${150 - index * 10}, 0.8)`) : borderColor,
    borderColor: type === 'pie' ? 'transparent' : borderColor,
    borderWidth: 1,
    tension: 0.4,
    fill: type !== 'pie'
  };

  chartInstances[elementId] = new Chart(canvas, {
    type,
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: type === 'pie' }
      }
    }
  });
}

function formatDate(value, includeTime = false) {
  if (!value) return '-';
  const timestamp = value.seconds ? value.seconds * 1000 : value.toMillis ? value.toMillis() : new Date(value).getTime();
  const date = new Date(timestamp);
  if (includeTime) {
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString();
}

function isSameDay(dateValue, compareDate) {
  if (!dateValue) return false;
  const timestamp = dateValue.seconds ? dateValue.seconds * 1000 : dateValue.toMillis ? dateValue.toMillis() : new Date(dateValue).getTime();
  const date = new Date(timestamp);
  return date.getFullYear() === compareDate.getFullYear() &&
    date.getMonth() === compareDate.getMonth() &&
    date.getDate() === compareDate.getDate();
}

function loadSettings() {
  if (!currentOrganization) return;
  document.getElementById('settingsOrgName').value = currentOrganization.organizationName || '';
  document.getElementById('settingsPhone').value = currentOrganization.phone || '';
  document.getElementById('settingsAddress').value = currentOrganization.address || '';
  document.getElementById('settingsCity').value = currentOrganization.city || '';
}

document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const updateData = {
    organizationName: document.getElementById('settingsOrgName').value,
    phone: document.getElementById('settingsPhone').value,
    address: document.getElementById('settingsAddress').value,
    city: document.getElementById('settingsCity').value
  };
  try {
    const result = await authManager.updateProfile(currentOrganization.uid, updateData);
    if (result.success) {
      alert('Settings updated successfully!');
      location.reload();
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    alert('Failed to update settings');
  }
});

async function markAllNotificationsRead() {
  try {
    await bloodRequestManager.markAllNotificationsRead(currentOrganization.uid);
    await loadNotifications();
    alert('All notifications marked read.');
  } catch (error) {
    console.error('Error marking notifications read:', error);
    alert('Failed to update notifications.');
  }
}

async function clearNotifications() {
  if (!confirm('Clear all notifications?')) return;
  try {
    await bloodRequestManager.clearAllNotifications(currentOrganization.uid);
    await loadNotifications();
    alert('Notifications cleared.');
  } catch (error) {
    console.error('Error clearing notifications:', error);
    alert('Failed to clear notifications.');
  }
}

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}

document.getElementById('addBloodModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('addBloodModal')) {
    closeAddBloodModal();
  }
});

document.getElementById('inventoryActionModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('inventoryActionModal')) {
    closeInventoryActionModal();
  }
});

document.getElementById('requestDetailsModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('requestDetailsModal')) {
    closeRequestDetailsModal();
  }
});

document.getElementById('inventoryActionForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const group = document.getElementById('inventoryActionGroup').value;
  const type = document.getElementById('inventoryActionType').value;
  const units = parseInt(document.getElementById('inventoryActionUnits').value, 10);
  const expiryDate = document.getElementById('inventoryActionExpiryDate').value;
  const notes = document.getElementById('inventoryActionNotes').value.trim();

  if (!group || !units || units <= 0) {
    alert('Please enter a valid blood group and units.');
    return;
  }

  try {
    if (type === 'increase') {
      await bloodInventoryManager.addBlood(currentOrganization.uid, {
        bloodGroup: group,
        units,
        collectionDate: new Date().toISOString().split('T')[0],
        expiryDate,
        donorId: null,
        storageLocation: '',
        notes
      });
    } else {
      const success = await deductInventory(group, units);
      if (!success) {
        alert('Not enough units available to decrease.');
        return;
      }
      await addDoc(collection(db, 'inventoryHistory'), {
        organizationId: currentOrganization.uid,
        bloodGroup: group,
        previousUnits: (currentInventorySummary?.[group] || 0) + units,
        currentUnits: Math.max((currentInventorySummary?.[group] || 0) - units, 0),
        difference: -units,
        reason: notes || 'Manual decrease',
        userId: currentOrganization.uid,
        createdAt: new Date()
      });
    }
    closeInventoryActionModal();
    await refreshAllData();
    alert('Inventory updated successfully.');
  } catch (error) {
    console.error('Error adjusting inventory:', error);
    alert('Failed to adjust inventory.');
  }
});

document.getElementById('addBloodForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const bloodGroup = document.getElementById('bloodGroupSelect').value;
  const units = parseInt(document.getElementById('unitsInput').value, 10);
  const collectionDate = document.getElementById('collectionDateInput').value;
  const expiryDate = document.getElementById('expiryDateInput').value;
  const donorId = document.getElementById('donorSelect').value || null;
  const storageLocation = document.getElementById('storageLocationInput').value.trim();
  const notes = document.getElementById('notesInput').value.trim();

  if (!bloodGroup || !units || units <= 0 || !collectionDate || !expiryDate || !storageLocation) {
    alert('Please fill in all required fields.');
    return;
  }

  try {
    const result = await bloodInventoryManager.addBlood(currentOrganization.uid, {
      bloodGroup,
      units,
      collectionDate,
      expiryDate,
      donorId,
      storageLocation,
      notes,
      organizationName: currentOrganization.organizationName || ''
    });
    if (result.success) {
      alert('Blood added successfully!');
      closeAddBloodModal();
      document.getElementById('addBloodForm').reset();
      await refreshAllData();
    }
  } catch (error) {
    console.error('Error adding blood:', error);
    alert('Failed to add blood');
  }
});

// Platform styling additions
const addStyles = () => {
  const style = document.createElement('style');
  style.textContent = `
    .inventory-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .inventory-item { background-color: var(--bg-color); padding: 15px; border-radius: 8px; text-align: center; }
    .inventory-group { font-weight: 600; font-size: 18px; color: var(--primary-color); margin-bottom: 5px; }
    .inventory-units { font-size: 14px; color: var(--text-light); }
    .inventory-progress-grid { display: grid; gap: 10px; margin-top: 20px; }
    .progress-group { display: grid; gap: 6px; }
    .progress-group-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-light); }
    .progress-bar-shell { background-color: var(--border-color); border-radius: 999px; height: 10px; overflow: hidden; }
    .progress-bar-fill { height: 100%; background: linear-gradient(90deg, var(--primary-color), var(--secondary-color)); border-radius: 999px; }
    .dashboard-highlight-grid { display: grid; gap: 20px; grid-template-columns: minmax(260px, 1fr) minmax(260px, 1fr); margin-bottom: 20px; }
    .quick-actions-panel { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .summary-metrics-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(120px, 1fr)); }
    .summary-metric { background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; text-align: left; }
    .summary-metric h4 { margin: 0 0 5px; color: var(--primary-color); }
    .dashboard-sidebar-grid { display: grid; gap: 20px; grid-template-columns: repeat(3, minmax(200px, 1fr)); margin-bottom: 20px; }
    .compact-table th, .compact-table td { padding: 10px 12px; font-size: 13px; }
    .notification-preview-item, .activity-item { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--border-color); }
    .notification-preview-item:last-child, .activity-item:last-child { border-bottom: none; }
    .notification-preview-item.unread { background-color: rgba(193, 18, 31, 0.05); }
    .activity-type { font-size: 11px; text-transform: uppercase; padding: 5px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.05); color: var(--text-color); }
    .activity-donation { background: rgba(193, 18, 31, 0.08); color: var(--danger-color); }
    .activity-issue { background: rgba(46, 125, 50, 0.08); color: var(--success-color); }
    .activity-request { background: rgba(33, 150, 243, 0.08); color: var(--primary-color); }
    .activity-inventory { background: rgba(255, 193, 7, 0.08); color: var(--warning-color); }
    .activity-notification { background: rgba(156, 39, 176, 0.08); color: var(--secondary-color); }
    @media (max-width: 1024px) { .dashboard-sidebar-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 768px) { .dashboard-highlight-grid, .dashboard-sidebar-grid { grid-template-columns: 1fr; } }
    .modal.show { display: flex; }
    .modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
    .details-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    .details-grid > div { padding: 8px 0; }
    .notification-item.unread { background: rgba(242, 242, 247, 0.9); }
  `;
  document.head.appendChild(style);
};
addStyles();
