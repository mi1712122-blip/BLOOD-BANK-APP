// Admin Dashboard Script
let currentAdmin = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadAdmin();
  await loadDashboardData();
});

// Check authentication
async function checkAuthAndLoadAdmin() {
  const user = await authManager.getCurrentUser();
  
  if (!user || user.role !== 'admin') {
    window.location.href = '../../auth/login.html';
    return;
  }
  
  currentAdmin = user.data;
}

// Load dashboard data
async function loadDashboardData() {
  try {
    // Load all users count
    const usersSnapshot = await firebase.firestore().collection('users').get();
    document.getElementById('totalUsers').textContent = usersSnapshot.size;
    
    // Load specific counts
    const donorsSnapshot = await firebase.firestore().collection('donors').get();
    document.getElementById('totalDonors').textContent = donorsSnapshot.size;
    
    const hospitalsSnapshot = await firebase.firestore().collection('hospitals').get();
    document.getElementById('totalHospitals').textContent = hospitalsSnapshot.size;
    
    const orgsSnapshot = await firebase.firestore().collection('organizations').get();
    document.getElementById('totalOrganizations').textContent = orgsSnapshot.size;
    
    // Load pending requests
    const requestsSnapshot = await firebase.firestore()
      .collection('bloodRequests')
      .where('status', '==', 'Pending')
      .get();
    document.getElementById('totalPendingRequests').textContent = requestsSnapshot.size;
    
    // Set last updated
    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
    
    // Load detailed data for views
    await loadDonorsData(donorsSnapshot);
    await loadOrganizationsData(orgsSnapshot);
    await loadHospitalsData(hospitalsSnapshot);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Load donors data
async function loadDonorsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>Blood Group</th><th>City</th><th>Actions</th></tr></thead><tbody>';
  
  snapshot.forEach(doc => {
    const donor = doc.data();
    html += `
      <tr>
        <td>${donor.fullName}</td>
        <td>${donor.email}</td>
        <td>${donor.bloodGroup}</td>
        <td>${donor.city}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="viewDonor('${donor.uid}')">View</button>
          <button class="btn btn-sm btn-danger" onclick="deleteDonor('${donor.uid}')">Delete</button>
        </td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  document.getElementById('donorsList').innerHTML = html;
}

// Load organizations data
async function loadOrganizationsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>City</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  
  snapshot.forEach(doc => {
    const org = doc.data();
    const status = org.isApproved ? 'Approved' : 'Pending';
    html += `
      <tr>
        <td>${org.organizationName}</td>
        <td>${org.email}</td>
        <td>${org.city}</td>
        <td><span class="badge badge-${org.isApproved ? 'success' : 'warning'}">${status}</span></td>
        <td>
          ${!org.isApproved ? `<button class="btn btn-sm btn-success" onclick="approveOrg('${org.uid}')">Approve</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="viewOrg('${org.uid}')">View</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOrg('${org.uid}')">Delete</button>
        </td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  document.getElementById('organizationsList').innerHTML = html;
}

// Load hospitals data
async function loadHospitalsData(snapshot) {
  let html = '<table><thead><tr><th>Name</th><th>Email</th><th>City</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  
  snapshot.forEach(doc => {
    const hospital = doc.data();
    const status = hospital.isApproved ? 'Approved' : 'Pending';
    html += `
      <tr>
        <td>${hospital.hospitalName}</td>
        <td>${hospital.email}</td>
        <td>${hospital.city}</td>
        <td><span class="badge badge-${hospital.isApproved ? 'success' : 'warning'}">${status}</span></td>
        <td>
          ${!hospital.isApproved ? `<button class="btn btn-sm btn-success" onclick="approveHospital('${hospital.uid}')">Approve</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="viewHospital('${hospital.uid}')">View</button>
          <button class="btn btn-sm btn-danger" onclick="deleteHospital('${hospital.uid}')">Delete</button>
        </td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  document.getElementById('hospitalsList').innerHTML = html;
}

// Navigate between views
function navigateTo(view) {
  document.querySelectorAll('.dashboard-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(view + 'View').classList.remove('hidden');
  
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  event.target.closest('.nav-item').classList.add('active');
}

// Delete donor
async function deleteDonor(uid) {
  if (!confirm('Are you sure you want to delete this donor?')) return;
  
  try {
    await firebase.firestore().collection('donors').doc(uid).delete();
    await firebase.firestore().collection('users').doc(uid).delete();
    alert('Donor deleted successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error deleting donor:', error);
    alert('Failed to delete donor');
  }
}

// Delete organization
async function deleteOrg(uid) {
  if (!confirm('Are you sure you want to delete this organization?')) return;
  
  try {
    await firebase.firestore().collection('organizations').doc(uid).delete();
    await firebase.firestore().collection('users').doc(uid).delete();
    alert('Organization deleted successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error deleting organization:', error);
    alert('Failed to delete organization');
  }
}

// Delete hospital
async function deleteHospital(uid) {
  if (!confirm('Are you sure you want to delete this hospital?')) return;
  
  try {
    await firebase.firestore().collection('hospitals').doc(uid).delete();
    await firebase.firestore().collection('users').doc(uid).delete();
    alert('Hospital deleted successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error deleting hospital:', error);
    alert('Failed to delete hospital');
  }
}

// Approve organization
async function approveOrg(uid) {
  try {
    await firebase.firestore().collection('organizations').doc(uid).update({
      isApproved: true
    });
    alert('Organization approved successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error approving organization:', error);
    alert('Failed to approve organization');
  }
}

// Approve hospital
async function approveHospital(uid) {
  try {
    await firebase.firestore().collection('hospitals').doc(uid).update({
      isApproved: true
    });
    alert('Hospital approved successfully');
    await loadDashboardData();
  } catch (error) {
    console.error('Error approving hospital:', error);
    alert('Failed to approve hospital');
  }
}

// View functions
function viewDonor(uid) {
  alert('View donor ' + uid);
}

function viewOrg(uid) {
  alert('View organization ' + uid);
}

function viewHospital(uid) {
  alert('View hospital ' + uid);
}

// Settings form submission
document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Settings saved successfully!');
});

// Logout
async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  
  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}
