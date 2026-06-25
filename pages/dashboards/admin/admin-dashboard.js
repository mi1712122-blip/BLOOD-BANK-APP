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
import { db } from '../../../assets/js/firebase-config.js';

let currentAdmin = null;

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadAdmin();
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

    const donorsSnapshot = await getDocs(collection(db, 'donors'));
    document.getElementById('totalDonors').textContent = donorsSnapshot.size;

    const hospitalsSnapshot = await getDocs(collection(db, 'hospitals'));
    document.getElementById('totalHospitals').textContent = hospitalsSnapshot.size;

    const orgsSnapshot = await getDocs(collection(db, 'organizations'));
    document.getElementById('totalOrganizations').textContent = orgsSnapshot.size;

    const requestsQuery = query(collection(db, 'bloodRequests'), where('status', '==', 'Pending'));
    const requestsSnapshot = await getDocs(requestsQuery);
    document.getElementById('totalPendingRequests').textContent = requestsSnapshot.size;

    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();

    await loadDonorsData(donorsSnapshot);
    await loadOrganizationsData(orgsSnapshot);
    await loadHospitalsData(hospitalsSnapshot);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

async function loadDonorsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>Blood Group</th><th>City</th><th>Actions</th></tr></thead><tbody>';

  snapshot.forEach((docSnap) => {
    const donor = docSnap.data();
    html += `
      <tr>
        <td>${donor.fullName}</td>
        <td>${donor.email}</td>
        <td>${donor.bloodGroup}</td>
        <td>${donor.city}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="viewDonor('${donor.uid}')">View</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteDonor('${donor.uid}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  document.getElementById('donorsList').innerHTML = html;
}

async function loadOrganizationsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>City</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

  snapshot.forEach((docSnap) => {
    const org = docSnap.data();
    const status = org.isApproved ? 'Approved' : 'Pending';
    html += `
      <tr>
        <td>${org.organizationName}</td>
        <td>${org.email}</td>
        <td>${org.city}</td>
        <td><span class="badge badge-${org.isApproved ? 'success' : 'warning'}">${status}</span></td>
        <td>
          ${!org.isApproved ? `<button class="btn btn-sm btn-primary" onclick="approveOrg('${org.uid}')">Approve</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="viewOrg('${org.uid}')">View</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteOrg('${org.uid}')">Delete</button>
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
    const status = hospital.isApproved ? 'Approved' : 'Pending';
    html += `
      <tr>
        <td>${hospital.hospitalName}</td>
        <td>${hospital.email}</td>
        <td>${hospital.city}</td>
        <td><span class="badge badge-${hospital.isApproved ? 'success' : 'warning'}">${status}</span></td>
        <td>
          ${!hospital.isApproved ? `<button class="btn btn-sm btn-primary" onclick="approveHospital('${hospital.uid}')">Approve</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="viewHospital('${hospital.uid}')">View</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteHospital('${hospital.uid}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  document.getElementById('hospitalsList').innerHTML = html;
}

function navigateTo(view, event) {
  document.querySelectorAll('.dashboard-view').forEach((panel) => panel.classList.add('hidden'));
  const targetView = document.getElementById(view + 'View');
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  const clickedItem = event?.currentTarget || event?.target?.closest('.nav-item') || document.querySelector(`[data-view="${view}"]`);
  if (clickedItem) {
    clickedItem.classList.add('active');
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

async function approveOrg(uid) {
  try {
    await updateDoc(doc(db, 'organizations', uid), {
      isApproved: true
    });
    alert('Organization approved successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error approving organization:', error);
    alert('Failed to approve organization');
  }
}

async function approveHospital(uid) {
  try {
    await updateDoc(doc(db, 'hospitals', uid), {
      isApproved: true
    });
    alert('Hospital approved successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error approving hospital:', error);
    alert('Failed to approve hospital');
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

  const result = await window.authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}

window.navigateTo = navigateTo;
window.logout = logout;
window.deleteDonor = deleteDonor;
window.deleteOrg = deleteOrg;
window.deleteHospital = deleteHospital;
window.approveOrg = approveOrg;
window.approveHospital = approveHospital;
window.viewDonor = viewDonor;
window.viewOrg = viewOrg;
window.viewHospital = viewHospital;
