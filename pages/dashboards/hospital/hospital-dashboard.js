// Hospital Dashboard Script
let currentHospital = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadHospital();
  await loadDashboardData();
});

// Check authentication
async function checkAuthAndLoadHospital() {
  const user = await authManager.getCurrentUser();
  
  if (!user || user.role !== 'hospital') {
    window.location.href = '../../auth/login.html';
    return;
  }
  
  currentHospital = user.data;
  document.getElementById('hospitalName').textContent = currentHospital.hospitalName || 'Hospital';
  
  // Load notifications
  loadNotifications();
}

// Load dashboard data
async function loadDashboardData() {
  try {
    // Load requests
    const requestsResult = await bloodRequestManager.getHospitalRequests(currentHospital.uid);
    
    if (requestsResult.success) {
      displayRecentRequests(requestsResult.data.slice(0, 5));
      displayRequestHistory(requestsResult.data);
      
      const active = requestsResult.data.filter(r => r.status !== 'Completed').length;
      const approved = requestsResult.data.filter(r => r.status === 'Approved').length;
      const pending = requestsResult.data.filter(r => r.status === 'Pending').length;
      const rejected = requestsResult.data.filter(r => r.status === 'Rejected').length;
      
      document.getElementById('activeRequests').textContent = active;
      document.getElementById('approvedRequests').textContent = approved;
      document.getElementById('pendingRequests').textContent = pending;
      document.getElementById('rejectedRequests').textContent = rejected;
    }
    
    // Load settings
    loadSettings();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Display recent requests
function displayRecentRequests(requests) {
  let html = '';
  
  if (requests.length === 0) {
    html = '<p class="text-center">No requests yet</p>';
  } else {
    requests.forEach(req => {
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
              <span class="request-detail-value">${new Date(req.createdAt.seconds * 1000).toLocaleDateString()}</span>
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

// Display request history
function displayRequestHistory(requests) {
  let html = '';
  
  if (requests.length === 0) {
    html = '<div class="card"><p class="text-center">No requests</p></div>';
  } else {
    requests.forEach(req => {
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
              <span class="request-detail-value">${new Date(req.createdAt.seconds * 1000).toLocaleDateString()}</span>
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

// Load notifications
async function loadNotifications() {
  try {
    const result = await bloodRequestManager.getNotifications(currentHospital.uid);
    
    if (result.success) {
      const unreadCount = result.data.filter(n => !n.isRead).length;
      document.getElementById('notificationBadge').textContent = unreadCount;
      document.getElementById('notificationBadge2').textContent = unreadCount;
      
      displayNotifications(result.data);
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

// Display notifications
function displayNotifications(notifications) {
  let html = '';
  
  if (notifications.length === 0) {
    html = '<div class="empty-state"><p>No notifications</p></div>';
  } else {
    notifications.forEach(notif => {
      const date = new Date(notif.createdAt.seconds * 1000);
      const timeAgo = getTimeAgo(date);
      
      html += `
        <div class="notification-item ${!notif.isRead ? 'unread' : ''}">
          <div class="notification-icon">
            <i class="fas fa-bell"></i>
          </div>
          <div class="notification-content">
            <div class="notification-title">${notif.title}</div>
            <div class="notification-message">${notif.message}</div>
            <div class="notification-time">${timeAgo}</div>
          </div>
        </div>
      `;
    });
  }
  
  document.getElementById('notificationsList').innerHTML = html;
}

// Get time ago
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}

// Navigate between views
function navigateTo(view) {
  document.querySelectorAll('.dashboard-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(view + 'View').classList.remove('hidden');
  
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  event.target.closest('.nav-item').classList.add('active');
}

// Request blood form submission
document.getElementById('requestBloodForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const bloodGroup = document.getElementById('requestBloodGroup').value;
  const units = parseInt(document.getElementById('requestUnits').value);
  const patientName = document.getElementById('requestPatientName').value;
  const patientAge = document.getElementById('requestPatientAge').value;
  const purpose = document.getElementById('requestPurpose').value;
  const urgencyLevel = document.getElementById('requestUrgency').value;
  
  try {
    const result = await bloodRequestManager.createBloodRequest({
      hospitalId: currentHospital.uid,
      hospitalName: currentHospital.hospitalName,
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
      navigateTo('dashboard');
      await loadDashboardData();
    }
  } catch (error) {
    console.error('Error submitting request:', error);
    alert('Failed to submit request');
  }
});

// Load settings
function loadSettings() {
  document.getElementById('settingsHospitalName').value = currentHospital.hospitalName || '';
  document.getElementById('settingsPhone').value = currentHospital.phone || '';
  document.getElementById('settingsAddress').value = currentHospital.address || '';
  document.getElementById('settingsCity').value = currentHospital.city || '';
}

// Settings form submission
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

// Blood availability search
document.getElementById('searchCity')?.addEventListener('keyup', async () => {
  const city = document.getElementById('searchCity').value.trim();
  if (!city) {
    document.getElementById('availabilityResults').innerHTML = '';
    return;
  }
  
  try {
    // Get blood groups and search
    const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    let results = '';
    
    for (const group of bloodGroups) {
      const result = await bloodInventoryManager.searchBloodAvailability(group, city);
      
      if (result.success && result.data.length > 0) {
        results += `<div class="card"><h3>${group}</h3>`;
        result.data.forEach(org => {
          results += `
            <div class="availability-item">
              <p><strong>${org.organizationName}</strong> - ${org.units} Units</p>
              <p>Phone: ${org.phone}</p>
              <p>Address: ${org.address}</p>
            </div>
          `;
        });
        results += '</div>';
      }
    }
    
    if (!results) {
      results = '<div class="card"><p class="text-center">No blood available in this city</p></div>';
    }
    
    document.getElementById('availabilityResults').innerHTML = results;
  } catch (error) {
    console.error('Error searching blood availability:', error);
  }
});

// Logout
async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  
  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}
