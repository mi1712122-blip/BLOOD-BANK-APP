import {
  collection,
  doc,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { authManager, getApprovalStatus, renderApprovalStatusNotice, requireApprovedAccount } from '../../../assets/js/auth.js';
import { bloodInventoryManager, getInventoryExpiryDate, isAvailableInventory } from '../../../assets/js/inventory.js';
import { bloodRequestManager, compareRequestsByUrgency } from '../../../assets/js/requests.js';
import { db } from '../../../assets/js/firebase-config.js';

let currentHospital = null;
let currentView = 'dashboard';
let notificationsListener = null;
let inventoryListener = null;
let organizationsListener = null;

let allOrganizations = [];
let allInventoryItems = [];
let allNotifications = [];
let allHospitalRequests = [];
let hospitalRequestsLoaded = false;
let hospitalRequestsLoadError = null;
let hospitalNotificationsLoaded = false;
let hospitalNotificationsLoadError = null;
let availabilityOrganizationsLoaded = false;
let availabilityInventoryLoaded = false;
const availabilityLoadErrors = { organizations: null, inventory: null };

const viewSelectors = {
  dashboard: 'dashboardView',
  'request-blood': 'request-bloodView',
  'blood-availability': 'blood-availabilityView',
  'request-history': 'request-historyView',
  notifications: 'notificationsView',
  settings: 'settingsView'
};

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
document.addEventListener('DOMContentLoaded', async () => {
  const isAuthLoaded = await checkAuthAndLoadHospital();
  if (!isAuthLoaded) return;
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
    return false;
  }
  if (user.data?.profileComplete === false) {
    window.location.href = '../../auth/complete-profile.html';
    return false;
  }
  
  currentHospital = user.data;
  document.getElementById('hospitalName').textContent = currentHospital.hospitalName || 'Hospital';
  renderApprovalStatusNotice(currentHospital, document.getElementById('approvalStatusNotice'));
  onSnapshot(doc(db, 'users', currentHospital.uid), (docSnap) => {
    if (!docSnap.exists()) return;
    currentHospital = { ...currentHospital, ...docSnap.data() };
    renderApprovalStatusNotice(currentHospital, document.getElementById('approvalStatusNotice'));
    const blocked = getApprovalStatus(currentHospital) !== 'Approved';
    document.querySelectorAll('#requestBloodForm input, #requestBloodForm select, #requestBloodForm textarea, #requestBloodForm button').forEach((control) => { control.disabled = blocked; });
  });
  onSnapshot(doc(db, 'hospitals', currentHospital.uid), (docSnap) => {
    if (!docSnap.exists()) return;
    currentHospital = { ...currentHospital, ...docSnap.data() };
    renderApprovalStatusNotice(currentHospital, document.getElementById('approvalStatusNotice'));
  });

  if (notificationsListener) notificationsListener();

  notificationsListener = bloodRequestManager.listenNotifications(currentHospital.uid, (result) => {
    if (!result.success) {
      hospitalNotificationsLoadError = result.error || 'Notifications could not be loaded.';
      renderHospitalRecentActivity();
      return;
    }
    const notifications = result.data || [];
    allNotifications = notifications;
    hospitalNotificationsLoaded = true;
    hospitalNotificationsLoadError = null;
    const unreadCount = notifications.filter((item) => !item.isRead).length;
    updateHospitalNotificationBadges(unreadCount);
    renderHospitalRecentActivity();
    if (currentView === 'notifications') {
      displayNotifications(notifications);
    }
  });
  return true;
}

function setupRealtimeListeners() {
  if (organizationsListener) organizationsListener();
  if (inventoryListener) inventoryListener();
  availabilityOrganizationsLoaded = false;
  availabilityInventoryLoaded = false;
  availabilityLoadErrors.organizations = null;
  availabilityLoadErrors.inventory = null;
  renderBloodAvailability();

  // Listen for organizations
  organizationsListener = onSnapshot(collection(db, 'organizations'), (snapshot) => {
    allOrganizations = [];
    snapshot.forEach((docSnap) => {
      allOrganizations.push({ id: docSnap.id, ...docSnap.data() });
    });
    availabilityOrganizationsLoaded = true;
    availabilityLoadErrors.organizations = null;
    populateOrganizationSelector();
    renderBloodAvailability();
    renderHospitalAvailabilitySnapshot();
  }, (error) => {
    console.error('Error loading hospital availability organizations:', error);
    availabilityLoadErrors.organizations = error;
    renderBloodAvailability();
    renderHospitalAvailabilitySnapshot();
  });

  // Listen for blood inventory items
  inventoryListener = onSnapshot(collection(db, 'bloodInventory'), (snapshot) => {
    allInventoryItems = [];
    snapshot.forEach((docSnap) => {
      allInventoryItems.push({ id: docSnap.id, ...docSnap.data() });
    });
    availabilityInventoryLoaded = true;
    availabilityLoadErrors.inventory = null;
    renderBloodAvailability();
    renderHospitalAvailabilitySnapshot();
  }, (error) => {
    console.error('Error loading hospital availability inventory:', error);
    availabilityLoadErrors.inventory = error;
    renderBloodAvailability();
    renderHospitalAvailabilitySnapshot();
  });
}

function populateOrganizationSelector(selectedOrganizationId = '') {
  const select = document.getElementById('requestOrganization');
  if (!select) return;

  const organizations = allOrganizations.filter((org) => getApprovalStatus(org) === 'Approved');
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
    if (!requestsResult.success) {
      hospitalRequestsLoadError = requestsResult.error || 'Hospital requests could not be loaded.';
      console.error('Error loading hospital requests:', hospitalRequestsLoadError);
      renderHospitalDashboardOverview();
    } else {
      allHospitalRequests = requestsResult.data || [];
      hospitalRequestsLoaded = true;
      hospitalRequestsLoadError = null;
      displayRequestHistory(allHospitalRequests);
      renderHospitalDashboardOverview();
    }
    
    loadSettings();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    hospitalRequestsLoadError = error?.message || 'Hospital requests could not be loaded.';
    renderHospitalDashboardOverview();
  }
}

function getHospitalTimestamp(value) {
  try {
    if (value == null) return null;
    let milliseconds;
    if (typeof value.toMillis === 'function') {
      milliseconds = value.toMillis();
    } else if (typeof value.toDate === 'function') {
      milliseconds = value.toDate().getTime();
    } else if (typeof value.seconds === 'number') {
      milliseconds = value.seconds * 1000;
    } else {
      milliseconds = value instanceof Date ? value.getTime() : new Date(value).getTime();
    }
    return Number.isFinite(milliseconds) && Number.isFinite(new Date(milliseconds).getTime())
      ? milliseconds
      : null;
  } catch {
    return null;
  }
}

function escapeHospitalOverviewText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function getHospitalOrganizationLookup() {
  const organizations = new Map();
  allOrganizations.forEach((organization) => {
    if (getApprovalStatus(organization) !== 'Approved') return;
    if (organization.uid) organizations.set(String(organization.uid), organization);
    if (organization.id) organizations.set(String(organization.id), organization);
  });
  return organizations;
}

function renderHospitalDashboardOverview() {
  renderHospitalRequestMetrics();
  renderHospitalAvailabilitySnapshot();
  renderRequestsRequiringAttention();
  renderRequestActivity();
  renderRecentRequests(allHospitalRequests);
  renderHospitalRecentActivity();
}

function renderHospitalRequestMetrics() {
  const metricIds = {
    Pending: 'pendingRequests',
    Processing: 'processingRequests',
    Completed: 'completedRequests',
    Rejected: 'rejectedRequests',
    Cancelled: 'cancelledRequests'
  };

  if (!hospitalRequestsLoaded || hospitalRequestsLoadError) {
    Object.values(metricIds).forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = '—';
    });
    return;
  }

  const counts = allHospitalRequests.reduce((totals, request) => {
    if (Object.prototype.hasOwnProperty.call(totals, request.status)) totals[request.status] += 1;
    return totals;
  }, { Pending: 0, Processing: 0, Completed: 0, Rejected: 0, Cancelled: 0 });

  Object.entries(metricIds).forEach(([status, id]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = counts[status].toLocaleString();
  });
}

function renderHospitalAvailabilitySnapshot() {
  const container = document.getElementById('hospitalAvailabilitySnapshot');
  if (!container) return;

  if (availabilityLoadErrors.organizations || availabilityLoadErrors.inventory) {
    container.innerHTML = '<p class="hospital-overview-empty">Blood availability could not be loaded.</p>';
    return;
  }
  if (!availabilityOrganizationsLoaded || !availabilityInventoryLoaded) {
    container.innerHTML = '<div class="hospital-overview-state" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Loading approved organization inventory…</span></div>';
    return;
  }

  const approvedOrganizations = getHospitalOrganizationLookup();
  const unitsByGroup = new Map(bloodGroups.map((group) => [group, 0]));
  allInventoryItems.forEach((item) => {
    if (!isAvailableInventory(item) || !approvedOrganizations.has(String(item.organizationId || ''))) return;
    if (unitsByGroup.has(item.bloodGroup)) {
      unitsByGroup.set(item.bloodGroup, unitsByGroup.get(item.bloodGroup) + Number(item.units));
    }
  });

  container.innerHTML = `
    <div class="hospital-availability-group-grid">
      ${bloodGroups.map((group) => {
        const units = unitsByGroup.get(group);
        return `
          <div class="hospital-availability-group-card">
            <span class="hospital-availability-group-name">${escapeHospitalOverviewText(group)}</span>
            <strong>${units.toLocaleString()}</strong>
            <small>${units === 1 ? 'unit' : 'units'}</small>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getHospitalRequestOrganizationName(request, approvedOrganizations) {
  const organizationId = String(request.organizationId || '');
  const organization = approvedOrganizations.get(organizationId);
  return organization?.organizationName || organization?.hospitalName || request.organizationName || 'Organization unavailable';
}

function formatHospitalRequestDate(request) {
  const timestamp = getHospitalTimestamp(request.createdAt);
  return timestamp === null ? 'Date unavailable' : new Date(timestamp).toLocaleDateString();
}

function renderRequestsRequiringAttention() {
  const container = document.getElementById('requestsRequiringAttention');
  if (!container) return;
  if (hospitalRequestsLoadError) {
    container.innerHTML = '<p class="hospital-overview-empty">Hospital requests could not be loaded.</p>';
    return;
  }
  if (!hospitalRequestsLoaded) {
    container.innerHTML = '<div class="hospital-overview-state" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Loading hospital requests…</span></div>';
    return;
  }

  const approvedOrganizations = getHospitalOrganizationLookup();
  const requests = allHospitalRequests
    .filter((request) => request.status === 'Pending' || request.status === 'Processing')
    .sort((a, b) => {
      const statusPriority = (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1);
      return statusPriority || compareRequestsByUrgency(a, b);
    });

  if (!requests.length) {
    container.innerHTML = '<p class="hospital-overview-empty">No requests currently require attention.</p>';
    return;
  }

  container.innerHTML = `
    <div class="hospital-attention-list">
      ${requests.slice(0, 5).map((request) => `
        <article class="hospital-attention-item">
          <div class="hospital-attention-main">
            <div class="hospital-attention-title">
              <strong>${escapeHospitalOverviewText(request.bloodGroup || 'Blood group unavailable')} · ${escapeHospitalOverviewText(request.units ?? 'Units unavailable')} units</strong>
              <span class="request-status status-${escapeHospitalOverviewText(request.status.toLowerCase())}">${escapeHospitalOverviewText(request.status)}</span>
            </div>
            <p>${escapeHospitalOverviewText(getHospitalRequestOrganizationName(request, approvedOrganizations))}</p>
            <small>${escapeHospitalOverviewText(formatHospitalRequestDate(request))} · ${escapeHospitalOverviewText(request.urgencyLevel || request.urgency || 'Urgency unavailable')}</small>
          </div>
          <div class="hospital-attention-actions">
            ${request.status === 'Pending'
              ? `<button type="button" class="btn btn-danger btn-sm btn-cancel-request" data-request-id="${escapeHospitalOverviewText(request.id)}">Cancel</button>`
              : '<button type="button" class="btn btn-secondary btn-sm hospital-attention-history">View History</button>'}
          </div>
        </article>
      `).join('')}
      ${requests.length > 5 ? `<p class="hospital-overview-supporting">${requests.length - 5} more requests in progress</p>` : ''}
    </div>
  `;

  attachCancelRequestListeners(container);
  container.querySelectorAll('.hospital-attention-history').forEach((button) => {
    button.addEventListener('click', () => showView('request-history'));
  });
}

function renderRequestActivity() {
  const container = document.getElementById('requestActivityChart');
  if (!container) return;
  if (hospitalRequestsLoadError) {
    container.innerHTML = '<p class="hospital-overview-empty">Request activity could not be loaded.</p>';
    return;
  }
  if (!hospitalRequestsLoaded) {
    container.innerHTML = '<div class="hospital-overview-state" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Loading request activity…</span></div>';
    return;
  }

  const now = new Date();
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const monthCounts = new Map();
  allHospitalRequests.forEach((request) => {
    const timestamp = getHospitalTimestamp(request.createdAt);
    if (timestamp === null) return;
    const createdAt = new Date(timestamp);
    if (createdAt > now || createdAt < firstMonth) return;
    const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  });

  if (monthCounts.size < 2) {
    container.innerHTML = '<p class="hospital-overview-empty">Not enough dated request history to show a monthly trend yet.</p>';
    return;
  }

  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      label: date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      count: monthCounts.get(key) || 0
    });
  }
  const maxCount = Math.max(...months.map((month) => month.count));
  container.innerHTML = `
    <div class="hospital-request-chart" role="img" aria-label="Requests created per month during the last six months">
      ${months.map((month) => {
        const height = month.count ? Math.max(8, Math.round((month.count / maxCount) * 100)) : 0;
        return `
          <div class="hospital-request-chart-column" aria-label="${escapeHospitalOverviewText(month.label)}: ${month.count} requests">
            <strong>${month.count}</strong>
            <div class="hospital-request-chart-track"><span style="height:${height}%"></span></div>
            <small>${escapeHospitalOverviewText(month.label)}</small>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderRecentRequests(requests) {
  const container = document.getElementById('recentRequestsList');
  if (!container) return;
  if (hospitalRequestsLoadError) {
    container.innerHTML = '<p class="hospital-overview-empty">Recent requests could not be loaded.</p>';
    return;
  }
  if (!hospitalRequestsLoaded) {
    container.innerHTML = '<div class="hospital-overview-state" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Loading recent requests…</span></div>';
    return;
  }

  const approvedOrganizations = getHospitalOrganizationLookup();
  const sortedRequests = [...requests].sort((a, b) => {
    const aTimestamp = getHospitalTimestamp(a.createdAt);
    const bTimestamp = getHospitalTimestamp(b.createdAt);
    if (aTimestamp === null && bTimestamp === null) return 0;
    if (aTimestamp === null) return 1;
    if (bTimestamp === null) return -1;
    return bTimestamp - aTimestamp;
  });
  if (!sortedRequests.length) {
    container.innerHTML = '<p class="hospital-overview-empty">No blood requests yet.</p>';
    return;
  }

  container.innerHTML = `
    <div class="hospital-recent-request-list">
      ${sortedRequests.slice(0, 5).map((request) => `
        <article class="hospital-recent-request">
          <div class="hospital-recent-request-blood">
            <span class="hospital-availability-group-name">${escapeHospitalOverviewText(request.bloodGroup || 'N/A')}</span>
            <strong>${escapeHospitalOverviewText(request.units ?? 'N/A')} units</strong>
          </div>
          <div class="hospital-recent-request-details">
            <strong>${escapeHospitalOverviewText(getHospitalRequestOrganizationName(request, approvedOrganizations))}</strong>
            <span>Request ID: ${escapeHospitalOverviewText(request.id || 'Unavailable')}</span>
          </div>
          <div class="hospital-recent-request-meta">
            <span class="request-status status-${escapeHospitalOverviewText(String(request.status || 'unknown').toLowerCase())}">${escapeHospitalOverviewText(request.status || 'Status unavailable')}</span>
            <span>${escapeHospitalOverviewText(request.urgencyLevel || request.urgency || 'Urgency unavailable')}</span>
            <time>${escapeHospitalOverviewText(formatHospitalRequestDate(request))}</time>
          </div>
          ${request.status === 'Pending'
            ? `<button type="button" class="btn btn-danger btn-sm btn-cancel-request" data-request-id="${escapeHospitalOverviewText(request.id)}">Cancel</button>`
            : ''}
        </article>
      `).join('')}
    </div>
  `;
  attachCancelRequestListeners(container);
}

function getNotificationBloodGroup(notification) {
  const message = `${notification.title || ''} ${notification.message || ''}`;
  return message.match(/\b(?:A|B|AB|O)[+-]\b/)?.[0] || '';
}

function renderHospitalRecentActivity() {
  const container = document.getElementById('hospitalRecentActivity');
  if (!container) return;
  if (hospitalNotificationsLoadError) {
    container.innerHTML = '<p class="hospital-overview-empty">Recent activity could not be loaded.</p>';
    return;
  }
  if (!hospitalNotificationsLoaded) {
    container.innerHTML = '<div class="hospital-overview-state" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Loading recent activity…</span></div>';
    return;
  }

  const supportedTypes = new Set(['request_submitted', 'request_approved', 'processing_started', 'request_rejected', 'blood_delivered']);
  const notifications = allNotifications.filter((notification) => supportedTypes.has(notification.type));
  const suppressedApprovals = new Set();
  const pairedProcessingNotifications = new Set();
  notifications.forEach((processing) => {
    if (processing.type !== 'processing_started') return;
    const processingTimestamp = getHospitalTimestamp(processing.createdAt);
    const group = getNotificationBloodGroup(processing);
    if (processingTimestamp === null || !group) return;
    const pairedApproval = notifications.find((approval) => {
      if (approval.type !== 'request_approved'
        || (approval.senderId || '') !== (processing.senderId || '')
        || getNotificationBloodGroup(approval) !== group) return false;
      const approvalTimestamp = getHospitalTimestamp(approval.createdAt);
      return approvalTimestamp !== null
        && approvalTimestamp <= processingTimestamp
        && processingTimestamp - approvalTimestamp <= 5 * 60 * 1000;
    });
    if (pairedApproval) {
      suppressedApprovals.add(pairedApproval.id);
      pairedProcessingNotifications.add(processing.id);
    }
  });

  const recent = notifications
    .filter((notification) => !suppressedApprovals.has(notification.id))
    .slice(0, 5);
  if (!recent.length) {
    container.innerHTML = '<p class="hospital-overview-empty">No recent request activity.</p>';
    return;
  }

  container.innerHTML = `
    <ul class="hospital-recent-activity-list">
      ${recent.map((notification) => {
        const isPairedProcessing = pairedProcessingNotifications.has(notification.id);
        const timestamp = getHospitalTimestamp(notification.createdAt);
        return `
          <li class="hospital-recent-activity-item">
            <span class="hospital-recent-activity-icon"><i class="fas ${notification.type === 'blood_delivered' ? 'fa-truck-medical' : 'fa-bell'}" aria-hidden="true"></i></span>
            <div>
              <strong>${isPairedProcessing ? 'Request approved · Processing started' : escapeHospitalOverviewText(notification.title || 'Request update')}</strong>
              <p>${escapeHospitalOverviewText(notification.message || '')}</p>
              <time>${timestamp === null ? 'Time unavailable' : escapeHospitalOverviewText(getTimeAgo(new Date(timestamp)))}</time>
            </div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

/* ==========================================================================
   BLOOD AVAILABILITY MODULE
   ========================================================================== */

function setupAvailabilityControls() {
  document.getElementById('hospAvailSearch')?.addEventListener('input', renderBloodAvailability);
  document.getElementById('hospAvailGroupFilter')?.addEventListener('change', renderBloodAvailability);
  document.getElementById('hospAvailOrganizationFilter')?.addEventListener('change', renderBloodAvailability);
  document.getElementById('hospAvailCityFilter')?.addEventListener('change', renderBloodAvailability);
  document.getElementById('hospAvailSort')?.addEventListener('change', renderBloodAvailability);
  document.getElementById('hospAvailRefreshBtn')?.addEventListener('click', setupRealtimeListeners);
  document.getElementById('viewPreviousRequestsBtn')?.addEventListener('click', () => showView('request-history'));
}

function escapeAvailabilityText(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function setAvailabilityMetric(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function populateAvailabilityFilter(selectId, label, options, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">${escapeAvailabilityText(label)}</option>` +
    options.map((option) => `<option value="${escapeAvailabilityText(option.value)}">${escapeAvailabilityText(option.label)}</option>`).join('');
  select.value = options.some((option) => option.value === selectedValue) ? selectedValue : '';
}

function getAvailabilityStatus(units) {
  if (units <= 0) return { text: 'Out of Stock', className: 'badge-stock-out' };
  if (units < 10) return { text: 'Low Stock', className: 'badge-stock-low' };
  return { text: 'Available', className: 'badge-stock-available' };
}

function renderBloodAvailability() {
  const container = document.getElementById('availabilityResults');
  if (!container) return;

  if (availabilityLoadErrors.organizations || availabilityLoadErrors.inventory) {
    setAvailabilityMetric('availTotalUnits', '—');
    setAvailabilityMetric('availOrganizationsCount', '—');
    setAvailabilityMetric('availBloodGroupsCount', '—');
    setAvailabilityMetric('hospAvailRecordCount', '—');
    container.innerHTML = `
      <div class="hospital-availability-state hospital-availability-error" role="alert">
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        <div>
          <strong>Blood availability could not be loaded</strong>
          <p>Please check your connection and use Refresh Now to try again.</p>
        </div>
      </div>
    `;
    return;
  }

  if (!availabilityOrganizationsLoaded || !availabilityInventoryLoaded) {
    setAvailabilityMetric('availTotalUnits', '—');
    setAvailabilityMetric('availOrganizationsCount', '—');
    setAvailabilityMetric('availBloodGroupsCount', '—');
    setAvailabilityMetric('hospAvailRecordCount', '—');
    container.innerHTML = `
      <div class="hospital-availability-state" role="status">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <div>
          <strong>Loading blood availability</strong>
          <p>Checking approved organizations and current inventory.</p>
        </div>
      </div>
    `;
    return;
  }

  const organizationMap = new Map();
  allOrganizations.forEach((org) => {
    if (getApprovalStatus(org) !== 'Approved') return;
    if (org.uid) organizationMap.set(String(org.uid), org);
    if (org.id) organizationMap.set(String(org.id), org);
  });

  const stockMap = new Map();
  allInventoryItems.forEach((item) => {
    if (!isAvailableInventory(item)) return;

    const organizationId = String(item.organizationId || '');
    const organization = organizationMap.get(organizationId);
    const bloodGroup = item.bloodGroup;
    if (!organization || !bloodGroups.includes(bloodGroup)) return;

    const requestOrganizationId = String(organization.uid || organization.id || '');
    if (!requestOrganizationId) return;
    const key = JSON.stringify([requestOrganizationId, bloodGroup]);
    let record = stockMap.get(key);
    if (!record) {
      const city = typeof organization.city === 'string' && organization.city.trim()
        ? organization.city.trim()
        : 'N/A';
      record = {
        bloodGroup,
        requestOrganizationId,
        organizationName: organization.organizationName || organization.hospitalName || 'Name unavailable',
        city,
        units: 0,
        nearestExpiry: null
      };
      stockMap.set(key, record);
    }

    record.units += Number(item.units);
    const expiryDate = getInventoryExpiryDate(item.expiryDate);
    if (expiryDate && (!record.nearestExpiry || expiryDate < record.nearestExpiry)) record.nearestExpiry = expiryDate;
  });

  const records = [...stockMap.values()];
  const totalAvailableUnits = records.reduce((sum, item) => sum + item.units, 0);
  const organizationCount = new Set(records.map((item) => item.requestOrganizationId)).size;
  const availableBloodGroupCount = new Set(records.map((item) => item.bloodGroup)).size;
  setAvailabilityMetric('availTotalUnits', totalAvailableUnits.toLocaleString());
  setAvailabilityMetric('availOrganizationsCount', organizationCount.toLocaleString());
  setAvailabilityMetric('availBloodGroupsCount', availableBloodGroupCount.toLocaleString());

  const selectedOrganizationId = document.getElementById('hospAvailOrganizationFilter')?.value || '';
  const selectedCity = document.getElementById('hospAvailCityFilter')?.value || '';
  populateAvailabilityFilter(
    'hospAvailOrganizationFilter',
    'All Organizations',
    [...new Map(records.map((record) => [
      record.requestOrganizationId,
      { value: record.requestOrganizationId, label: record.organizationName }
    ])).values()].sort((a, b) => a.label.localeCompare(b.label)),
    selectedOrganizationId
  );
  populateAvailabilityFilter(
    'hospAvailCityFilter',
    'All Cities',
    [...new Set(records.map((record) => record.city).filter((city) => city !== 'N/A'))]
      .sort((a, b) => a.localeCompare(b))
      .map((city) => ({ value: city, label: city })),
    selectedCity
  );

  const searchTerm = (document.getElementById('hospAvailSearch')?.value || '').trim().toLowerCase();
  const groupFilter = document.getElementById('hospAvailGroupFilter')?.value || '';
  const organizationFilter = document.getElementById('hospAvailOrganizationFilter')?.value || '';
  const cityFilter = document.getElementById('hospAvailCityFilter')?.value || '';
  const sortOption = document.getElementById('hospAvailSort')?.value || 'desc';

  let filtered = records.filter((record) => {
    if (searchTerm) {
      const text = `${record.bloodGroup} ${record.organizationName} ${record.city}`.toLowerCase();
      if (!text.includes(searchTerm)) return false;
    }
    if (groupFilter && record.bloodGroup !== groupFilter) return false;
    if (organizationFilter && record.requestOrganizationId !== organizationFilter) return false;
    if (cityFilter && record.city !== cityFilter) return false;
    return true;
  });

  filtered.sort((a, b) => (sortOption === 'asc' ? a.units - b.units : b.units - a.units));

  setAvailabilityMetric('hospAvailRecordCount', filtered.length.toLocaleString());

  if (!filtered.length) {
    container.innerHTML = `
      <div class="hospital-availability-state">
        <i class="fas fa-droplet" aria-hidden="true"></i>
        <div>
          <strong>${records.length ? 'No blood available for these filters' : 'No blood currently available'}</strong>
          <p>${records.length
            ? 'Adjust your search or filters to see other currently usable stock.'
            : 'There is no eligible inventory associated with approved organizations right now.'}</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-responsive hospital-availability-table-wrap">
      <table class="table hospital-availability-table">
        <thead>
          <tr>
            <th>Blood Group</th>
            <th>Available Units</th>
            <th>Organization</th>
            <th>City</th>
            <th>Nearest Expiry</th>
            <th>Status</th>
            <th>Request</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((record) => {
            const status = getAvailabilityStatus(record.units);
            const groupLabel = escapeAvailabilityText(record.bloodGroup);
            const organizationName = escapeAvailabilityText(record.organizationName);
            const city = escapeAvailabilityText(record.city);
            const expiryLabel = record.nearestExpiry
              ? escapeAvailabilityText(record.nearestExpiry.toLocaleDateString())
              : 'Not available';
            return `
              <tr>
                <td data-label="Blood Group"><span class="hospital-availability-group">${groupLabel}</span></td>
                <td data-label="Available Units"><strong class="hospital-availability-units">${record.units.toLocaleString()}</strong> units</td>
                <td data-label="Organization">${organizationName}</td>
                <td data-label="City">${city}</td>
                <td data-label="Nearest Expiry">${expiryLabel}</td>
                <td data-label="Status"><span class="badge ${status.className}">${status.text}</span></td>
                <td data-label="Request">
                  <button type="button" class="btn btn-primary btn-sm btn-quick-request" data-group="${escapeAvailabilityText(record.bloodGroup)}" data-organization-id="${escapeAvailabilityText(record.requestOrganizationId)}">Request Blood</button>
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
      if (requestSelect && bloodGroups.includes(bloodGroup)) requestSelect.value = bloodGroup;
      if (orgSelect && organizationId && [...orgSelect.options].some((option) => option.value === organizationId)) {
        orgSelect.value = organizationId;
      }
    });
  });
}

/* ==========================================================================
   REQUESTS & NOTIFICATIONS DISPLAY
   ========================================================================== */

function attachCancelRequestListeners(container) {
  if (!container) return;
  container.querySelectorAll('.btn-cancel-request').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const requestId = button.dataset.requestId;
      if (!requestId) return;

      const reason = prompt('Please enter a reason for cancelling this blood request:');
      if (reason === null) return;

      try {
        const result = await bloodRequestManager.cancelRequest(requestId, reason.trim() || 'Cancelled by hospital');
        if (result.success) {
          alert('Blood request cancelled successfully.');
          await loadDashboardData();
        } else {
          alert('Failed to cancel blood request: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error cancelling request:', error);
        alert('Failed to cancel request.');
      }
    });
  });
}

function displayRequestHistory(requests) {
  let html = '';
  if (requests.length === 0) {
    html = '<div class="card"><p class="text-center">No requests</p></div>';
  } else {
    requests.forEach((req) => {
      const statusClass = req.status.toLowerCase();
      const isPending = req.status === 'Pending';
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
          ${isPending ? `
            <div class="request-actions" style="margin-top: 12px; text-align: right;">
              <button type="button" class="btn btn-danger btn-sm btn-cancel-request" data-request-id="${req.id}">Cancel Request</button>
            </div>
          ` : ''}
        </div>
      `;
    });
  }
  const container = document.getElementById('requestHistoryList');
  if (container) {
    container.innerHTML = html;
    attachCancelRequestListeners(container);
  }
}

async function loadNotifications() {
  try {
    const result = await bloodRequestManager.getNotifications(currentHospital.uid);
    if (result.success) {
      allNotifications = result.data || [];
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
    const isOutgoing = (notif.senderId || notif.fromUserId) === currentHospital.uid;
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
          <div class="notification-time">${timeAgo} · ${formattedDateTime}</div>
        </div>
        <button type="button" class="btn btn-danger btn-sm delete-notification-btn delete-btn" data-notification-id="${notif.id}" aria-label="Delete notification" title="Delete notification">
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
  if (view === 'notifications') {
    // Render the active listener's data before the read-status update returns.
    displayNotifications(allNotifications);
    markHospitalNotificationsRead();
  }
  if (view === 'blood-availability') renderBloodAvailability();
  const blocked = getApprovalStatus(currentHospital) !== 'Approved';
  const requestForm = document.getElementById('requestBloodForm');
  if (requestForm) {
    requestForm.querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = blocked; });
  }
}

document.getElementById('requestBloodForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!requireApprovedAccount(currentHospital, 'request blood')) return;

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
  const availableUnits = allInventoryItems
    .filter((item) => isAvailableInventory(item)
      && item.organizationId === organizationId
      && item.bloodGroup === bloodGroup)
    .reduce((total, item) => total + Number(item.units), 0);

  if (units > availableUnits) {
    const availabilityMessage = availableUnits === 0
      ? `No eligible stock is currently available for ${bloodGroup} from this organization. You requested ${units} units.`
      : `Insufficient blood available. This organization currently has ${availableUnits} units of ${bloodGroup} available, but you requested ${units} units.`;
    alert(availabilityMessage);
    return;
  }

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
  if (!requireApprovedAccount(currentHospital, 'update your settings')) return;
  
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
