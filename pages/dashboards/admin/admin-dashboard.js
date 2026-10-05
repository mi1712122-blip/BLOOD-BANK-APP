import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  writeBatch,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { authManager, getApprovalStatus } from '../../../assets/js/auth.js';
import { isAvailableInventory } from '../../../assets/js/inventory.js';
import { bloodRequestManager, compareRequestsByUrgency } from '../../../assets/js/requests.js';
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
let allBloodIssues = [];
let adminNotifications = [];
let contactMessagesList = [];
let adminInventoryPage = 1;
const adminInventoryPageSize = 8;
const chartInstances = {};

const viewSelectors = {
  dashboard: 'dashboardView',
  organizationInventoryDetail: 'organizationInventoryDetailView',
  adminProfileDetail: 'adminProfileDetailView',
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
function countApprovedProfiles(profiles) {
  return profiles.filter((profile) => getApprovalStatus(profile) === 'Approved').length;
}

function updateAdminApprovalTotals() {
  const approvedDonors = countApprovedProfiles(donorsList);
  const approvedHospitals = countApprovedProfiles(hospitalsList);
  const approvedOrganizations = countApprovedProfiles(organizationsList);

  const totalUsers = document.getElementById('totalUsers');
  const totalDonors = document.getElementById('totalDonors');
  const totalHospitals = document.getElementById('totalHospitals');
  const totalOrganizations = document.getElementById('totalOrganizations');
  if (totalUsers) totalUsers.textContent = approvedDonors + approvedHospitals + approvedOrganizations;
  if (totalDonors) totalDonors.textContent = approvedDonors;
  if (totalHospitals) totalHospitals.textContent = approvedHospitals;
  if (totalOrganizations) totalOrganizations.textContent = approvedOrganizations;
}

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadAdmin();
  setupNavigation();
  setupActionHandlers();
  setupNotificationHandlers();
  setupInventoryControls();
  setupAnalyticsControls();
  setupRealtimeListeners();
  setupAdminHistory();
  restoreAdminHistoryState(history.state);
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
    adminNotifications = sortAdminNotificationsByDateTime(result.data || []);
    const unreadCount = adminNotifications.filter((item) => !item.isRead).length;
    updateAdminNotificationBadges(unreadCount);
    if (document.getElementById('notificationsView') && !document.getElementById('notificationsView').classList.contains('hidden')) {
      displayAdminNotifications(adminNotifications);
    }
  });
}

function setupRealtimeListeners() {
  onSnapshot(collection(db, 'users'), (snapshot) => {
    usersList = [];
    snapshot.forEach((docSnap) => {
      usersList.push({ id: docSnap.id, ...docSnap.data() });
    });
    updateAdminApprovalTotals();
  });

  onSnapshot(collection(db, 'donors'), (snapshot) => {
    donorsList = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    updateAdminApprovalTotals();
    loadDonorsData(snapshot);
    renderCurrentAdminProfileDetails();
  });
  onSnapshot(collection(db, 'hospitals'), (snapshot) => {
    hospitalsList = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    updateAdminApprovalTotals();
    loadHospitalsData(snapshot);
    renderCurrentAdminProfileDetails();
  });
  onSnapshot(collection(db, 'organizations'), (snapshot) => {
    organizationsList = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    updateAdminApprovalTotals();
    updateAdminAvailableInventoryTotals();
    renderAdminOrganizationInventory();
    renderCurrentOrganizationInventoryDetail();
    loadOrganizationsData(snapshot);
    renderCurrentAdminProfileDetails();
  });

  // Listen for inventory items
  onSnapshot(collection(db, 'bloodInventory'), (snapshot) => {
    allInventoryItems = [];
    snapshot.forEach((docSnap) => {
      allInventoryItems.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAdminInventory();
    renderAdminAnalytics();
    renderAdminOrganizationInventory();
    renderCurrentOrganizationInventoryDetail();
    renderCurrentAdminProfileDetails();
  });

  // Listen for inventory history logs
  onSnapshot(collection(db, 'inventoryHistory'), (snapshot) => {
    allInventoryLogs = [];
    snapshot.forEach((docSnap) => {
      allInventoryLogs.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAdminInventoryLogs();
    renderCurrentAdminProfileDetails();
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
    renderCurrentAdminProfileDetails();
  });

  onSnapshot(collection(db, 'bloodIssues'), (snapshot) => {
    allBloodIssues = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderCurrentAdminProfileDetails();
  });

  // Listen for donations
  onSnapshot(collection(db, 'donations'), (snapshot) => {
    allDonations = [];
    snapshot.forEach((docSnap) => {
      allDonations.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderAdminAnalytics();
    renderCurrentAdminProfileDetails();
  });

  // Listen for contact messages
  onSnapshot(collection(db, 'contactMessages'), (snapshot) => {
    contactMessagesList = [];
    snapshot.forEach((docSnap) => {
      contactMessagesList.push({ id: docSnap.id, ...docSnap.data() });
    });
    contactMessagesList.sort((a, b) => {
      const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return bTime - aTime;
    });
    updateContactMessagesBadge();
    if (document.getElementById('contactMessagesView')?.classList.contains('hidden') === false) {
      renderContactMessagesTable();
    }
  });
}

async function loadDashboardData() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    usersList = [];
    usersSnapshot.forEach((docSnap) => {
      usersList.push({ id: docSnap.id, ...docSnap.data() });
    });

    const donorsSnapshot = await getDocs(collection(db, 'donors'));
    donorsList = [];
    donorsSnapshot.forEach((docSnap) => {
      donorsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    const hospitalsSnapshot = await getDocs(collection(db, 'hospitals'));
    hospitalsList = [];
    hospitalsSnapshot.forEach((docSnap) => {
      hospitalsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    const orgsSnapshot = await getDocs(collection(db, 'organizations'));
    organizationsList = [];
    orgsSnapshot.forEach((docSnap) => {
      organizationsList.push({ id: docSnap.id, ...docSnap.data() });
    });
    updateAdminApprovalTotals();

    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();

    await loadDonorsData(donorsSnapshot);
    await loadOrganizationsData(orgsSnapshot);
    await loadHospitalsData(hospitalsSnapshot);

    if (document.getElementById('sendNotificationView')?.classList.contains('hidden') === false) {
      populateRecipientSelector(document.getElementById('recipientType')?.value || 'specificDonor');
    }
    if (document.getElementById('contactMessagesView')?.classList.contains('hidden') === false) {
      loadContactMessages();
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
    const needsAction = donorStatus === 'Pending';

    html += `
      <tr>
        <td>${donor.fullName || ''}</td>
        <td>${donor.email || ''}</td>
        <td>${donor.bloodGroup || 'N/A'}</td>
        <td>${donor.city || ''}</td>
        <td><span class="badge ${statusBadgeClass}">${donorStatus}</span></td>
        <td>
          ${needsAction ? `<button class="btn btn-sm btn-primary" data-action="approve-donor" data-user-id="${uid}">Approve</button> <button class="btn btn-sm btn-danger" data-action="reject-donor" data-user-id="${uid}">Reject</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary" data-action="view-donor" data-user-id="${uid}">View</button>
          <button type="button" class="btn btn-sm btn-danger delete-btn" data-action="delete-donor" data-user-id="${uid}" title="Delete Donor"><i class="fas fa-trash-alt"></i> Delete</button>
        </td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  document.getElementById('donorsList').innerHTML = html;
}

function getDonorStatus(donor) {
  return getApprovalStatus(donor);
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
  return getApprovalStatus(entity);
}

async function loadOrganizationsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>City</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  snapshot.forEach((docSnap) => {
    const org = docSnap.data();
    const status = getEntityStatus(org);
    const statusBadgeClass = getStatusBadgeClass(status);
    const needsAction = status === 'Pending';

    html += `
      <tr>
        <td>${org.organizationName || ''}</td>
        <td>${org.email || ''}</td>
        <td>${org.city || ''}</td>
        <td><span class="badge ${statusBadgeClass}">${status}</span></td>
        <td>
          ${needsAction ? `<button class="btn btn-sm btn-primary" data-action="approve-org" data-user-id="${org.uid}">Approve</button> <button class="btn btn-sm btn-danger" data-action="reject-org" data-user-id="${org.uid}">Reject</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary" data-action="view-org" data-user-id="${org.uid || org.id}">View</button>
          <button type="button" class="btn btn-sm btn-danger delete-btn" data-action="delete-org" data-user-id="${org.uid}" title="Delete Organization"><i class="fas fa-trash-alt"></i> Delete</button>
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
    const needsAction = status === 'Pending';

    html += `
      <tr>
        <td>${hospital.hospitalName || ''}</td>
        <td>${hospital.email || ''}</td>
        <td>${hospital.city || ''}</td>
        <td><span class="badge ${statusBadgeClass}">${status}</span></td>
        <td>
          ${needsAction ? `<button class="btn btn-sm btn-primary" data-action="approve-hospital" data-user-id="${hospital.uid}">Approve</button> <button class="btn btn-sm btn-danger" data-action="reject-hospital" data-user-id="${hospital.uid}">Reject</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary" data-action="view-hospital" data-user-id="${hospital.uid || hospital.id}">View</button>
          <button type="button" class="btn btn-sm btn-danger delete-btn" data-action="delete-hospital" data-user-id="${hospital.uid}" title="Delete Hospital"><i class="fas fa-trash-alt"></i> Delete</button>
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
    } else if (isAvailableInventory(item, now)) {
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
  const totalUnitsSum = getAdminAvailableInventoryTotal();
  const activeGroupsCount = Object.values(groupStats).filter((g) => g.available > 0).length;
  const lowStockCount = Object.values(groupStats).filter((g) => g.available > 0 && g.available < 10).length;
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
    if (data.available === 0) {
      status = 'Out of Stock';
      statusClass = 'badge-stock-out';
    } else if (data.available < 10) {
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

  rows.sort((a, b) => sortOption === 'asc' ? a.total - b.total : b.total - a.total);

  const countElem = document.getElementById('adminInventoryRecordCount');
  if (countElem) countElem.textContent = rows.length;

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

  // Available Bar Chart
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
          { label: 'Available', data: availableData, backgroundColor: '#2E7D32', borderRadius: 5, maxBarThickness: 24, barPercentage: 0.6, categoryPercentage: 0.7 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        animation: { duration: 800, easing: 'easeOutQuart' },
        layout: { padding: { top: 6, right: 8, bottom: 4, left: 4 } },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              padding: 6,
              boxWidth: 10,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 10.5, weight: '600', family: "'Outfit', 'Inter', sans-serif" },
              color: '#2B2D42'
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#1E293B',
            titleColor: '#FFFFFF',
            bodyColor: '#F8FAFC',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12, weight: '500' },
            padding: 10,
            boxPadding: 5,
            cornerRadius: 6,
            callbacks: {
              label: function(context) {
                return ` ${context.dataset.label}: ${context.raw} units`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11, weight: '500' }, color: '#64748B' } },
          y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.7)' }, ticks: { font: { size: 11, weight: '500' }, color: '#64748B', precision: 0 } }
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
  if (document.getElementById('analyticsTotalDonors')) document.getElementById('analyticsTotalDonors').textContent = countApprovedProfiles(donorsList);
  if (document.getElementById('analyticsTotalHospitals')) document.getElementById('analyticsTotalHospitals').textContent = countApprovedProfiles(hospitalsList);
  if (document.getElementById('analyticsTotalOrgs')) document.getElementById('analyticsTotalOrgs').textContent = countApprovedProfiles(organizationsList);

  const totalUnits = getAdminAvailableInventoryTotal();
  if (document.getElementById('analyticsTotalUnits')) document.getElementById('analyticsTotalUnits').textContent = totalUnits;
  if (document.getElementById('analyticsTotalRequests')) document.getElementById('analyticsTotalRequests').textContent = filteredRequests.length;

  // Donation Metrics
  const totalDonations = filteredDonations.length;
  const todayDonations = filteredDonations.filter((d) => isSameDay(d.createdAt, now)).length;
  if (document.getElementById('analyticsTotalDonations')) document.getElementById('analyticsTotalDonations').textContent = totalDonations;
  if (document.getElementById('analyticsTodayDonations')) document.getElementById('analyticsTodayDonations').textContent = todayDonations;

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
    ['Total Donors', countApprovedProfiles(donorsList)],
    ['Total Hospitals', countApprovedProfiles(hospitalsList)],
    ['Total Organizations', countApprovedProfiles(organizationsList)],
    ['Total Blood Units', getAdminAvailableInventoryTotal()],
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

function setupAdminHistory() {
  const currentState = history.state;
  if (!currentState?.adminDashboard) {
    history.replaceState({ adminDashboard: true, screen: 'view', view: 'dashboard' }, '', window.location.href);
    history.pushState({ adminDashboard: true, screen: 'guard', view: 'dashboard' }, '', window.location.href);
  }
  window.addEventListener('popstate', (event) => {
    if (!event.state?.adminDashboard) {
      const fallbackState = { adminDashboard: true, screen: 'guard', view: 'dashboard' };
      history.pushState(fallbackState, '', window.location.href);
      restoreAdminHistoryState(fallbackState);
      return;
    }
    if (event.state.screen === 'view' && event.state.view === 'dashboard') {
      history.pushState({ adminDashboard: true, screen: 'guard', view: 'dashboard' }, '', window.location.href);
    }
    restoreAdminHistoryState(event.state);
  });
}

function restoreAdminHistoryState(state) {
  const safeView = state?.view && viewSelectors[state.view] ? state.view : 'dashboard';
  showView(safeView, 'none');
  if (state?.screen === 'organizationInventory') {
    requestAnimationFrame(() => document.getElementById('adminOrganizationInventoryList')?.scrollIntoView({ block: 'start' }));
  } else if (safeView === 'organizationInventoryDetail') {
    renderOrganizationInventoryDetail(state.organizationId);
    window.scrollTo(0, 0);
  } else if (safeView === 'adminProfileDetail') {
    renderAdminProfileDetails(state.profileType, state.recordId);
    window.scrollTo(0, 0);
  } else if (safeView === 'dashboard') {
    window.scrollTo(0, 0);
  }
}

function showView(view, historyMode = 'push', stateOverrides = {}) {
  const viewId = viewSelectors[view];
  if (!viewId) return;

  if (historyMode !== 'none') {
    const nextState = { adminDashboard: true, screen: 'view', view, ...stateOverrides };
    const sameState = history.state?.adminDashboard
      && history.state.screen === nextState.screen
      && history.state.view === nextState.view
      && history.state.organizationId === nextState.organizationId
      && history.state.recordId === nextState.recordId;
    if (!sameState) {
      history[historyMode === 'replace' ? 'replaceState' : 'pushState'](nextState, '', window.location.href);
    }
  }

  document.querySelectorAll('.dashboard-view').forEach((section) => section.classList.add('hidden'));
  const target = document.getElementById(viewId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach((item) => {
    const detailListView = view === 'organizationInventoryDetail'
      ? 'dashboard'
      : view === 'adminProfileDetail' ? history.state?.profileType : view;
    item.classList.toggle('active', item.dataset.view === detailListView);
  });

  if (view === 'inventory') renderAdminInventory();
  if (view === 'analytics') renderAdminAnalytics();
  if (view === 'contactMessages') {
    markAllContactMessagesRead();
    loadContactMessages();
  }
  if (view === 'sendNotification') populateRecipientSelector(document.getElementById('recipientType')?.value || 'specificDonor');
  if (view === 'notifications') {
    displayAdminNotifications(adminNotifications);
    markAdminNotificationsRead();
  }
}

/* ==========================================================================
   CONTACT MESSAGES MODULE
   ========================================================================== */

async function loadContactMessages() {
  const container = document.getElementById('contactMessagesList');
  if (!container) return;

  container.innerHTML = '<div class="card table-card" style="padding: 20px; text-align: center;"><p class="empty-state">Loading contact messages...</p></div>';

  try {
    const snapshot = await getDocs(collection(db, 'contactMessages'));
    contactMessagesList = [];
    snapshot.forEach((docSnap) => {
      contactMessagesList.push({ id: docSnap.id, ...docSnap.data() });
    });

    contactMessagesList.sort((a, b) => {
      const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return bTime - aTime;
    });

    updateContactMessagesBadge();
    renderContactMessagesTable();
    markAllContactMessagesRead();
  } catch (error) {
    console.error('Error loading contact messages:', error);
    container.innerHTML = '<div class="card table-card" style="padding: 20px; text-align: center;"><p class="empty-state">Failed to load contact messages.</p></div>';
  }
}

function renderContactMessagesTable() {
  updateContactMessagesBadge();
  const container = document.getElementById('contactMessagesList');
  if (!container) return;

  if (!contactMessagesList.length) {
    container.innerHTML = '<div class="card table-card" style="padding: 20px; text-align: center;"><p class="empty-state">No contact messages received yet.</p></div>';
    return;
  }

  const rows = contactMessagesList.map((msg) => {
    const dateVal = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000) : (msg.createdAt ? new Date(msg.createdAt) : new Date());
    const dateStr = !isNaN(dateVal.getTime()) ? dateVal.toLocaleString() : 'N/A';
    const status = msg.status || 'Unread';
    const badgeClass = status === 'Read' ? 'badge-success' : 'badge-warning';
    const messageSnippet = (msg.message || '').length > 60 ? (msg.message || '').substring(0, 60) + '...' : (msg.message || '-');

    return `
      <tr style="${status !== 'Read' ? 'font-weight: 600;' : ''}">
        <td>${msg.name || 'Anonymous'}</td>
        <td><a href="mailto:${msg.email || ''}">${msg.email || '-'}</a></td>
        <td>${msg.subject || 'No Subject'}</td>
        <td>${messageSnippet}</td>
        <td>${dateStr}</td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td>
          <button type="button" class="btn btn-sm btn-secondary" data-action="view-contact-msg" data-id="${msg.id}">View</button>
          ${status !== 'Read' ? `<button type="button" class="btn btn-sm btn-primary" data-action="read-contact-msg" data-id="${msg.id}">Mark Read</button>` : ''}
          <button type="button" class="btn btn-sm btn-danger delete-btn" data-action="delete-contact-msg" data-id="${msg.id}" title="Delete Message"><i class="fas fa-trash-alt"></i> Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card table-card">
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Subject</th>
              <th>Message</th>
              <th>Date & Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-action="view-contact-msg"]').forEach((btn) => {
    btn.addEventListener('click', () => viewContactMessage(btn.dataset.id));
  });

  container.querySelectorAll('[data-action="read-contact-msg"]').forEach((btn) => {
    btn.addEventListener('click', () => markContactMessageRead(btn.dataset.id));
  });

  container.querySelectorAll('[data-action="delete-contact-msg"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteContactMessage(btn.dataset.id));
  });
}

async function viewContactMessage(id) {
  const msg = contactMessagesList.find((m) => m.id === id);
  if (!msg) return;

  if (String(msg.status || '').toLowerCase().trim() !== 'read') {
    await markContactMessageRead(id, false);
  }

  const dateVal = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000) : (msg.createdAt ? new Date(msg.createdAt) : new Date());
  const dateStr = !isNaN(dateVal.getTime()) ? dateVal.toLocaleString() : 'N/A';

  alert(`Contact Message Details:\n\nFrom: ${msg.name || 'Anonymous'} (${msg.email || 'No email'})\nSubject: ${msg.subject || 'No subject'}\nDate: ${dateStr}\nSource: ${msg.source || 'Website Contact Form'}\n\nMessage:\n${msg.message || '(Empty message)'}`);
}

async function markContactMessageRead(id, refresh = true) {
  try {
    await updateDoc(doc(db, 'contactMessages', id), {
      status: 'Read',
      updatedAt: new Date()
    });
    const msg = contactMessagesList.find((m) => m.id === id);
    if (msg) msg.status = 'Read';
    updateContactMessagesBadge();
    if (refresh) renderContactMessagesTable();
  } catch (error) {
    console.error('Error marking message as read:', error);
  }
}

async function deleteContactMessage(id) {
  if (!confirm('Are you sure you want to delete this contact message?')) return;
  try {
    await deleteDoc(doc(db, 'contactMessages', id));
    contactMessagesList = contactMessagesList.filter((m) => m.id !== id);
    updateContactMessagesBadge();
    renderContactMessagesTable();
  } catch (error) {
    console.error('Error deleting contact message:', error);
    alert('Failed to delete contact message.');
  }
}

function updateContactMessagesBadge() {
  const unreadCount = contactMessagesList.filter((msg) => {
    const s = String(msg.status || '').toLowerCase().trim();
    return s !== 'read';
  }).length;
  const badge = document.getElementById('contactMessagesBadge');
  if (!badge) return;
  badge.textContent = unreadCount;
  if (unreadCount > 0) {
    badge.classList.remove('hidden');
    badge.style.setProperty('display', 'flex', 'important');
  } else {
    badge.classList.add('hidden');
    badge.style.setProperty('display', 'none', 'important');
  }
}

async function markAllContactMessagesRead() {
  const unreadMessages = contactMessagesList.filter((msg) => String(msg.status || '').toLowerCase().trim() !== 'read');
  if (!unreadMessages.length) return;

  unreadMessages.forEach((msg) => (msg.status = 'Read'));
  updateContactMessagesBadge();

  try {
    await Promise.all(
      unreadMessages.map((msg) =>
        updateDoc(doc(db, 'contactMessages', msg.id), {
          status: 'Read',
          updatedAt: new Date()
        })
      )
    );
  } catch (error) {
    console.error('Error marking all contact messages as read:', error);
  }
}

function setupActionHandlers() {
  document.getElementById('adminRecordDetailsModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'adminRecordDetailsModal'
      || event.target.closest('[data-action="close-admin-record-details"]')) {
      closeAdminRecordDetails();
    }
  });

  document.querySelectorAll('.dashboard-container').forEach((container) => {
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      event.preventDefault();

      const action = button.dataset.action;
      if (action === 'view-organization-inventory') {
        viewOrganizationInventory(button.dataset.organizationId);
        return;
      }
      if (action === 'back-to-organization-inventory') {
        history.back();
        return;
      }
      if (action === 'back-to-admin-profiles') {
        history.back();
        return;
      }
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

function getAdminAvailableInventoryTotal() {
  const organizationIds = new Set(organizationsList.flatMap((organization) => [organization.uid, organization.id].filter(Boolean)));
  return allInventoryItems.reduce((sum, item) => {
    if (!organizationIds.has(item.organizationId) || !isAvailableInventory(item)) return sum;
    const units = Number(item.units);
    return Number.isFinite(units) && units > 0 ? sum + units : sum;
  }, 0);
}

function updateAdminAvailableInventoryTotals() {
  const total = getAdminAvailableInventoryTotal();
  if (document.getElementById('adminTotalUnits')) document.getElementById('adminTotalUnits').textContent = total;
  if (document.getElementById('analyticsTotalUnits')) document.getElementById('analyticsTotalUnits').textContent = total;
}

function getAdminOrganizationInventory(organization) {
  const organizationId = organization.uid || organization.id;
  const inventoryBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  const totalsByGroup = Object.fromEntries(inventoryBloodGroups.map((group) => [group, 0]));

  allInventoryItems.forEach((item) => {
    if ((item.organizationId === organizationId || item.organizationId === organization.id)
      && isAvailableInventory(item)) {
      const units = Number(item.units);
      if (Object.hasOwn(totalsByGroup, item.bloodGroup)) {
        totalsByGroup[item.bloodGroup] += units;
      }
    }
  });

  return {
    totalsByGroup,
    total: Object.values(totalsByGroup).reduce((sum, units) => sum + units, 0)
  };
}

function renderAdminOrganizationInventory() {
  const container = document.getElementById('adminOrganizationInventoryList');
  if (!container) return;

  if (!organizationsList.length) {
    container.innerHTML = '<p>No organizations are registered yet.</p>';
    return;
  }

  const rows = organizationsList.map((organization) => {
    const organizationId = organization.uid || organization.id;
    const inventory = getAdminOrganizationInventory(organization);
    return `<tr>
      <td>${escapeAdminDetail(organization.organizationName || 'Organization')}</td>
      <td>${inventory.total} units</td>
      <td><button type="button" class="btn btn-sm btn-secondary" data-action="view-organization-inventory" data-organization-id="${escapeAdminDetail(organizationId)}">View Details &rarr;</button></td>
    </tr>`;
  }).join('');

  container.innerHTML = `<table><thead><tr><th>Organization Name</th><th>Total Available Units</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function viewOrganizationInventory(organizationId) {
  const organization = organizationsList.find((item) => (item.uid || item.id) === organizationId || item.id === organizationId);
  if (!organization) {
    return;
  }

  if (history.state?.screen !== 'organizationInventory') {
    history.pushState({ adminDashboard: true, screen: 'organizationInventory', view: 'dashboard' }, '', window.location.href);
  }
  showView('organizationInventoryDetail', 'push', {
    screen: 'organizationInventoryDetail',
    organizationId
  });
  renderOrganizationInventoryDetail(organizationId);
  window.scrollTo(0, 0);
}

function renderCurrentOrganizationInventoryDetail() {
  if (history.state?.screen === 'organizationInventoryDetail') {
    renderOrganizationInventoryDetail(history.state.organizationId);
  }
}

function renderOrganizationInventoryDetail(organizationId) {
  const organization = organizationsList.find((item) => (item.uid || item.id) === organizationId || item.id === organizationId);
  if (!organization) return;

  const inventory = getAdminOrganizationInventory(organization);
  const status = organization.status
    || (typeof organization.isApproved === 'boolean' ? (organization.isApproved ? 'Approved' : 'Pending') : '');
  const meta = [status, organization.city].filter(Boolean);
  const nameElement = document.getElementById('adminOrganizationInventoryName');
  const metaElement = document.getElementById('adminOrganizationInventoryMeta');
  const gridElement = document.getElementById('adminOrganizationBloodGroupGrid');
  const totalElement = document.getElementById('adminOrganizationInventoryTotal');
  if (!nameElement || !metaElement || !gridElement || !totalElement) return;

  nameElement.textContent = organization.organizationName || 'Organization';
  metaElement.innerHTML = meta.map((value) => `<span class="admin-inventory-meta-item">${escapeAdminDetail(value)}</span>`).join('');
  gridElement.innerHTML = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
    .map((group) => `<article class="card admin-blood-group-card"><span class="admin-blood-group-label">${group}</span><strong>${inventory.totalsByGroup[group]}</strong><span>units available</span></article>`)
    .join('');
  totalElement.textContent = inventory.total;
}

async function approveDonor(uid) {
  try {
    await updateUserApproval(uid, 'donor', 'Approved');
    alert('Donor approved successfully.');
  } catch (err) {
    alert('Failed to approve donor: ' + err.message);
  }
}

async function rejectDonor(uid) {
  try {
    const rejectionReason = getAccountRejectionReason();
    if (!rejectionReason) return;
    await updateUserApproval(uid, 'donor', 'Rejected', rejectionReason);
    alert('Donor rejected.');
  } catch (err) {
    alert('Failed to reject donor: ' + err.message);
  }
}

function getAccountRejectionReason() {
  const reason = prompt('Please enter a reason for rejecting this account:');
  const trimmedReason = reason?.trim();
  return trimmedReason || null;
}

async function updateUserApproval(uid, role, status, rejectionReason = '') {
  const normalizedRejectionReason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';
  if (status === 'Rejected' && !normalizedRejectionReason) {
    throw new Error('A rejection reason is required.');
  }

  const profileCollection = role === 'donor' ? 'donors' : role === 'organization' ? 'organizations' : 'hospitals';
  const userRef = doc(db, 'users', uid);
  const profileRef = doc(db, profileCollection, uid);
  const [userSnapshot, profileSnapshot] = await Promise.all([getDoc(userRef), getDoc(profileRef)]);
  if (!userSnapshot.exists() || !profileSnapshot.exists()) throw new Error('The user and role profile must both exist before approval can be changed.');
  const previousStatus = getApprovalStatus(userSnapshot.data());
  const alreadyNotified = previousStatus === status;
  const batch = writeBatch(db);
  const updatedAt = new Date();
  const approvalData = { status, isApproved: status === 'Approved', updatedAt };
  if (status === 'Approved') approvalData.approvedAt = updatedAt;
  if (status === 'Rejected') {
    approvalData.rejectedAt = updatedAt;
    approvalData.rejectionReason = normalizedRejectionReason;
  }
  batch.update(userRef, approvalData);
  batch.update(profileRef, approvalData);

  if (!alreadyNotified) {
    const notificationRef = doc(collection(db, 'notifications'));
    batch.set(notificationRef, {
      recipientId: uid,
      recipientRole: role,
      type: status === 'Approved' ? 'account_approved' : 'account_rejected',
      title: 'Account Registration Update',
      message: status === 'Approved'
        ? 'Your account has been approved. You can now access the full Blood Bank Management System.'
        : `Your account registration has been rejected by the administrator.\n\nReason: ${normalizedRejectionReason}`,
      senderId: currentAdmin.uid,
      senderRole: 'admin',
      senderName: 'Administration',
      targetType: 'User',
      targetRole: role,
      targetUserId: uid,
      recipientName: role === 'donor' ? donorsList.find((item) => (item.uid || item.id) === uid)?.fullName
        : role === 'organization' ? organizationsList.find((item) => (item.uid || item.id) === uid)?.organizationName
        : hospitalsList.find((item) => (item.uid || item.id) === uid)?.hospitalName,
      isRead: false,
      createdAt: updatedAt
    });
  }

  await batch.commit();
}

async function deleteDonor(uid) {
  if (!confirm('Are you sure you want to delete this donor?')) return;
  try {
    await deleteDoc(doc(db, 'donors', uid));
    await deleteDoc(doc(db, 'users', uid));
    alert('Donor deleted.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to delete donor: ' + err.message);
  }
}

async function approveOrg(uid) {
  try {
    await updateUserApproval(uid, 'organization', 'Approved');
    alert('Organization approved.');
  } catch (err) {
    alert('Failed to approve organization: ' + err.message);
  }
}

async function rejectOrg(uid) {
  try {
    const rejectionReason = getAccountRejectionReason();
    if (!rejectionReason) return;
    await updateUserApproval(uid, 'organization', 'Rejected', rejectionReason);
    alert('Organization rejected.');
  } catch (err) {
    alert('Failed to reject organization: ' + err.message);
  }
}

async function deleteOrg(uid) {
  if (!confirm('Are you sure you want to delete this organization?')) return;
  try {
    await deleteDoc(doc(db, 'organizations', uid));
    await deleteDoc(doc(db, 'users', uid));
    alert('Organization deleted.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to delete organization: ' + err.message);
  }
}

async function approveHospital(uid) {
  try {
    await updateUserApproval(uid, 'hospital', 'Approved');
    alert('Hospital approved.');
  } catch (err) {
    alert('Failed to approve hospital: ' + err.message);
  }
}

async function rejectHospital(uid) {
  try {
    const rejectionReason = getAccountRejectionReason();
    if (!rejectionReason) return;
    await updateUserApproval(uid, 'hospital', 'Rejected', rejectionReason);
    alert('Hospital rejected.');
  } catch (err) {
    alert('Failed to reject hospital: ' + err.message);
  }
}

async function deleteHospital(uid) {
  if (!confirm('Are you sure you want to delete this hospital?')) return;
  try {
    await deleteDoc(doc(db, 'hospitals', uid));
    await deleteDoc(doc(db, 'users', uid));
    alert('Hospital deleted.');
    await loadDashboardData();
  } catch (err) {
    alert('Failed to delete hospital: ' + err.message);
  }
}

function viewDonor(uid, navigate = true) {
  const donor = donorsList.find((item) => (item.uid || item.id) === uid || item.id === uid);
  if (!donor) {
    if (navigate) return;
    showAdminRecordDetails('Donor Details', '<p>Record not found.</p>');
    return;
  }
  if (navigate) openAdminProfileDetails('donors', donor.uid || donor.id);

  const donorId = donor.uid || donor.id;
  const donations = allDonations
    .filter((donation) => donation.donorId === donorId || donation.donorId === donor.id)
    .sort((a, b) => getTimestamp(b.donationDate || b.createdAt) - getTimestamp(a.donationDate || a.createdAt));
  const totalDonationUnits = donations.reduce((sum, donation) => sum + (Number(donation.units) || 0), 0);
  const status = donor.status || getDonorStatus(donor);
  const eligibility = typeof donor.isEligible === 'boolean' ? (donor.isEligible ? 'Eligible' : 'Not eligible') : 'Not available';
  const accountStatus = typeof donor.isActive === 'boolean' ? (donor.isActive ? 'Active' : 'Inactive') : 'Not available';
  const photoUrl = getAdminProfileImageUrl(donor.profilePhoto || donor.photoURL || donor.photoUrl || donor.profileImage || donor.avatarUrl);
  const lastDonation = donor.lastDonationDate || donations[0]?.donationDate || donations[0]?.createdAt;
  const organizationGroups = new Map();
  donations.forEach((donation) => {
    const organizationId = donation.organizationId;
    if (!organizationId) return;
    const key = String(organizationId);
    const organization = organizationsList.find((item) => (item.uid || item.id) === key || item.id === key);
    const group = organizationGroups.get(key) || {
      name: organization?.organizationName || donation.organizationName || 'Organization',
      count: 0,
      units: 0,
      latest: null
    };
    group.count += 1;
    group.units += Number(donation.units) || 0;
    const donationTime = getTimestamp(donation.donationDate || donation.createdAt);
    if (donationTime > getTimestamp(group.latest)) group.latest = donation.donationDate || donation.createdAt;
    organizationGroups.set(key, group);
  });
  const organizationRows = [...organizationGroups.entries()]
    .sort((a, b) => getTimestamp(b[1].latest) - getTimestamp(a[1].latest))
    .map(([organizationId, organization]) => `<tr><td>${escapeAdminDetail(organization.name)}</td><td>${escapeAdminDetail(organizationId)}</td><td>${organization.count}</td><td>${organization.units}</td><td>${escapeAdminDetail(formatDate(organization.latest, true))}</td></tr>`)
    .join('');
  const monthlyDonations = getMonthlyProfileSeries(donations, (donation) => donation.donationDate || donation.createdAt);
  const donationHistory = donations.length
    ? `<div class="admin-profile-table-wrap"><table class="admin-profile-table"><thead><tr><th>Date</th><th>Blood Group</th><th>Units</th><th>Organization</th><th>Status</th><th>Donation / Inventory Reference</th></tr></thead><tbody>${donations.map((donation) => `<tr><td>${escapeAdminDetail(formatDate(donation.donationDate || donation.createdAt, true))}</td><td>${escapeAdminDetail(donation.bloodGroup || 'Not available')}</td><td>${escapeAdminDetail(donation.units ?? 'Not available')}</td><td>${escapeAdminDetail(donation.organizationName || organizationsList.find((item) => (item.uid || item.id) === donation.organizationId || item.id === donation.organizationId)?.organizationName || 'Not available')}</td><td>${escapeAdminDetail(donation.status || 'Not available')}</td><td>${escapeAdminDetail(donation.donationId || donation.id || donation.inventoryId || 'Not available')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="admin-profile-empty-state">No donation history available yet.</p>';
  const activity = donations
    .filter((donation) => getTimestamp(donation.donationDate || donation.createdAt))
    .slice(0, 10)
    .map((donation) => `<li><strong>${escapeAdminDetail(formatDate(donation.donationDate || donation.createdAt, true))}</strong> — Donation recorded: ${escapeAdminDetail(donation.bloodGroup || 'Blood group unavailable')}, ${Number(donation.units) || 0} units${donation.organizationName ? ` at ${escapeAdminDetail(donation.organizationName)}` : ''}${donation.status ? ` (${escapeAdminDetail(donation.status)})` : ''}</li>`)
    .join('');

  showAdminProfilePage({
    title: 'Donor Profile & Performance', name: donor.fullName || 'Donor', backLabel: 'Back to Donors',
    status, subtitle: donor.bloodGroup ? `Blood Group ${donor.bloodGroup}` : 'Donor account', imageUrl: photoUrl,
    details: [
      ['Blood Group', donor.bloodGroup], ['Email', donor.email], ['Phone', donor.phone],
      ['City', donor.city], ['Address', donor.address], ['Age', donor.age], ['Gender', donor.gender],
      ['Total Donations', donor.totalDonations ?? donations.length],
      ['Last Donation', lastDonation ? formatDate(lastDonation) : null],
      ['Eligibility', eligibility], ['Approval Status', status], ['Account Status', accountStatus],
      ['Registration Date', donor.createdAt ? formatDate(donor.createdAt) : null], ['Donor ID', donorId]
    ],
    sections: [
      { title: 'Donation Performance', content: `<div class="admin-profile-metric-grid">${renderAdminProfileMetric('Total donations', donations.length)}${renderAdminProfileMetric('Units donated', totalDonationUnits)}${renderAdminProfileMetric('Organizations donated to', organizationGroups.size)}${renderAdminProfileMetric('Current eligibility', eligibility)}</div><p class="admin-profile-supporting-stat">Last donation: ${escapeAdminDetail(lastDonation ? formatDate(lastDonation, true) : 'Not available')}</p>` },
      { title: 'Monthly Donation Activity', content: monthlyDonations ? '<div class="admin-org-chart-wrap"><canvas id="adminDonorDonationTrend" role="img" aria-label="Monthly donor donation activity"></canvas></div>' : '<p class="admin-org-empty-state">No historical data available yet.</p>' },
      { title: 'Organizations Donated To', content: organizationRows ? `<div class="admin-profile-table-wrap"><table class="admin-profile-table"><thead><tr><th>Organization</th><th>Organization ID</th><th>Donations</th><th>Units</th><th>Most Recent Donation</th></tr></thead><tbody>${organizationRows}</tbody></table></div>` : '<p class="admin-org-empty-state">No linked organization donation records available.</p>' },
      { title: 'Donation History', content: donationHistory },
      { title: 'Recent Donor Activity', content: activity ? `<ul>${activity}</ul>` : '<p class="admin-org-empty-state">No timestamped donor activity available yet.</p>' }
    ]
  });

  resetAdminProfileCharts(['adminDonorDonationTrend']);
  if (monthlyDonations) renderChart('adminDonorDonationTrend', 'Donations', monthlyDonations.labels, monthlyDonations.values, '#C1121F');
}

function viewOrg(uid, navigate = true) {
  const organization = organizationsList.find((item) => (item.uid || item.id) === uid || item.id === uid);
  if (!organization) {
    showAdminRecordDetails('Organization Details', '<p>Record not found.</p>');
    return;
  }
  if (navigate) openAdminProfileDetails('organizations', organization.uid || organization.id);

  const organizationId = organization.uid || organization.id;
  const belongsToOrganization = (item) => item.organizationId === organizationId || item.organizationId === organization.id;
  const donations = allDonations.filter(belongsToOrganization).sort((a, b) => getTimestamp(b.donationDate || b.createdAt) - getTimestamp(a.donationDate || a.createdAt));
  const requests = allRequests.filter(belongsToOrganization).sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
  const inventory = allInventoryItems.filter(belongsToOrganization);
  const inventoryHistory = allInventoryLogs.filter(belongsToOrganization).sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
  const bloodIssues = allBloodIssues.filter(belongsToOrganization).sort((a, b) => getTimestamp(b.issueDate || b.createdAt) - getTimestamp(a.issueDate || a.createdAt));
  const now = Date.now();
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const availableInventory = inventory.filter((item) => isAvailableInventory(item));
  const availableByGroup = Object.fromEntries(bloodGroups.map((group) => [group, 0]));
  availableInventory.forEach((item) => {
    if (Object.hasOwn(availableByGroup, item.bloodGroup)) availableByGroup[item.bloodGroup] += Number(item.units) || 0;
  });
  const expiringSoonUnits = availableInventory.reduce((sum, item) => {
    const expiry = getTimestamp(item.expiryDate);
    return expiry > now && expiry <= now + 30 * dayMilliseconds ? sum + (Number(item.units) || 0) : sum;
  }, 0);
  const expiredUnits = inventory.reduce((sum, item) => {
    const expiry = getTimestamp(item.expiryDate);
    return item.status === 'Available' && expiry && expiry <= now ? sum + Math.max(0, Number(item.units) || 0) : sum;
  }, 0);
  const usedBatches = inventory
    .filter((item) => item.status === 'Used')
    .length;
  const totalDonations = donations.length;
  const totalDonationUnits = donations.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
  const totalRequests = requests.length;
  const totalRequestedUnits = requests.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
  const totalIssuedUnits = bloodIssues.reduce((sum, item) => sum + (Number(item.units) || 0), 0);
  const requestStatusCounts = {
    pending: requests.filter((item) => item.status === 'Pending').length,
    processing: requests.filter((item) => item.status === 'Processing').length,
    approved: requests.filter((item) => item.status === 'Approved').length,
    rejected: requests.filter((item) => item.status === 'Rejected').length,
    completed: requests.filter((item) => item.status === 'Completed').length,
    cancelled: requests.filter((item) => item.status === 'Cancelled').length
  };
  const status = organization.status || (typeof organization.isApproved === 'boolean' ? (organization.isApproved ? 'Approved' : 'Pending') : 'Not available');
  const activity = [
    ...donations.map((item) => ({ time: item.donationDate || item.createdAt, label: `Donation recorded: ${item.donorName || 'Donor'} — ${item.bloodGroup || 'Blood group unavailable'}, ${Number(item.units) || 0} units` })),
    ...requests.map((item) => ({ time: item.createdAt, label: `Request received: ${item.hospitalName || 'Hospital'} — ${item.bloodGroup || 'Blood group unavailable'}, ${Number(item.units) || 0} units (${item.status || 'Status unavailable'})` })),
    ...requests.filter((item) => item.approvedAt).map((item) => ({ time: item.approvedAt, label: `Request approved: ${item.hospitalName || 'Hospital'} — ${item.bloodGroup || 'Blood group unavailable'}` })),
    ...requests.filter((item) => item.rejectedAt).map((item) => ({ time: item.rejectedAt, label: `Request rejected: ${item.hospitalName || 'Hospital'} — ${item.bloodGroup || 'Blood group unavailable'}` })),
    ...requests.filter((item) => item.cancelledAt).map((item) => ({ time: item.cancelledAt, label: `Request cancelled: ${item.hospitalName || 'Hospital'} — ${item.bloodGroup || 'Blood group unavailable'}` })),
    ...bloodIssues.map((item) => ({ time: item.issueDate || item.createdAt, label: `Blood issued: ${item.hospitalName || 'Hospital'} — ${item.bloodGroup || 'Blood group unavailable'}, ${Number(item.units) || 0} units` })),
    ...inventoryHistory.map((item) => ({ time: item.date || item.createdAt, label: `Inventory ${item.reason || 'updated'}: ${item.bloodGroup || 'Blood group unavailable'}, ${Number(item.difference ?? item.units) || 0} units` }))
  ].filter((item) => getTimestamp(item.time)).sort((a, b) => getTimestamp(b.time) - getTimestamp(a.time)).slice(0, 12);
  const monthlySeries = (records, dateSelector, metric = () => 1) => {
    const buckets = new Map();
    records.forEach((record) => {
      const timestamp = getTimestamp(dateSelector(record));
      if (!timestamp) return;
      const date = new Date(timestamp);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) || 0) + metric(record));
    });
    const keys = [...buckets.keys()].sort();
    if (keys.length < 2) return null;
    return { labels: keys.map((key) => new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })), values: keys.map((key) => buckets.get(key)) };
  };
  const donationTrend = monthlySeries(donations, (item) => item.donationDate || item.createdAt);
  const requestTrend = monthlySeries(requests, (item) => item.createdAt);
  const issueTrend = monthlySeries(bloodIssues, (item) => item.issueDate || item.createdAt, (item) => Number(item.units) || 0);
  const inventoryTrend = monthlySeries(inventoryHistory, (item) => item.date || item.createdAt, (item) => Number(item.difference ?? item.units) || 0);
  const activityList = (items, renderItem, emptyMessage) => items.length
    ? `<ul>${items.slice(0, 10).map(renderItem).join('')}</ul>`
    : `<p>${emptyMessage}</p>`;
  const renderTrend = (trend, canvasId, title) => trend
    ? `<div class="admin-org-chart-wrap"><canvas id="${canvasId}" aria-label="${title}" role="img"></canvas></div>`
    : `<p class="admin-org-empty-state">No historical data available yet.</p>`;
  const metricCard = (label, value) => `<article class="admin-org-metric"><span>${escapeAdminDetail(label)}</span><strong>${escapeAdminDetail(value)}</strong></article>`;

  const availableInventorySummary = { totalsByGroup: availableByGroup, total: Object.values(availableByGroup).reduce((sum, units) => sum + units, 0) };

  showAdminRecordDetails('Organization Details', `
    <section class="admin-org-summary-grid">
      ${metricCard('Available blood units', availableInventorySummary.total)}
      ${metricCard('Total donations', totalDonations)}
      ${metricCard('Total blood requests', totalRequests)}
      ${metricCard('Units requested', totalRequestedUnits)}
      ${metricCard('Units issued', totalIssuedUnits)}
      ${metricCard('Approval status', status)}
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Inventory Performance</h2></div>
      ${renderAdminBloodGroupSummary(availableInventorySummary)}
      <div class="admin-org-summary-grid admin-org-summary-grid-compact">
        ${metricCard('Expiring within 30 days', `${expiringSoonUnits} units`)}
        ${metricCard('Expired inventory units', `${expiredUnits} units`)}
        ${metricCard('Used inventory batches', usedBatches)}
      </div>
      <div class="admin-record-activity"><h3>Inventory History</h3>${activityList(inventoryHistory, (item) => `<li>${escapeAdminDetail(item.bloodGroup || 'Blood group unavailable')} — ${escapeAdminDetail(item.reason || 'Inventory update')}, ${escapeAdminDetail(item.difference ?? item.units ?? 'Not available')} units, ${escapeAdminDetail(formatDate(item.date || item.createdAt, true))}</li>`, 'No matching inventory history found.')}</div>
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Performance Analytics</h2></div>
      <div class="admin-org-analytics-grid">
        <article class="admin-org-chart-card"><h3>Donations over time</h3>${renderTrend(donationTrend, 'adminOrgDonationTrend', 'Donations over time')}</article>
        <article class="admin-org-chart-card"><h3>Requests over time</h3>${renderTrend(requestTrend, 'adminOrgRequestTrend', 'Requests over time')}</article>
        <article class="admin-org-chart-card"><h3>Blood issued over time (units)</h3>${renderTrend(issueTrend, 'adminOrgIssueTrend', 'Blood issued over time')}</article>
        <article class="admin-org-chart-card"><h3>Inventory changes over time (units)</h3>${renderTrend(inventoryTrend, 'adminOrgInventoryTrend', 'Inventory changes over time')}</article>
      </div>
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Donation Performance</h2></div>
      <div class="admin-org-summary-grid admin-org-summary-grid-compact">${metricCard('Donations received', totalDonations)}${metricCard('Units received', totalDonationUnits)}</div>
      <div class="admin-record-activity"><h3>Recent Donations</h3>${activityList(donations, (item) => `<li>${escapeAdminDetail(item.donorName || 'Donor')} — ${escapeAdminDetail(item.bloodGroup || 'Blood group unavailable')}, ${Number(item.units) || 0} units, ${escapeAdminDetail(formatDate(item.donationDate || item.createdAt, true))}</li>`, 'No donation activity available yet.')}</div>
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Blood Requests &amp; Issues</h2></div>
      <div class="admin-org-summary-grid admin-org-summary-grid-compact">
        ${metricCard('Pending / processing', `${requestStatusCounts.pending} / ${requestStatusCounts.processing}`)}
        ${metricCard('Approved', requestStatusCounts.approved)}
        ${metricCard('Rejected', requestStatusCounts.rejected)}
        ${metricCard('Completed / issued', requestStatusCounts.completed)}
        ${metricCard('Cancelled', requestStatusCounts.cancelled)}
        ${metricCard('Issue records', bloodIssues.length)}
      </div>
      <div class="admin-record-activity"><h3>Recent Requests</h3>${activityList(requests, (item) => `<li>${escapeAdminDetail(item.hospitalName || 'Hospital')} — ${escapeAdminDetail(item.bloodGroup || 'Blood group unavailable')}, ${Number(item.units) || 0} requested units, ${escapeAdminDetail(item.status || 'Status unavailable')}, ${escapeAdminDetail(formatDate(item.createdAt, true))}${item.issueDetails?.unitsIssued !== undefined ? `, ${Number(item.issueDetails.unitsIssued) || 0} issued units` : ''}</li>`, 'No matching requests found.')}</div>
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Recent Organization Activity</h2></div>
      ${activityList(activity, (item) => `<li><strong>${escapeAdminDetail(formatDate(item.time, true))}</strong> — ${escapeAdminDetail(item.label)}</li>`, 'No historical data available yet.')}
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Organization Details</h2></div>
      <div class="details-grid admin-profile-details-grid">
        ${adminDetailField('Name', organization.organizationName)}
        ${adminDetailField('Organization ID', organizationId)}
        ${adminDetailField('Email', organization.email)}
        ${adminDetailField('Phone', organization.phone)}
        ${adminDetailField('Address', organization.address)}
        ${adminDetailField('City', organization.city)}
        ${adminDetailField('License Number', organization.licenseNumber)}
        ${adminDetailField('Status', status)}
        ${adminDetailField('Registration Date', organization.createdAt ? formatDate(organization.createdAt) : null)}
      </div>
      <div class="admin-record-activity"><h3>Current Inventory Records</h3>${activityList(inventory, (item) => `<li>${escapeAdminDetail(item.bloodGroup || 'Blood group unavailable')} — ${Number(item.units) || 0} units, ${escapeAdminDetail(item.status || 'Status unavailable')}, expiry ${escapeAdminDetail(formatDate(item.expiryDate))}</li>`, 'No matching inventory found.')}</div>
      <div class="admin-record-activity"><h3>Recent Blood Issues</h3>${activityList(bloodIssues, (item) => `<li>${escapeAdminDetail(item.hospitalName || 'Hospital')} — ${escapeAdminDetail(item.bloodGroup || 'Blood group unavailable')}, ${Number(item.units) || 0} units, ${escapeAdminDetail(formatDate(item.issueDate || item.createdAt, true))}</li>`, 'No blood issue records available yet.')}</div>
    </section>
  `);

  const organizationChartIds = ['adminOrgDonationTrend', 'adminOrgRequestTrend', 'adminOrgIssueTrend', 'adminOrgInventoryTrend'];
  organizationChartIds.forEach((id) => {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
  });
  if (donationTrend) renderChart('adminOrgDonationTrend', 'Donations', donationTrend.labels, donationTrend.values, '#C1121F');
  if (requestTrend) renderChart('adminOrgRequestTrend', 'Requests', requestTrend.labels, requestTrend.values, '#0077B6');
  if (issueTrend) renderChart('adminOrgIssueTrend', 'Units issued', issueTrend.labels, issueTrend.values, '#2A9D8F');
  if (inventoryTrend) renderChart('adminOrgInventoryTrend', 'Inventory unit change', inventoryTrend.labels, inventoryTrend.values, '#7209B7');
}

function viewHospital(uid, navigate = true) {
  const hospital = hospitalsList.find((item) => (item.uid || item.id) === uid || item.id === uid);
  if (!hospital) {
    showAdminRecordDetails('Hospital Details', '<p>Record not found.</p>');
    return;
  }
  if (navigate) openAdminProfileDetails('hospitals', hospital.uid || hospital.id);

  const hospitalId = hospital.uid || hospital.id;
  const requests = allRequests
    .filter((request) => request.hospitalId === hospitalId || request.hospitalId === hospital.id)
    .sort(compareRequestsByUrgency);
  const requestIds = new Set(requests.map((request) => String(request.id)));
  const hospitalIssues = allBloodIssues
    .filter((issue) => issue.requestId && requestIds.has(String(issue.requestId)))
    .sort((a, b) => getTimestamp(b.issueDate || b.createdAt) - getTimestamp(a.issueDate || a.createdAt));
  const issueByRequestId = new Map();
  hospitalIssues.forEach((issue) => {
    if (!issueByRequestId.has(String(issue.requestId))) issueByRequestId.set(String(issue.requestId), issue);
  });
  const issuedUnitsForRequest = (request) => {
    const issue = issueByRequestId.get(String(request.id));
    if (issue && issue.units !== null && issue.units !== undefined && Number.isFinite(Number(issue.units))) return Number(issue.units);
    const fallbackUnits = Number(request.issueDetails?.unitsIssued);
    return Number.isFinite(fallbackUnits) ? fallbackUnits : 0;
  };
  const totalRequestedUnits = requests.reduce((sum, request) => sum + (Number(request.units) || 0), 0);
  const totalIssuedUnits = requests.reduce((sum, request) => sum + issuedUnitsForRequest(request), 0);
  const requestStatusCounts = {
    pending: requests.filter((request) => request.status === 'Pending').length,
    processing: requests.filter((request) => request.status === 'Processing').length,
    approved: requests.filter((request) => request.status === 'Approved').length,
    completed: requests.filter((request) => request.status === 'Completed').length,
    rejected: requests.filter((request) => request.status === 'Rejected').length,
    cancelled: requests.filter((request) => request.status === 'Cancelled').length
  };
  const monthlyRequests = getMonthlyProfileSeries(requests, (request) => request.createdAt);
  const monthlyIssues = getMonthlyProfileSeries(
    requests.filter((request) => issuedUnitsForRequest(request) > 0),
    (request) => issueByRequestId.get(String(request.id))?.issueDate || issueByRequestId.get(String(request.id))?.createdAt || request.issuedAt || request.completedAt || request.updatedAt,
    issuedUnitsForRequest
  );
  const organizationGroups = new Map();
  requests.forEach((request) => {
    const issue = issueByRequestId.get(String(request.id));
    const organizationId = issue?.organizationId || request.organizationId;
    if (!organizationId) return;
    const key = String(organizationId);
    const organization = organizationsList.find((item) => (item.uid || item.id) === key || item.id === key);
    const group = organizationGroups.get(key) || {
      name: organization?.organizationName || issue?.organizationName || request.organizationName || 'Organization',
      requests: 0,
      issuedUnits: 0,
      latest: null
    };
    group.requests += 1;
    group.issuedUnits += issuedUnitsForRequest(request);
    const interactionTime = issue?.issueDate || issue?.createdAt || request.createdAt;
    if (getTimestamp(interactionTime) > getTimestamp(group.latest)) group.latest = interactionTime;
    organizationGroups.set(key, group);
  });
  const organizationRows = [...organizationGroups.entries()]
    .sort((a, b) => getTimestamp(b[1].latest) - getTimestamp(a[1].latest))
    .map(([organizationId, organization]) => `<tr><td>${escapeAdminDetail(organization.name)}</td><td>${escapeAdminDetail(organizationId)}</td><td>${organization.requests}</td><td>${organization.issuedUnits}</td><td>${escapeAdminDetail(formatDate(organization.latest, true))}</td></tr>`)
    .join('');
  const requestHistory = requests.length
    ? `<div class="admin-profile-table-wrap"><table class="admin-profile-table"><thead><tr><th>Request Date</th><th>Blood Group</th><th>Units Requested</th><th>Status</th><th>Organization</th><th>Units Issued</th><th>Issue Date</th></tr></thead><tbody>${requests.slice(0, 50).map((request) => {
      const issue = issueByRequestId.get(String(request.id));
      const issueDate = issue?.issueDate || issue?.createdAt || request.issuedAt || request.completedAt;
      return `<tr><td>${escapeAdminDetail(formatDate(request.createdAt, true))}</td><td>${escapeAdminDetail(request.bloodGroup || 'Not available')}</td><td>${escapeAdminDetail(request.units ?? 'Not available')}</td><td>${escapeAdminDetail(request.status || 'Not available')}</td><td>${escapeAdminDetail(request.organizationName || issue?.organizationName || 'Not available')}</td><td>${issuedUnitsForRequest(request)}</td><td>${escapeAdminDetail(issueDate ? formatDate(issueDate, true) : 'Not available')}</td></tr>`;
    }).join('')}</tbody></table></div>${requests.length > 50 ? `<p class="admin-profile-supporting-stat">Showing 50 of ${requests.length} requests.</p>` : ''}`
    : '<p class="admin-profile-empty-state">No request history available yet.</p>';
  const activity = [
    ...requests.filter((request) => getTimestamp(request.createdAt)).map((request) => ({ time: request.createdAt, label: `Blood request created: ${request.bloodGroup || 'Blood group unavailable'}, ${Number(request.units) || 0} units (${request.status || 'Status unavailable'})` })),
    ...requests.filter((request) => request.approvedAt).map((request) => ({ time: request.approvedAt, label: `Request approved: ${request.bloodGroup || 'Blood group unavailable'}` })),
    ...requests.filter((request) => request.rejectedAt).map((request) => ({ time: request.rejectedAt, label: `Request rejected: ${request.bloodGroup || 'Blood group unavailable'}` })),
    ...requests.filter((request) => request.cancelledAt).map((request) => ({ time: request.cancelledAt, label: `Request cancelled: ${request.bloodGroup || 'Blood group unavailable'}` })),
    ...requests.filter((request) => request.completedAt).map((request) => ({ time: request.completedAt, label: `Request completed: ${request.bloodGroup || 'Blood group unavailable'}` })),
    ...requests.filter((request) => !issueByRequestId.has(String(request.id)) && Number(request.issueDetails?.unitsIssued) > 0)
      .map((request) => ({ time: request.issuedAt || request.completedAt, label: `Blood issued: ${request.bloodGroup || 'Blood group unavailable'}, ${Number(request.issueDetails.unitsIssued)} units` })),
    ...hospitalIssues.map((issue) => ({ time: issue.issueDate || issue.createdAt, label: `Blood issued: ${issue.bloodGroup || 'Blood group unavailable'}, ${Number(issue.units) || 0} units` }))
  ].filter((event) => getTimestamp(event.time)).sort((a, b) => getTimestamp(b.time) - getTimestamp(a.time)).slice(0, 15)
    .map((event) => `<li><strong>${escapeAdminDetail(formatDate(event.time, true))}</strong> — ${escapeAdminDetail(event.label)}</li>`).join('');
  const status = hospital.status || (typeof hospital.isApproved === 'boolean' ? (hospital.isApproved ? 'Approved' : 'Pending') : 'Not available');

  showAdminRecordDetails('Hospital Details', `
    <section class="admin-org-summary-grid">
      ${renderAdminProfileMetric('Total requests', requests.length)}
      ${renderAdminProfileMetric('Units requested', totalRequestedUnits)}
      ${renderAdminProfileMetric('Units issued / received', totalIssuedUnits)}
      ${renderAdminProfileMetric('Pending requests', requestStatusCounts.pending)}
      ${renderAdminProfileMetric('Processing requests', requestStatusCounts.processing)}
      ${renderAdminProfileMetric('Approved requests', requestStatusCounts.approved)}
      ${renderAdminProfileMetric('Completed requests', requestStatusCounts.completed)}
      ${renderAdminProfileMetric('Rejected requests', requestStatusCounts.rejected)}
      ${renderAdminProfileMetric('Cancelled requests', requestStatusCounts.cancelled)}
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Request Performance</h2></div>
      <div class="admin-org-analytics-grid">
        <article class="admin-org-chart-card"><h3>Monthly Blood Request Activity</h3>${monthlyRequests ? '<div class="admin-org-chart-wrap"><canvas id="adminHospitalRequestTrend" role="img" aria-label="Monthly blood request activity"></canvas></div>' : '<p class="admin-org-empty-state">No historical data available yet.</p>'}</article>
        <article class="admin-org-chart-card"><h3>Blood Issued Activity (units)</h3>${monthlyIssues ? '<div class="admin-org-chart-wrap"><canvas id="adminHospitalIssueTrend" role="img" aria-label="Monthly blood issued activity"></canvas></div>' : '<p class="admin-org-empty-state">No historical data available yet.</p>'}</article>
      </div>
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Organizations Worked With</h2></div>
      ${organizationRows ? `<div class="admin-profile-table-wrap"><table class="admin-profile-table"><thead><tr><th>Organization</th><th>Organization ID</th><th>Requests</th><th>Units Issued</th><th>Most Recent Interaction</th></tr></thead><tbody>${organizationRows}</tbody></table></div>` : '<p class="admin-org-empty-state">No linked organization request or issue records available.</p>'}
    </section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Request History</h2></div>${requestHistory}</section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Recent Hospital Activity</h2></div>${activity ? `<ul>${activity}</ul>` : '<p class="admin-org-empty-state">No timestamped hospital activity available yet.</p>'}</section>
    <section class="card admin-profile-section"><div class="card-header"><h2>Hospital Details</h2></div>
      <div class="details-grid admin-profile-details-grid">
        ${adminDetailField('Name', hospital.hospitalName)}
        ${adminDetailField('Hospital ID', hospitalId)}
        ${adminDetailField('Email', hospital.email)}
        ${adminDetailField('Phone', hospital.phone)}
        ${adminDetailField('Address', hospital.address)}
        ${adminDetailField('City', hospital.city)}
        ${adminDetailField('License Number', hospital.licenseNumber)}
        ${adminDetailField('Status', status)}
        ${adminDetailField('Registration Date', hospital.createdAt ? formatDate(hospital.createdAt) : null)}
      </div>
    </section>
  `);

  resetAdminProfileCharts(['adminHospitalRequestTrend', 'adminHospitalIssueTrend']);
  if (monthlyRequests) renderChart('adminHospitalRequestTrend', 'Requests', monthlyRequests.labels, monthlyRequests.values, '#0077B6');
  if (monthlyIssues) renderChart('adminHospitalIssueTrend', 'Units issued', monthlyIssues.labels, monthlyIssues.values, '#2A9D8F');
}

function adminDetailField(label, value) {
  const displayValue = value === null || value === undefined || value === '' ? 'Not available' : value;
  return `<div><strong>${escapeAdminDetail(label)}:</strong> ${escapeAdminDetail(displayValue)}</div>`;
}

function renderAdminProfileMetric(label, value) {
  return `<article class="admin-org-metric"><span>${escapeAdminDetail(label)}</span><strong>${escapeAdminDetail(value)}</strong></article>`;
}

function getMonthlyProfileSeries(records, dateSelector, valueSelector = () => 1) {
  const totals = new Map();
  records.forEach((record) => {
    const timestamp = getTimestamp(dateSelector(record));
    if (!timestamp) return;
    const date = new Date(timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    totals.set(key, (totals.get(key) || 0) + valueSelector(record));
  });
  const months = [...totals.keys()].sort();
  if (months.length < 2) return null;
  return {
    labels: months.map((month) => new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })),
    values: months.map((month) => totals.get(month))
  };
}

function resetAdminProfileCharts(chartIds) {
  chartIds.forEach((id) => {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
  });
}

function escapeAdminDetail(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function openAdminProfileDetails(profileType, recordId) {
  showView('adminProfileDetail', 'push', { screen: 'profileDetail', profileType, recordId });
  window.scrollTo(0, 0);
}

function renderCurrentAdminProfileDetails() {
  if (history.state?.screen === 'profileDetail') {
    renderAdminProfileDetails(history.state.profileType, history.state.recordId);
  }
}

function renderAdminProfileDetails(profileType, recordId) {
  if (!recordId) return;
  if (profileType === 'donors') viewDonor(recordId, false);
  else if (profileType === 'organizations') viewOrg(recordId, false);
  else if (profileType === 'hospitals') viewHospital(recordId, false);
}

function showAdminProfilePage({ title, name, backLabel, status, subtitle, imageUrl, details = [], sections = [] }) {
  const content = document.getElementById('adminProfileDetailContent');
  const backButton = document.getElementById('adminProfileBackButton');
  if (!content || !backButton) return;
  resetAdminProfileCharts([
    'adminOrgDonationTrend', 'adminOrgRequestTrend', 'adminOrgIssueTrend', 'adminOrgInventoryTrend',
    'adminDonorDonationTrend', 'adminHospitalRequestTrend', 'adminHospitalIssueTrend'
  ]);
  backButton.querySelector('span').textContent = backLabel || 'Back';
  const image = imageUrl
    ? `<img class="admin-profile-avatar" src="${escapeAdminDetail(imageUrl)}" alt="${escapeAdminDetail(name)} profile image">`
    : '<div class="admin-profile-avatar admin-profile-avatar-placeholder" aria-hidden="true"><i class="fas fa-user"></i></div>';
  const detailFields = details.map(([label, value]) => adminDetailField(label, value)).join('');
  const sectionMarkup = sections.map((section) => `
    <section class="card admin-profile-section">
      <div class="card-header"><h2>${escapeAdminDetail(section.title)}</h2></div>
      <div class="admin-profile-section-content">${section.content}</div>
    </section>`).join('');
  content.innerHTML = `
    <header class="card admin-profile-hero">
      ${image}
      <div class="admin-profile-hero-copy">
        <p class="dashboard-subtitle">${escapeAdminDetail(title)}</p>
        <h1>${escapeAdminDetail(name)}</h1>
        ${subtitle ? `<p class="admin-profile-subtitle">${escapeAdminDetail(subtitle)}</p>` : ''}
      </div>
      ${status ? `<span class="badge ${getStatusBadgeClass(status)}">${escapeAdminDetail(status)}</span>` : ''}
    </header>
    ${detailFields ? `<section class="card admin-profile-section"><div class="card-header"><h2>Profile Details</h2></div><div class="details-grid admin-profile-details-grid">${detailFields}</div></section>` : ''}
    ${sectionMarkup}`;
}

function getAdminProfileImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const imageUrl = new URL(value, window.location.href);
    return ['https:', 'http:'].includes(imageUrl.protocol) ? imageUrl.href : '';
  } catch {
    return '';
  }
}

function renderAdminBloodGroupSummary(inventory) {
  const groups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  const cards = groups.map((group) => `
    <div class="admin-profile-stock-item"><span>${group}</span><strong>${inventory.totalsByGroup[group]}</strong><small>units</small></div>`).join('');
  return `<div class="admin-profile-stock-grid">${cards}</div><p class="admin-profile-stock-total"><strong>Total Available Units</strong><span>${inventory.total} units</span></p>`;
}

function showAdminRecordDetails(title, content) {
  const profileState = history.state;
  if (profileState?.screen === 'profileDetail') {
    const profileType = profileState.profileType;
    const lists = { donors: donorsList, organizations: organizationsList, hospitals: hospitalsList };
    const profile = lists[profileType]?.find((item) => (item.uid || item.id) === profileState.recordId || item.id === profileState.recordId);
    if (profile) {
      const isDonor = profileType === 'donors';
      const isOrganization = profileType === 'organizations';
      const name = isDonor ? profile.fullName : isOrganization ? profile.organizationName : profile.hospitalName;
      const status = profile.status || (typeof profile.isApproved === 'boolean' ? (profile.isApproved ? 'Approved' : 'Pending') : 'Not available');
      const donorPhoto = isDonor ? getAdminProfileImageUrl(profile.profilePhoto || profile.photoURL || profile.photoUrl || profile.profileImage || profile.avatarUrl) : '';
      const sections = [];
      if (isOrganization) {
        sections.push({ title: 'Available Blood Inventory', content: renderAdminBloodGroupSummary(getAdminOrganizationInventory(profile)) });
      }
      sections.push({ title: title.replace(/ Details$/, ''), content });
      showAdminProfilePage({
        title: isOrganization ? 'Organization Profile & Performance' : `${isDonor ? 'Donor' : 'Hospital'} Profile`,
        name: name || (isDonor ? 'Donor' : isOrganization ? 'Organization' : 'Hospital'),
        backLabel: `Back to ${isDonor ? 'Donors' : isOrganization ? 'Organizations' : 'Hospitals'}`,
        status,
        subtitle: profile.city || profile.address || (isDonor && profile.bloodGroup ? `Blood Group ${profile.bloodGroup}` : ''),
        imageUrl: donorPhoto,
        sections
      });
      return;
    }
  }
  const modal = document.getElementById('adminRecordDetailsModal');
  const titleElement = document.getElementById('adminRecordDetailsTitle');
  const contentElement = document.getElementById('adminRecordDetailsContent');
  if (!modal || !titleElement || !contentElement) return;
  titleElement.textContent = title;
  contentElement.innerHTML = content;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAdminRecordDetails() {
  const modal = document.getElementById('adminRecordDetailsModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

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
    const adminName = 'Administration';
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
          borderWidth: isPie ? 1.5 : 2,
          hoverOffset: isPie ? 6 : 0,
          radius: isPie ? '85%' : undefined,
          cutout: type === 'doughnut' ? '60%' : undefined,
          tension: type === 'line' ? 0.35 : 0,
          fill: type === 'line' ? { target: 'origin', above: 'rgba(193, 18, 31, 0.08)' } : (type !== 'pie' && type !== 'doughnut'),
          borderRadius: type === 'bar' ? 5 : 0,
          borderSkipped: false,
          maxBarThickness: 24,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
          pointRadius: type === 'line' ? 3.5 : 0,
          pointHoverRadius: type === 'line' ? 6 : 0,
          pointBackgroundColor: type === 'line' ? '#ffffff' : undefined,
          pointBorderWidth: type === 'line' ? 2 : undefined
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      },
      layout: {
        padding: isPie ? { top: 4, right: 6, bottom: 4, left: 6 } : { top: 6, right: 8, bottom: 4, left: 4 }
      },
      plugins: {
        legend: {
          display: isPie,
          position: 'bottom',
          labels: {
            padding: 6,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            font: {
              size: 10.5,
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
          titleFont: { size: 13, weight: 'bold', family: "'Outfit', 'Inter', sans-serif" },
          bodyFont: { size: 12, weight: '500', family: "'Outfit', 'Inter', sans-serif" },
          padding: 10,
          boxPadding: 5,
          cornerRadius: 6,
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
            font: { size: 11, weight: '500', family: "'Outfit', 'Inter', sans-serif" },
            color: '#64748B'
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226, 232, 240, 0.7)' },
          ticks: {
            font: { size: 11, weight: '500', family: "'Outfit', 'Inter', sans-serif" },
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

function readAdminNotificationTimeValue(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    if (Number.isFinite(millis)) return millis;
  }
  const seconds = typeof value.seconds === 'number'
    ? value.seconds
    : (typeof value._seconds === 'number' ? value._seconds : null);
  if (seconds != null) {
    const nanos = typeof value.nanoseconds === 'number'
      ? value.nanoseconds
      : (typeof value._nanoseconds === 'number' ? value._nanoseconds : 0);
    return seconds * 1000 + Math.floor(nanos / 1e6);
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isNaN(millis) ? 0 : millis;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function getAdminNotificationTime(notif) {
  const value = notif?.createdAt ?? notif?.timestamp ?? notif?.sentAt ?? notif?.date ?? null;
  return readAdminNotificationTimeValue(value);
}

function sortAdminNotificationsByDateTime(notifications) {
  return [...(notifications || [])].sort((a, b) => {
    const diff = getAdminNotificationTime(b) - getAdminNotificationTime(a);
    if (diff !== 0) return diff;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

function adminNotificationDateKey(timestamp) {
  if (!timestamp) return 'undated';
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function adminNotificationDateLabel(timestamp) {
  if (!timestamp) return 'Earlier';
  const date = new Date(timestamp);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startToday - startDate) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function displayAdminNotifications(notifications) {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  const sortedNotifications = sortAdminNotificationsByDateTime(notifications);

  if (!sortedNotifications.length) {
    container.innerHTML = '<div class="empty-state"><p>No notifications available.</p></div>';
    return;
  }

  const groups = [];
  const groupMap = new Map();
  sortedNotifications.forEach((notif) => {
    const timestamp = getAdminNotificationTime(notif);
    const key = adminNotificationDateKey(timestamp);
    if (!groupMap.has(key)) {
      const group = { key, label: adminNotificationDateLabel(timestamp), items: [] };
      groupMap.set(key, group);
      groups.push(group);
    }
    groupMap.get(key).items.push({ notif, timestamp });
  });

  let html = '';
  groups.forEach((group) => {
    html += `<section class="notification-date-group"><h3 class="notification-date-heading">${group.label}</h3>`;
    group.items.forEach(({ notif, timestamp }) => {
      const date = timestamp ? new Date(timestamp) : null;
      const timeAgo = date ? getTimeAgo(date) : '';
      const clock = date
        ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : '';
      const timeLabel = [clock, timeAgo].filter(Boolean).join(' · ');
      const isOutgoing = (notif.senderId || notif.fromUserId) === currentAdmin.uid;
      const senderLabel = isOutgoing
        ? `To: ${notif.recipientName || notif.targetUserName || notif.recipientRole || 'Recipient'}`
        : (notif.senderName ? `From: ${notif.senderName}` : 'From: System');

      html += `
      <div class="notification-item ${!notif.isRead ? 'unread' : ''}" data-notification-id="${notif.id}">
        <div class="notification-icon">
          <i class="fas ${isOutgoing ? 'fa-paper-plane' : 'fa-inbox'}" title="${isOutgoing ? 'Sent' : 'Received'}"></i>
        </div>
        <div class="notification-content">
          <div class="notification-title">${notif.title || 'Notification'}</div>
          <div class="notification-sender">${senderLabel}</div>
          <div class="notification-message">${notif.message || ''}</div>
          <div class="notification-time">${timeLabel}</div>
        </div>
        <button type="button" class="btn btn-danger btn-sm delete-notification-btn delete-btn" data-notification-id="${notif.id}" aria-label="Delete notification" title="Delete notification">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;
    });
    html += '</section>';
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

// Initialize Search & Filter Toolbar clear buttons and reset actions
function initToolbarEnhancements() {
  document.addEventListener('input', (e) => {
    if (e.target.matches('.table-search, .filter-search-input, .filter-bar input[type="text"]')) {
      const wrapper = e.target.closest('.filter-search-input-group');
      if (wrapper) {
        const clearBtn = wrapper.querySelector('.filter-clear-btn');
        if (clearBtn) {
          clearBtn.style.display = e.target.value.trim() ? 'flex' : 'none';
        }
      }
    }
  });

  document.addEventListener('click', (e) => {
    const clearBtn = e.target.closest('.filter-clear-btn');
    if (clearBtn) {
      const wrapper = clearBtn.closest('.filter-search-input-group');
      const input = wrapper?.querySelector('input');
      if (input) {
        input.value = '';
        clearBtn.style.display = 'none';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
    }

    const resetBtn = e.target.closest('.btn-reset-filters');
    if (resetBtn) {
      const container = resetBtn.closest('.filter-toolbar-card, .filter-bar, .table-actions');
      if (container) {
        container.querySelectorAll('input[type="text"]').forEach((inp) => {
          inp.value = '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        });
        container.querySelectorAll('select').forEach((sel) => {
          sel.selectedIndex = 0;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        container.querySelectorAll('input[type="date"]').forEach((dt) => {
          dt.value = '';
          dt.dispatchEvent(new Event('change', { bubbles: true }));
        });
        container.querySelectorAll('.filter-clear-btn').forEach((btn) => {
          btn.style.display = 'none';
        });
      }
    }
  });
}
initToolbarEnhancements();
