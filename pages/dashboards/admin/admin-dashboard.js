import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { authManager } from '../../../assets/js/auth.js';
import { bloodRequestManager } from '../../../assets/js/requests.js';
import { db } from '../../../assets/js/firebase-config.js';

let currentAdmin = null;
let donorsList = [];
let hospitalsList = [];
let organizationsList = [];
let usersList = [];
const viewSelectors = {
  dashboard: 'dashboardView',
  donors: 'donorsView',
  organizations: 'organizationsView',
  hospitals: 'hospitalsView',
  sendNotification: 'sendNotificationView',
  inventory: 'inventoryView',
  analytics: 'analyticsView',
  settings: 'settingsView'
};

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadAdmin();
  setupNavigation();
  setupActionHandlers();
  setupNotificationHandlers();
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

    const requestsQuery = query(collection(db, 'bloodRequests'), where('status', '==', 'Pending'));
    const requestsSnapshot = await getDocs(requestsQuery);
    document.getElementById('totalPendingRequests').textContent = requestsSnapshot.size;

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
  if (typeof donor.status === 'string' && donor.status.trim()) {
    return normalizeStatus(donor.status);
  }

  if (typeof donor.isApproved === 'boolean') {
    return donor.isApproved ? 'Approved' : 'Pending';
  }

  if (typeof donor.isEligible === 'boolean') {
    return donor.isEligible ? 'Pending' : 'Rejected';
  }

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
  if (typeof entity.status === 'string' && entity.status.trim()) {
    return normalizeStatus(entity.status);
  }

  if (typeof entity.isApproved === 'boolean') {
    return entity.isApproved ? 'Approved' : 'Pending';
  }

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
        <td>${org.organizationName}</td>
        <td>${org.email}</td>
        <td>${org.city}</td>
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
        <td>${hospital.hospitalName}</td>
        <td>${hospital.email}</td>
        <td>${hospital.city}</td>
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

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      const view = element.dataset.view;
      if (!view) return;
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

  document.querySelectorAll('.dashboard-view').forEach((panel) => panel.classList.add('hidden'));
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  if (view === 'sendNotification') {
    populateRecipientSelector(document.getElementById('recipientType')?.value || 'specificDonor');
  }
}

async function deleteDonor(uid) {
  if (!confirm('Are you sure you want to delete this donor?')) return;

  try {
    await deleteDoc(doc(db, 'donors', uid));
    await deleteDoc(doc(db, 'users', uid));
    alert('Donor deleted successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error deleting donor:', error);
    alert('Failed to delete donor');
  }
}

async function deleteOrg(uid) {
  if (!confirm('Are you sure you want to delete this organization?')) return;

  try {
    await deleteDoc(doc(db, 'organizations', uid));
    await deleteDoc(doc(db, 'users', uid));
    alert('Organization deleted successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error deleting organization:', error);
    alert('Failed to delete organization');
  }
}

async function deleteHospital(uid) {
  if (!confirm('Are you sure you want to delete this hospital?')) return;

  try {
    await deleteDoc(doc(db, 'hospitals', uid));
    await deleteDoc(doc(db, 'users', uid));
    alert('Hospital deleted successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error deleting hospital:', error);
    alert('Failed to delete hospital');
  }
}

async function approveDonor(uid) {
  try {
    await updateDoc(doc(db, 'donors', uid), {
      isApproved: true,
      status: 'Approved'
    });
    await updateDoc(doc(db, 'users', uid), {
      isApproved: true
    });
    await sendAdminNotification(uid, 'Donor Approved', 'Your donor profile has been approved by the admin.');
    alert('Donor approved successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error approving donor:', error);
    alert('Failed to approve donor');
  }
}

async function rejectDonor(uid) {
  const reason = prompt('Enter a reason for rejecting this donor:');
  if (reason === null) return;

  try {
    await updateDoc(doc(db, 'donors', uid), {
      isApproved: false,
      status: 'Rejected'
    });
    await updateDoc(doc(db, 'users', uid), {
      isApproved: false
    });
    await sendAdminNotification(uid, 'Donor Rejected', `Your donor profile has been rejected. Reason: ${reason}`);
    alert('Donor rejected successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error rejecting donor:', error);
    alert('Failed to reject donor');
  }
}

async function approveOrg(uid) {
  try {
    await updateDoc(doc(db, 'organizations', uid), {
      isApproved: true,
      status: 'Approved'
    });
    await sendAdminNotification(uid, 'Organization Approved', 'Your organization has been approved by the admin.');
    alert('Organization approved successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error approving organization:', error);
    alert('Failed to approve organization');
  }
}

async function rejectOrg(uid) {
  const reason = prompt('Enter a reason for rejecting this organization:');
  if (reason === null) return;

  try {
    await updateDoc(doc(db, 'organizations', uid), {
      isApproved: false,
      status: 'Rejected'
    });
    await sendAdminNotification(uid, 'Organization Rejected', `Your organization has been rejected. Reason: ${reason}`);
    alert('Organization rejected successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error rejecting organization:', error);
    alert('Failed to reject organization');
  }
}

async function approveHospital(uid) {
  try {
    await updateDoc(doc(db, 'hospitals', uid), {
      isApproved: true,
      status: 'Approved'
    });
    await sendAdminNotification(uid, 'Hospital Approved', 'Your hospital has been approved by the admin.');
    alert('Hospital approved successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error approving hospital:', error);
    alert('Failed to approve hospital');
  }
}

async function rejectHospital(uid) {
  const reason = prompt('Enter a reason for rejecting this hospital:');
  if (reason === null) return;

  try {
    await updateDoc(doc(db, 'hospitals', uid), {
      isApproved: false,
      status: 'Rejected'
    });
    await sendAdminNotification(uid, 'Hospital Rejected', `Your hospital has been rejected. Reason: ${reason}`);
    alert('Hospital rejected successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error rejecting hospital:', error);
    alert('Failed to reject hospital');
  }
}

async function sendAdminNotification(recipientId, title, message) {
  try {
    await bloodRequestManager.sendNotification({
      recipientId,
      type: 'admin_status',
      title,
      message,
      senderId: currentAdmin?.uid || null,
      senderRole: 'admin',
      senderName: currentAdmin?.fullName || currentAdmin?.email || 'Admin'
    });
  } catch (error) {
    console.error('Error sending admin notification:', error);
  }
}

function setupActionHandlers() {
  const donationsContainer = document.getElementById('donorsList');
  const orgContainer = document.getElementById('organizationsList');
  const hospitalContainer = document.getElementById('hospitalsList');

  [donationsContainer, orgContainer, hospitalContainer].forEach((container) => {
    if (!container) return;

    container.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      event.preventDefault();

      const action = button.dataset.action;
      const uid = button.dataset.userId;
      if (!uid) return;

      if (action === 'delete-donor') {
        await deleteDonor(uid);
      } else if (action === 'view-donor') {
        viewDonor(uid);
      } else if (action === 'approve-donor') {
        await approveDonor(uid);
      } else if (action === 'reject-donor') {
        await rejectDonor(uid);
      } else if (action === 'approve-org') {
        await approveOrg(uid);
      } else if (action === 'reject-org') {
        await rejectOrg(uid);
      } else if (action === 'delete-org') {
        await deleteOrg(uid);
      } else if (action === 'view-org') {
        viewOrg(uid);
      } else if (action === 'approve-hospital') {
        await approveHospital(uid);
      } else if (action === 'reject-hospital') {
        await rejectHospital(uid);
      } else if (action === 'delete-hospital') {
        await deleteHospital(uid);
      } else if (action === 'view-hospital') {
        viewHospital(uid);
      }
    });
  });
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

  const options = [];
  let list = [];
  let placeholder = 'Select recipient...';

  if (type === 'specificDonor') {
    list = donorsList;
    placeholder = 'Select donor...';
  } else if (type === 'specificHospital') {
    list = hospitalsList;
    placeholder = 'Select hospital...';
  } else if (type === 'specificOrganization') {
    list = organizationsList;
    placeholder = 'Select organization...';
  }

  if (type.startsWith('specific')) {
    selectorGroup.classList.remove('hidden');
    selector.required = true;
    selector.innerHTML = `<option value="">${placeholder}</option>` +
      list.map((item) => {
        const label = item.fullName || item.hospitalName || item.organizationName || item.email || item.uid || item.id;
        return `<option value="${item.uid || item.id}">${label}</option>`;
      }).join('');
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

  let recipientIds = [];
  if (type === 'specificDonor') {
    recipientIds = [recipientSelector?.value].filter(Boolean);
  } else if (type === 'specificHospital') {
    recipientIds = [recipientSelector?.value].filter(Boolean);
  } else if (type === 'specificOrganization') {
    recipientIds = [recipientSelector?.value].filter(Boolean);
  } else if (type === 'allDonors') {
    recipientIds = donorsList.map((item) => item.uid || item.id);
  } else if (type === 'allHospitals') {
    recipientIds = hospitalsList.map((item) => item.uid || item.id);
  } else if (type === 'allOrganizations') {
    recipientIds = organizationsList.map((item) => item.uid || item.id);
  } else if (type === 'allUsers') {
    recipientIds = usersList.map((item) => item.uid || item.id);
  }

  if (!recipientIds.length) {
    alert('No recipients available for this selection.');
    return;
  }

  try {
    const sendPromises = recipientIds.map((recipientId) =>
      bloodRequestManager.sendNotification({
        recipientId,
        type: 'admin_manual',
        title,
        message
      })
    );

    await Promise.all(sendPromises);
    alert('Notification sent successfully.');
    document.getElementById('notificationForm')?.reset();
    document.getElementById('recipientType').value = 'specificDonor';
    populateRecipientSelector('specificDonor');
    showView('dashboard');
  } catch (error) {
    console.error('Error sending notification:', error);
    alert('Failed to send notification.');
  }
}

function viewDonor(uid) {
  alert('View donor ' + uid);
}

function viewOrg(uid) {
  alert('View organization ' + uid);
}

function viewHospital(uid) {
  alert('View hospital ' + uid);
}

document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Settings saved successfully!');
});

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;

  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}
