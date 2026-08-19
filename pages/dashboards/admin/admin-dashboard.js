import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { authManager } from '../../../assets/js/auth.js';
import { bloodRequestManager } from '../../../assets/js/requests.js';
import { db } from '../../../assets/js/firebase-config.js';

let currentAdmin = null;
let notificationsListener = null;
let donorsList = [];
let hospitalsList = [];
let organizationsList = [];
let usersList = [];
let allInventoryItems = [];
let allInventoryLogs = [];
let allRequests = [];
let allDonations = [];
let adminNotifications = [];
let adminInventoryPage = 1;
const adminInventoryPageSize = 8;
const chartInstances = {};

const viewSelectors = {
  dashboard: 'dashboardView',
  donors: 'donorsView',
  organizations: 'organizationsView',
  hospitals: 'hospitalsView',
  notifications: 'notificationsView',
  sendNotification: 'sendNotificationView',
  contactMessages: 'contactMessagesView',
  inventory: 'inventoryView',
  analytics: 'analyticsView',
  settings: 'settingsView'
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadAdmin();
  setupNavigation();
  setupActionHandlers();
  setupNotificationHandlers();
  setupInventoryControls();
  setupAnalyticsControls();
  setupRealtimeListeners();
  showView('dashboard');
  await loadDashboardData();
});

async function checkAuthAndLoadAdmin() {
  const user = await authManager.getCurrentUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '../../auth/login.html';
    return;
  }
  currentAdmin = user.data;

  if (notificationsListener) notificationsListener();
  notificationsListener = bloodRequestManager.listenNotifications(currentAdmin.uid, (result) => {
    if (!result.success) return;
    adminNotifications = result.data || [];
    const unreadCount = adminNotifications.filter((item) => !item.isRead).length;
    updateAdminNotificationBadges(unreadCount);
    if (document.getElementById('notificationsView') && !document.getElementById('notificationsView').classList.contains('hidden')) {
      displayAdminNotifications(adminNotifications);
    }
  });
}

function setupRealtimeListeners() {
  // Listen for inventory items
  onSnapshot(collection(db, 'bloodInventory'), (snapshot) => {
    allInventoryItems = [];
    snapshot.forEach((docSnap) => {
      allInventoryItems.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAdminInventory();
    renderAdminAnalytics();
  });

  // Listen for inventory history logs
  onSnapshot(collection(db, 'inventoryHistory'), (snapshot) => {
    allInventoryLogs = [];
    snapshot.forEach((docSnap) => {
      allInventoryLogs.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAdminInventoryLogs();
  });

  // Listen for blood requests
  onSnapshot(collection(db, 'bloodRequests'), (snapshot) => {
    allRequests = [];
    snapshot.forEach((docSnap) => {
      allRequests.push({ id: docSnap.id, ...docSnap.data() });
    });
    const pendingElem = document.getElementById('totalPendingRequests');
    if (pendingElem) pendingElem.textContent = allRequests.filter(r => r.status === 'Pending').length;
    renderAdminInventory();
    renderAdminAnalytics();
  });

  // Listen for donations
  onSnapshot(collection(db, 'donations'), (snapshot) => {
    allDonations = [];
    snapshot.forEach((docSnap) => {
      allDonations.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAdminAnalytics();
  });
}

async function loadDashboardData() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    document.getElementById('totalUsers').textContent = usersSnapshot.size;
    usersList = [];
    usersSnapshot.forEach((docSnap) => {
      usersList.push({ id: docSnap.id, ...docSnap.data() });
    });

    const donorsSnapshot = await getDocs(collection(db, 'donors'));
    document.getElementById('totalDonors').textContent = donorsSnapshot.size;
    donorsList = [];
    donorsSnapshot.forEach((docSnap) => {
      donorsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    const hospitalsSnapshot = await getDocs(collection(db, 'hospitals'));
    document.getElementById('totalHospitals').textContent = hospitalsSnapshot.size;
    hospitalsList = [];
    hospitalsSnapshot.forEach((docSnap) => {
      hospitalsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    const orgsSnapshot = await getDocs(collection(db, 'organizations'));
    document.getElementById('totalOrganizations').textContent = orgsSnapshot.size;
    organizationsList = [];
    orgsSnapshot.forEach((docSnap) => {
      organizationsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();

    await loadDonorsData(donorsSnapshot);
    await loadOrganizationsData(orgsSnapshot);
    await loadHospitalsData(hospitalsSnapshot);

    if (document.getElementById('sendNotificationView')?.classList.contains('hidden') === false) {
      populateRecipientSelector(document.getElementById('recipientType')?.value || 'specificDonor');
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

async function loadDonorsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>Blood Group</th><th>City</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  snapshot.forEach((docSnap) => {
    const donor = docSnap.data();
    const uid = donor.uid || docSnap.id;
    const donorStatus = getDonorStatus(donor);
    const statusBadgeClass = getStatusBadgeClass(donorStatus);
    const isApproved = donor.isApproved === true;

    html += `
      <tr>
        <td>${donor.fullName || ''}</td>
        <td>${donor.email || ''}</td>
        <td>${donor.bloodGroup || 'N/A'}</td>
        <td>${donor.city || ''}</td>
        <td><span class="badge ${statusBadgeClass}">${donorStatus}</span></td>
        <td>
          ${!isApproved ? `<button class="btn btn-sm btn-primary" data-action="approve-donor" data-user-id="${uid}">Approve</button> <button class="btn btn-sm btn-danger" data-action="reject-donor" data-user-id="${uid}">Reject</button>` : ''}
          <button class="btn btn-sm btn-secondary" data-action="view-donor" data-user-id="${uid}">View</button>
          <button class="btn btn-sm btn-secondary" data-action="delete-donor" data-user-id="${uid}">Delete</button>
        </td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  document.getElementById('donorsList').innerHTML = html;
}

function getDonorStatus(donor) {
  if (typeof donor.status === 'string' && donor.status.trim()) return normalizeStatus(donor.status);
  if (typeof donor.isApproved === 'boolean') return donor.isApproved ? 'Approved' : 'Pending';
  if (typeof donor.isEligible === 'boolean') return donor.isEligible ? 'Pending' : 'Rejected';
  return 'Pending';
}

function normalizeStatus(status) {
  const normalized = status.toString().trim().toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'rejected') return 'Rejected';
  return status.toString();
}

function getStatusBadgeClass(status) {
  if (status === 'Approved') return 'badge-success';
  if (status === 'Pending') return 'badge-warning';
  if (status === 'Rejected') return 'badge-danger';
  return 'badge-primary';
}

function getEntityStatus(entity) {
  if (typeof entity.status === 'string' && entity.status.trim()) return normalizeStatus(entity.status);
  if (typeof entity.isApproved === 'boolean') return entity.isApproved ? 'Approved' : 'Pending';
  return 'Pending';
}

async function loadOrganizationsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>City</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  snapshot.forEach((docSnap) => {
    const org = docSnap.data();
    const status = getEntityStatus(org);
    const statusBadgeClass = getStatusBadgeClass(status);
    const needsAction = status !== 'Approved';

    html += `
      <tr>
        <td>${org.organizationName || ''}</td>
        <td>${org.email || ''}</td>
        <td>${org.city || ''}</td>
        <td><span class="badge ${statusBadgeClass}">${status}</span></td>
        <td>
          ${needsAction ? `<button class="btn btn-sm btn-primary" data-action="approve-org" data-user-id="${org.uid}">Approve</button> <button class="btn btn-sm btn-danger" data-action="reject-org" data-user-id="${org.uid}">Reject</button>` : ''}
          <button class="btn btn-sm btn-secondary" data-action="view-org" data-user-id="${org.uid}">View</button>
          <button class="btn btn-sm btn-secondary" data-action="delete-org" data-user-id="${org.uid}">Delete</button>
        </td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  document.getElementById('organizationsList').innerHTML = html;
}

async function loadHospitalsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>City</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  snapshot.forEach((docSnap) => {
    const hospital = docSnap.data();
    const status = getEntityStatus(hospital);
    const statusBadgeClass = getStatusBadgeClass(status);
    const needsAction = status !== 'Approved';

    html += `
      <tr>
        <td>${hospital.hospitalName || ''}</td>
        <td>${hospital.email || ''}</td>
        <td>${hospital.city || ''}</td>
        <td><span class="badge ${statusBadgeClass}">${status}</span></td>
        <td>
          ${needsAction ? `<button class="btn btn-sm btn-primary" data-action="approve-hospital" data-user-id="${hospital.uid}">Approve</button> <button class="btn btn-sm btn-danger" data-action="reject-hospital" data-user-id="${hospital.uid}">Reject</button>` : ''}
          <button class="btn btn-sm btn-secondary" data-action="view-hospital" data-user-id="${hospital.uid}">View</button>
          <button class="btn btn-sm btn-secondary" data-action="delete-hospital" data-user-id="${hospital.uid}">Delete</button>
        </td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  document.getElementById('hospitalsList').innerHTML = html;
}

/* ==========================================================================
   2. ADMIN BLOOD INVENTORY MODULE
   ========================================================================== */

function setupInventoryControls() {
  document.getElementById('adminInventorySearch')?.addEventListener('input', renderAdminInventory);
  document.getElementById('adminInventoryGroupFilter')?.addEventListener('change', renderAdminInventory);
  document.getElementById('adminInventoryStatusFilter')?.addEventListener('change', renderAdminInventory);
  document.getElementById('adminInventorySort')?.addEventListener('change', renderAdminInventory);
  document.getElementById('exportAdminInventoryBtn')?.addEventListener('click', exportAdminInventoryCSV);
}

function renderAdminInventory() {
  const now = new Date();

  const groupStats = bloodGroups.reduce((acc, bg) => {
    acc[bg] = { total: 0, available: 0, reserved: 0, expired: 0, lastUpdated: null };
    return acc;
  }, {});

  allInventoryItems.forEach((item) => {
    const bg = item.bloodGroup;
    if (!groupStats[bg]) groupStats[bg] = { total: 0, available: 0, reserved: 0, expired: 0, lastUpdated: null };

    const units = Number(item.units) || 0;
    groupStats[bg].total += units;

    const expDate = item.expiryDate?.seconds ? new Date(item.expiryDate.seconds * 1000) : (item.expiryDate ? new Date(item.expiryDate) : null);
    const isExpired = item.status === 'Expired' || (expDate && expDate < now);

    if (isExpired) {
      groupStats[bg].expired += units;
    } else if (item.status === 'Reserved') {
      groupStats[bg].reserved += units;
    } else {
      groupStats[bg].available += units;
    }

    const updated = item.updatedAt?.seconds ? new Date(item.updatedAt.seconds * 1000) : (item.updatedAt ? new Date(item.updatedAt) : null);
    if (updated && (!groupStats[bg].lastUpdated || updated > groupStats[bg].lastUpdated)) {
      groupStats[bg].lastUpdated = updated;
    }
  });

  allRequests.forEach(req => {
    if (req.status === 'Approved' && groupStats[req.bloodGroup]) {
      groupStats[req.bloodGroup].reserved += (Number(req.units) || 0);
    }
  });

  // Summary Metrics
  const totalUnitsSum = Object.values(groupStats).reduce((sum, g) => sum + g.total, 0);
  const activeGroupsCount = Object.values(groupStats).filter((g) => g.total > 0).length;
  const lowStockCount = Object.values(groupStats).filter((g) => g.total > 0 && g.total < 10).length;
  const expiredUnitsSum = Object.values(groupStats).reduce((sum, g) => sum + g.expired, 0);

  if (document.getElementById('adminTotalUnits')) document.getElementById('adminTotalUnits').textContent = totalUnitsSum;
  if (document.getElementById('adminTotalGroups')) document.getElementById('adminTotalGroups').textContent = activeGroupsCount;
  if (document.getElementById('adminLowStockTypes')) document.getElementById('adminLowStockTypes').textContent = lowStockCount;
  if (document.getElementById('adminExpiredUnits')) document.getElementById('adminExpiredUnits').textContent = expiredUnitsSum;

  // Filter & Search Logic
  const searchTerm = (document.getElementById('adminInventorySearch')?.value || '').trim().toLowerCase();
  const groupFilter = document.getElementById('adminInventoryGroupFilter')?.value || '';
  const statusFilter = document.getElementById('adminInventoryStatusFilter')?.value || '';
  const sortOption = document.getElementById('adminInventorySort')?.value || 'desc';

  let rows = bloodGroups.map((bg) => {
    const data = groupStats[bg];
    let status = 'In Stock';
    let statusClass = 'badge-stock-available';
    if (data.total === 0) {
      status = 'Out of Stock';
      statusClass = 'badge-stock-out';
    } else if (data.total < 10) {
      status = 'Low Stock';
      statusClass = 'badge-stock-low';
    }
    return { bloodGroup: bg, ...data, status, statusClass };
  });

  // Apply filters
  if (searchTerm) {
    rows = rows.filter((r) => r.bloodGroup.toLowerCase().includes(searchTerm));
  }
  if (groupFilter) {
    rows = rows.filter((r) => r.bloodGroup === groupFilter);
  }
  if (statusFilter) {
    if (statusFilter === 'Available') rows = rows.filter((r) => r.status === 'In Stock');
    else if (statusFilter === 'Low Stock') rows = rows.filter((r) => r.status === 'Low Stock');
    else if (statusFilter === 'Out of Stock') rows = rows.filter((r) => r.status === 'Out of Stock');
  }

  // Sort
  rows.sort((a, b) => sortOption === 'asc' ? a.total - b.total : b.total - a.total);

  const totalPages = Math.max(1, Math.ceil(rows.length / adminInventoryPageSize));
  adminInventoryPage = Math.min(adminInventoryPage, totalPages);
  const startIndex = (adminInventoryPage - 1) * adminInventoryPageSize;
  const paginatedRows = rows.slice(startIndex, startIndex + adminInventoryPageSize);

  const tableContainer = document.getElementById('adminInventoryTable');
  if (tableContainer) {
    if (!rows.length) {
      tableContainer.innerHTML = '<p class="empty-state">No inventory records matching filters.</p>';
    } else {
      tableContainer.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>Blood Group</th>
              <th>Total Units</th>
              <th>Available Units</th>
              <th>Reserved Units</th>
              <th>Expired Units</th>
              <th>Last Updated</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${paginatedRows.map((r) => `
              <tr>
                <td><strong>${r.bloodGroup}</strong></td>
                <td>${r.total}</td>
                <td>${r.available}</td>
                <td>${r.reserved}</td>
                <td>${r.expired}</td>
                <td>${r.lastUpdated ? r.lastUpdated.toLocaleDateString() : 'N/A'}</td>
                <td><span class="badge ${r.statusClass}">${r.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="table-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <span>Page ${adminInventoryPage} of ${totalPages}</span>
          <div>
            <button type="button" class="btn btn-secondary btn-sm" data-admin-inventory-page="prev" ${adminInventoryPage <= 1 ? 'disabled' : ''}>Previous</button>
            <button type="button" class="btn btn-secondary btn-sm" data-admin-inventory-page="next" ${adminInventoryPage >= totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      `;

      tableContainer.querySelectorAll('[data-admin-inventory-page]').forEach((button) => {
        button.addEventListener('click', () => {
          const direction = button.dataset.adminInventoryPage;
          if (direction === 'prev') adminInventoryPage = Math.max(1, adminInventoryPage - 1);
          if (direction === 'next') adminInventoryPage = Math.min(totalPages, adminInventoryPage + 1);
          renderAdminInventory();
        });
      });
    }
  }

  // Render Low Stock Alerts
  const lowStockContainer = document.getElementById('adminLowStockAlerts');
  if (lowStockContainer) {
    const lowGroups = rows.filter((r) => r.total < 10);
    if (!lowGroups.length) {
      lowStockContainer.innerHTML = '<p class="empty-state">All blood groups are in healthy stock levels (>= 10 units).</p>';
    } else {
      lowStockContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px;">
          ${lowGroups.map((g) => `
            <div class="card" style="border-left: 4px solid var(--warning-color); padding: 15px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h4>Blood Group ${g.bloodGroup}</h4>
                <span class="badge ${g.statusClass}">${g.status}</span>
              </div>
              <p style="margin: 8px 0 0 0; color: #555;">Current Stock: <strong>${g.total} units</strong></p>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // Render Charts
  renderAdminInventoryCharts(groupStats);
}

function renderAdminInventoryCharts(groupStats) {
  const labels = bloodGroups;
  const totalData = labels.map((bg) => groupStats[bg].total);
  const availableData = labels.map((bg) => groupStats[bg].available);
  const reservedData = labels.map((bg) => groupStats[bg].reserved);

  renderChart('adminInventoryDistChart', 'Blood Group Distribution', labels, totalData, null, 'pie');

  // Available vs Reserved Bar Chart
  const ctx2 = document.getElementById('adminInventoryReserveChart')?.getContext('2d');
  if (ctx2) {
    if (chartInstances['adminInventoryReserveChart']) {
      chartInstances['adminInventoryReserveChart'].destroy();
    }
    chartInstances['adminInventoryReserveChart'] = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Available', data: availableData, backgroundColor: '#2E7D32', borderRadius: 6, maxBarThickness: 35 },
          { label: 'Reserved', data: reservedData, backgroundColor: '#F57C00', borderRadius: 6, maxBarThickness: 35 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        animation: { duration: 1000, easing: 'easeOutQuart' },
        layout: { padding: { top: 8, right: 10, bottom: 8, left: 10 } },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              padding: 10,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 11, weight: '600', family: "'Outfit', 'Inter', sans-serif" },
              color: '#2B2D42'
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#1E293B',
            titleColor: '#FFFFFF',
            bodyColor: '#F8FAFC',
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13, weight: '500' },
            padding: 12,
            boxPadding: 6,
            cornerRadius: 8,
            callbacks: {
              label: function(context) {
                return ` ${context.dataset.label}: ${context.raw} units`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, color: '#64748B' } },
          y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.8)' }, ticks: { font: { size: 12, weight: '500' }, color: '#64748B', precision: 0 } }
        }
      }
    });
  }
}

function renderAdminInventoryLogs() {
  const container = document.getElementById('adminInventoryLogsTable');
  if (!container) return;

  if (!allInventoryLogs.length) {
    container.innerHTML = '<p class="empty-state">No inventory change logs recorded yet.</p>';
    return;
  }

  const logs = [...allInventoryLogs].sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt)).slice(0, 20);

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Blood Group</th>
          <th>Updated By</th>
          <th>Previous Qty</th>
          <th>New Qty</th>
          <th>Reason / Action</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map((log) => {
          const date = log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000) : new Date(log.createdAt || Date.now());
          return `
            <tr>
              <td>${date.toLocaleString()}</td>
              <td><strong>${log.bloodGroup || '-'}</strong></td>
              <td>${log.updatedByName || log.updatedBy || 'Organization'}</td>
              <td>${log.previousQuantity ?? '-'}</td>
              <td>${log.newQuantity ?? '-'}</td>
              <td>${log.reason || log.action || 'Stock update'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function exportAdminInventoryCSV() {
  if (!allInventoryItems.length) {
    alert('No inventory items to export.');
    return;
  }
  const headers = ['ID', 'Blood Group', 'Units', 'Status', 'Organization ID', 'Expiry Date'];
  const rows = allInventoryItems.map((item) => [
    item.id,
    item.bloodGroup,
    item.units,
    item.status,
    item.organizationId,
    item.expiryDate?.seconds ? new Date(item.expiryDate.seconds * 1000).toLocaleDateString() : (item.expiryDate || 'N/A')
  ]);
  downloadCSV('admin_blood_inventory.csv', [headers, ...rows]);
}

/* ==========================================================================
   3. ADMIN ANALYTICS MODULE
   ========================================================================== */

function setupAnalyticsControls() {
  document.getElementById('analyticsDateFilter')?.addEventListener('change', renderAdminAnalytics);
  document.getElementById('analyticsCustomDateFrom')?.addEventListener('change', renderAdminAnalytics);
  document.getElementById('analyticsCustomDateTo')?.addEventListener('change', renderAdminAnalytics);
  document.getElementById('exportAnalyticsCsvBtn')?.addEventListener('click', exportAnalyticsCSV);
  document.getElementById('printAnalyticsPdfBtn')?.addEventListener('click', () => window.print());
}

function renderAdminAnalytics() {
  const filter = document.getElementById('analyticsDateFilter')?.value || 'all';
  const customFrom = document.getElementById('analyticsCustomDateFrom')?.value || '';
  const customTo = document.getElementById('analyticsCustomDateTo')?.value || '';
  const now = new Date();

  const filterFn = (itemDate) => {
    if (!itemDate) return true;
    const date = itemDate.seconds ? new Date(itemDate.seconds * 1000) : new Date(itemDate);
    if (isNaN(date.getTime())) return true;

    if (filter === 'all') return true;
    if (filter === 'today') return isSameDay(date, now);
    if (filter === '7days') return (now - date) <= (7 * 24 * 60 * 60 * 1000);
    if (filter === 'month') return (now - date) <= (30 * 24 * 60 * 60 * 1000);
    if (filter === 'year') return (now - date) <= (365 * 24 * 60 * 60 * 1000);
    if (filter === 'custom') {
      const start = customFrom ? new Date(customFrom) : null;
      const end = customTo ? new Date(customTo) : null;
      if (start && end) {
        const endExclusive = new Date(end);
        endExclusive.setHours(23, 59, 59, 999);
        return date >= start && date <= endExclusive;
      }
      if (start) return date >= start;
      if (end) return date <= new Date(end);
      return true;
    }
    return true;
  };

  const filteredDonations = allDonations.filter((d) => filterFn(d.createdAt));
  const filteredRequests = allRequests.filter((r) => filterFn(r.createdAt));

  // Summary Metrics
  if (document.getElementById('analyticsTotalDonors')) document.getElementById('analyticsTotalDonors').textContent = donorsList.length;
  if (document.getElementById('analyticsTotalHospitals')) document.getElementById('analyticsTotalHospitals').textContent = hospitalsList.length;
  if (document.getElementById('analyticsTotalOrgs')) document.getElementById('analyticsTotalOrgs').textContent = organizationsList.length;

  const totalUnits = allInventoryItems.reduce((sum, i) => sum + (Number(i.units) || 0), 0);
  if (document.getElementById('analyticsTotalUnits')) document.getElementById('analyticsTotalUnits').textContent = totalUnits;
  if (document.getElementById('analyticsTotalRequests')) document.getElementById('analyticsTotalRequests').textContent = filteredRequests.length;

  const completed = filteredRequests.filter((r) => r.status === 'Completed').length;
  const pending = filteredRequests.filter((r) => r.status === 'Pending').length;
  const rejected = filteredRequests.filter((r) => r.status === 'Rejected').length;

  if (document.getElementById('analyticsCompletedRequests')) document.getElementById('analyticsCompletedRequests').textContent = completed;
  if (document.getElementById('analyticsPendingRequests')) document.getElementById('analyticsPendingRequests').textContent = pending;
  if (document.getElementById('analyticsRejectedRequests')) document.getElementById('analyticsRejectedRequests').textContent = rejected;

  // Statistics Calculations
  const requestGroupCounts = {};
  filteredRequests.forEach((r) => {
    if (r.bloodGroup) requestGroupCounts[r.bloodGroup] = (requestGroupCounts[r.bloodGroup] || 0) + 1;
  });

  const sortedReqGroups = Object.entries(requestGroupCounts).sort((a, b) => b[1] - a[1]);
  const mostReq = sortedReqGroups.length ? sortedReqGroups[0][0] : '-';
  const leastReq = sortedReqGroups.length ? sortedReqGroups[sortedReqGroups.length - 1][0] : '-';

  const donationGroupCounts = {};
  filteredDonations.forEach((d) => {
    if (d.bloodGroup) donationGroupCounts[d.bloodGroup] = (donationGroupCounts[d.bloodGroup] || 0) + 1;
  });
  const sortedDonGroups = Object.entries(donationGroupCounts).sort((a, b) => b[1] - a[1]);
  const topDonating = sortedDonGroups.length ? sortedDonGroups[0][0] : '-';

  const utilizationRate = filteredRequests.length ? Math.round((completed / filteredRequests.length) * 100) : 0;

  if (document.getElementById('mostRequestedGroup')) document.getElementById('mostRequestedGroup').textContent = mostReq;
  if (document.getElementById('leastRequestedGroup')) document.getElementById('leastRequestedGroup').textContent = leastReq;
  if (document.getElementById('topDonatingGroup')) document.getElementById('topDonatingGroup').textContent = topDonating;
  if (document.getElementById('bloodUtilizationRate')) document.getElementById('bloodUtilizationRate').textContent = `${utilizationRate}%`;

  // Render Charts
  renderAnalyticsCharts(filteredDonations, filteredRequests);

  // Render Timeline
  renderAnalyticsTimeline();
}

function renderAnalyticsCharts(filteredDonations, filteredRequests) {
  const donationData = aggregateMonthlyCounts(filteredDonations, 'createdAt');
  const requestData = aggregateMonthlyCounts(filteredRequests, 'createdAt');

  renderChart('monthlyDonationsChart', 'Monthly Donations', donationData.labels, donationData.values, 'rgba(193, 18, 31, 0.8)', 'line');
  renderChart('monthlyRequestsChart', 'Monthly Requests', requestData.labels, requestData.values, 'rgba(245, 124, 0, 0.8)', 'bar');

  // Distribution chart
  const groupCounts = bloodGroups.map((bg) => allInventoryItems.filter((i) => i.bloodGroup === bg).reduce((sum, i) => sum + (Number(i.units) || 0), 0));
  renderChart('analyticsDistChart', 'Blood Group Distribution', bloodGroups, groupCounts, ['#D32F2F', '#E53935', '#F57C00', '#FB8C00', '#7B1FA2', '#6A1B9A', '#2E7D32', '#388E3C'], 'doughnut');

  // Donation Trends
  renderChart('donationTrendsChart', 'Donation Trends', donationData.labels, donationData.values, 'rgba(46, 125, 50, 0.8)', 'line');

  // Hospital Requests Trend
  renderChart('hospitalTrendsChart', 'Hospital Requests Trend', requestData.labels, requestData.values, 'rgba(0, 150, 136, 0.8)', 'line');

  // Org performance chart
  const orgNames = organizationsList.slice(0, 6).map((o) => o.organizationName || 'Org');
  const orgUnits = organizationsList.slice(0, 6).map((o) => allInventoryItems.filter((i) => i.organizationId === (o.uid || o.id)).reduce((sum, i) => sum + (Number(i.units) || 0), 0));
  renderChart('orgPerformanceChart', 'Organization Units Managed', orgNames.length ? orgNames : ['No Data'], orgUnits.length ? orgUnits : [0], 'rgba(123, 31, 162, 0.8)', 'bar');
}

function renderAnalyticsTimeline() {
  const container = document.getElementById('analyticsTimeline');
  if (!container) return;

  const events = [];
  allRequests.slice(-5).reverse().forEach((r) => {
    events.push({ title: `Hospital Request: ${r.hospitalName || 'Hospital'} (${r.bloodGroup}, ${r.units} units)`, time: r.createdAt, type: 'request' });
  });
  allDonations.slice(-5).reverse().forEach((d) => {
    events.push({ title: `Donor Donation: ${d.donorName || 'Donor'} (${d.bloodGroup})`, time: d.createdAt, type: 'donation' });
  });
  donorsList.slice(-3).reverse().forEach((d) => {
    events.push({ title: `New Donor Registered: ${d.fullName || 'Donor'}`, time: d.createdAt || d.registeredAt, type: 'user' });
  });

  events.sort((a, b) => getTimestamp(b.time) - getTimestamp(a.time));
  const timelineItems = events.slice(0, 8);

  if (!timelineItems.length) {
    container.innerHTML = '<p class="empty-state">No recent activity events recorded.</p>';
    return;
  }

  container.innerHTML = timelineItems.map((ev) => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <strong>${ev.title}</strong>
        <div class="timeline-time">${formatDate(ev.time, true)}</div>
      </div>
    </div>
  `).join('');
}

function exportAnalyticsCSV() {
  const headers = ['Metric', 'Value'];
  const rows = [
    ['Total Donors', donorsList.length],
    ['Total Hospitals', hospitalsList.length],
    ['Total Organizations', organizationsList.length],
    ['Total Blood Units', allInventoryItems.reduce((sum, i) => sum + (Number(i.units) || 0), 0)],
    ['Total Requests', allRequests.length],
    ['Completed Requests', allRequests.filter(r => r.status === 'Completed').length],
    ['Pending Requests', allRequests.filter(r => r.status === 'Pending').length],
    ['Rejected Requests', allRequests.filter(r => r.status === 'Rejected').length]
  ];
  downloadCSV('admin_analytics_summary.csv', [headers, ...rows]);
}

/* ==========================================================================
   NAVIGATION & VIEW SWITCHING
   ========================================================================== */

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

  if (view === 'inventory') renderAdminInventory();
  if (view === 'analytics') renderAdminAnalytics();
  if (view === 'sendNotification') populateRecipientSelector(document.getElementById('recipientType')?.value || 'specificDonor');
  if (view === 'notifications') {
    markAdminNotificationsRead();
  }
}

function setupActionHandlers() {
  document.querySelectorAll('.dashboard-container').forEach((container) => {
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      event.preventDefault();

      const action = button.dataset.action;
      if (action === 'clear-notifications') {
        if (confirm('Are you sure you want to clear all notifications?')) {
          await bloodRequestManager.clearAllNotifications(currentAdmin.uid);
        }
        return;
      }

      const uid = button.dataset.userId;
      if (!uid) return;

      if (action === 'delete-donor') await deleteDonor(uid);
      else if (action === 'view-donor') viewDonor(uid);
      else if (action === 'approve-donor') await approveDonor(uid);
      else if (action === 'reject-donor') await rejectDonor(uid);
      else if (action === 'approve-org') await approveOrg(uid);
      else if (action === 'reject-org') await rejectOrg(uid);
      else if (action === 'delete-org') await deleteOrg(uid);
      else if (action === 'view-org') viewOrg(uid);
      else if (action === 'approve-hospital') await approveHospital(uid);
      else if (action === 'reject-hospital') await rejectHospital(uid);
      else if (action === 'delete-hospital') await deleteHospital(uid);
      else if (action === 'view-hospital') viewHospital(uid);
    });
  });
}

async function approveDonor(uid) {
  try {
    await updateDoc(doc(db, 'donors', uid), { isApproved: true, status: 'Approved' });
    alert('Donor approved successfully.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to approve donor: ' + err.message);
  }
}

async function rejectDonor(uid) {
  try {
    await updateDoc(doc(db, 'donors', uid), { isApproved: false, status: 'Rejected' });
    alert('Donor rejected.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to reject donor: ' + err.message);
  }
}

async function deleteDonor(uid) {
  if (!confirm('Are you sure you want to delete this donor?')) return;
  try {
    await deleteDoc(doc(db, 'donors', uid));
    alert('Donor deleted.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to delete donor: ' + err.message);
  }
}

async function approveOrg(uid) {
  try {
    await updateDoc(doc(db, 'organizations', uid), { isApproved: true, status: 'Approved' });
    alert('Organization approved.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to approve organization: ' + err.message);
  }
}

async function rejectOrg(uid) {
  try {
    await updateDoc(doc(db, 'organizations', uid), { isApproved: false, status: 'Rejected' });
    alert('Organization rejected.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to reject organization: ' + err.message);
  }
}

async function deleteOrg(uid) {
  if (!confirm('Are you sure you want to delete this organization?')) return;
  try {
    await deleteDoc(doc(db, 'organizations', uid));
    alert('Organization deleted.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to delete organization: ' + err.message);
  }
}

async function approveHospital(uid) {
  try {
    await updateDoc(doc(db, 'hospitals', uid), { isApproved: true, status: 'Approved' });
    alert('Hospital approved.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to approve hospital: ' + err.message);
  }
}

async function rejectHospital(uid) {
  try {
    await updateDoc(doc(db, 'hospitals', uid), { isApproved: false, status: 'Rejected' });
    alert('Hospital rejected.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to reject hospital: ' + err.message);
  }
}

async function deleteHospital(uid) {
  if (!confirm('Are you sure you want to delete this hospital?')) return;
  try {
    await deleteDoc(doc(db, 'hospitals', uid));
    alert('Hospital deleted.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to delete hospital: ' + err.message);
  }
}

function viewDonor(uid) { alert('Donor ID: ' + uid); }
function viewOrg(uid) { alert('Organization ID: ' + uid); }
function viewHospital(uid) { alert('Hospital ID: ' + uid); }

function setupNotificationHandlers() {
  const recipientType = document.getElementById('recipientType');
  const notificationForm = document.getElementById('notificationForm');

  recipientType?.addEventListener('change', (event) => {
    populateRecipientSelector(event.target.value);
  });

  notificationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleNotificationSubmit();
  });
}

function populateRecipientSelector(type) {
  const selectorGroup = document.getElementById('recipientSelectorGroup');
  const selector = document.getElementById('recipientSelector');
  if (!selectorGroup || !selector) return;

  let list = [];
  let placeholder = 'Select recipient...';

  if (type === 'specificDonor') { list = donorsList; placeholder = 'Select donor...'; }
  else if (type === 'specificHospital') { list = hospitalsList; placeholder = 'Select hospital...'; }
  else if (type === 'specificOrganization') { list = organizationsList; placeholder = 'Select organization...'; }

  if (type.startsWith('specific')) {
    selectorGroup.classList.remove('hidden');
    selector.required = true;
    selector.innerHTML = `<option value="">${placeholder}</option>` +
      list.map((item) => `<option value="${item.uid || item.id}">${item.fullName || item.hospitalName || item.organizationName || item.email || item.id}</option>`).join('');
  } else {
    selectorGroup.classList.add('hidden');
    selector.required = false;
    selector.innerHTML = '';
  }
}

async function handleNotificationSubmit() {
  const type = document.getElementById('recipientType')?.value;
  const title = document.getElementById('notificationTitle')?.value.trim();
  const message = document.getElementById('notificationMessage')?.value.trim();
  const recipientSelector = document.getElementById('recipientSelector');

  if (!type || !title || !message) {
    alert('Title, message, and recipient type are required.');
    return;
  }

  let targetType = 'User';
  let targetRole = null;
  let targetUserId = null;

  if (type === 'allUsers') {
    targetType = 'All';
  } else if (type === 'allDonors') {
    targetType = 'Role';
    targetRole = 'donor';
  } else if (type === 'allHospitals') {
    targetType = 'Role';
    targetRole = 'hospital';
  } else if (type === 'allOrganizations') {
    targetType = 'Role';
    targetRole = 'organization';
  } else if (type === 'specificDonor') {
    targetType = 'User';
    targetRole = 'donor';
    targetUserId = recipientSelector?.value || null;
  } else if (type === 'specificHospital') {
    targetType = 'User';
    targetRole = 'hospital';
    targetUserId = recipientSelector?.value || null;
  } else if (type === 'specificOrganization') {
    targetType = 'User';
    targetRole = 'organization';
    targetUserId = recipientSelector?.value || null;
  }

  if (targetType === 'User' && !targetUserId) {
    alert('Please select a specific recipient.');
    return;
  }

  try {
    const adminName = currentAdmin?.fullName || currentAdmin?.name || currentAdmin?.displayName || currentAdmin?.email || 'Admin';
    const result = await bloodRequestManager.sendNotificationToTargets({
      title,
      message,
      senderId: currentAdmin?.uid || null,
      senderRole: 'admin',
      senderName: adminName,
      targetType,
      targetRole,
      targetUserId,
      includeSender: true
    });

    if (result.success) {
      alert('Notification sent successfully.');
      document.getElementById('notificationForm')?.reset();
      showView('dashboard');
    } else {
      alert('Failed to send notification: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    alert('Failed to send notification.');
  }
}

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}

/* ==========================================================================
   HELPERS & CHART UTILITIES
   ========================================================================== */

function getTimestamp(value) {
  if (!value) return 0;
  if (value.seconds) return value.seconds * 1000;
  if (value.toMillis) return value.toMillis();
  return new Date(value).getTime();
}

function formatDate(value, withTime = false) {
  if (!value) return '-';
  const date = value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (isNaN(date.getTime())) return '-';
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  const date1 = d1.seconds ? new Date(d1.seconds * 1000) : new Date(d1);
  const date2 = new Date(d2);
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
}

function aggregateMonthlyCounts(list, dateField) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const counts = Array(12).fill(0);

  list.forEach((item) => {
    const val = item[dateField];
    if (!val) return;
    const date = val.seconds ? new Date(val.seconds * 1000) : new Date(val);
    if (!isNaN(date.getTime())) {
      counts[date.getMonth()] += 1;
    }
  });

  return { labels: months, values: counts };
}

const BLOOD_GROUP_PALETTE = {
  'A+': '#E63946',
  'A-': '#D62828',
  'B+': '#0077B6',
  'B-': '#023E8A',
  'AB+': '#7209B7',
  'AB-': '#560BAD',
  'O+': '#2A9D8F',
  'O-': '#F4A261'
};

const DEFAULT_CHART_COLORS = [
  '#E63946', '#0077B6', '#2A9D8F', '#F4A261',
  '#7209B7', '#D62828', '#023E8A', '#560BAD'
];

function getColorsForLabels(labels, customColors) {
  if (Array.isArray(customColors) && customColors.length >= labels.length) {
    return customColors.map((c, i) => BLOOD_GROUP_PALETTE[String(labels[i]).trim().toUpperCase()] || c);
  }
  return labels.map((label, index) => {
    const cleanLabel = String(label).trim().toUpperCase();
    return BLOOD_GROUP_PALETTE[cleanLabel] || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length];
  });
}

function renderChart(elementId, label, labels, data, colors, type = 'line') {
  const canvas = document.getElementById(elementId);
  if (!canvas) return;

  if (chartInstances[elementId]) {
    chartInstances[elementId].destroy();
  }

  const isPie = type === 'pie' || type === 'doughnut';
  const bgColors = isPie
    ? getColorsForLabels(labels, colors)
    : (Array.isArray(colors) ? colors[0] : (colors || 'rgba(193, 18, 31, 0.85)'));

  const borderColors = isPie
    ? '#ffffff'
    : (Array.isArray(colors) ? colors[0] : (colors ? String(colors).replace('0.8', '1').replace('0.7', '1') : '#C1121F'));

  const ctx = canvas.getContext('2d');
  chartInstances[elementId] = new Chart(ctx, {
    type,
    data: {
      labels: labels || [],
      datasets: [
        {
          label: label || '',
          data: data || [],
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: isPie ? 2 : 2.5,
          hoverOffset: isPie ? 12 : 0,
          tension: type === 'line' ? 0.35 : 0,
          fill: type === 'line' ? { target: 'origin', above: 'rgba(193, 18, 31, 0.08)' } : (type !== 'pie' && type !== 'doughnut'),
          borderRadius: type === 'bar' ? 6 : 0,
          borderSkipped: false,
          maxBarThickness: 45,
          pointRadius: type === 'line' ? 5 : 0,
          pointHoverRadius: type === 'line' ? 8 : 0,
          pointBackgroundColor: type === 'line' ? '#ffffff' : undefined,
          pointBorderWidth: type === 'line' ? 2.5 : undefined
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      },
      layout: {
        padding: { top: 8, right: 10, bottom: 8, left: 10 }
      },
      plugins: {
        legend: {
          display: isPie,
          position: 'bottom',
          labels: {
            padding: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            font: {
              size: 11,
              weight: '600',
              family: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif"
            },
            color: '#2B2D42'
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: '#1E293B',
          titleColor: '#FFFFFF',
          bodyColor: '#F8FAFC',
          titleFont: { size: 14, weight: 'bold', family: "'Outfit', 'Inter', sans-serif" },
          bodyFont: { size: 13, weight: '500', family: "'Outfit', 'Inter', sans-serif" },
          padding: 12,
          boxPadding: 6,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            label: function(context) {
              const dataset = context.dataset;
              const currentValue = Number(context.raw || 0);
              if (isPie) {
                const total = dataset.data.reduce((acc, curr) => acc + Number(curr || 0), 0);
                const percentage = total > 0 ? ((currentValue / total) * 100).toFixed(1) : '0';
                return ` ${context.label}: ${currentValue} units (${percentage}%)`;
              }
              return ` ${context.dataset.label || context.label}: ${currentValue} units`;
            }
          }
        }
      },
      scales: isPie ? {} : {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 12, weight: '500', family: "'Outfit', 'Inter', sans-serif" },
            color: '#64748B'
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          ticks: {
            font: { size: 12, weight: '500', family: "'Outfit', 'Inter', sans-serif" },
            color: '#64748B',
            precision: 0
          }
        }
      }
    }
  });
}

function downloadCSV(filename, rows) {
  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updateAdminNotificationBadges(unreadCount) {
  const bell = document.getElementById('adminNotificationBadge');
  const bell2 = document.getElementById('adminNotificationBadge2');
  [bell, bell2].forEach((b) => {
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

async function markAdminNotificationsRead() {
  if (!currentAdmin?.uid) return;
  updateAdminNotificationBadges(0);
  adminNotifications.forEach((n) => (n.isRead = true));
  displayAdminNotifications(adminNotifications);
  await bloodRequestManager.markAllNotificationsRead(currentAdmin.uid);
}

function displayAdminNotifications(notifications) {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  if (!notifications || notifications.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No notifications available.</p></div>';
    return;
  }

  let html = '';
  notifications.forEach((notif) => {
    const date = notif.createdAt?.seconds
      ? new Date(notif.createdAt.seconds * 1000)
      : notif.createdAt
      ? new Date(notif.createdAt)
      : new Date();
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

function getTimeAgo(date) {
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
