// Donor Dashboard Script
let currentDonor = null;
let currentView = 'dashboard';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadDonor();
  loadDashboardData();
});

// Check authentication
async function checkAuthAndLoadDonor() {
  const user = await authManager.getCurrentUser();
  
  if (!user || user.role !== 'donor') {
    window.location.href = '../../auth/login.html';
    return;
  }
  
  currentDonor = user.data;
  document.getElementById('donorName').textContent = currentDonor.fullName || 'Donor';
  document.getElementById('welcomeName').textContent = currentDonor.fullName || 'Donor';
  
  // Load notifications
  loadNotifications();
}

// Load dashboard data
async function loadDashboardData() {
  try {
    // Load donor stats
    document.getElementById('totalDonations').textContent = currentDonor.totalDonations || 0;
    document.getElementById('bloodGroupDisplay').textContent = currentDonor.bloodGroup || '-';
    document.getElementById('eligibilityStatus').textContent = currentDonor.isEligible ? 'Eligible' : 'Not Eligible';
    
    // Load profile fields
    document.getElementById('profileFullName').value = currentDonor.fullName || '';
    document.getElementById('profileEmail').value = currentDonor.email || '';
    document.getElementById('profilePhone').value = currentDonor.phone || '';
    document.getElementById('profileBloodGroup').value = currentDonor.bloodGroup || '';
    document.getElementById('profileAge').value = currentDonor.age || '';
    document.getElementById('profileGender').value = currentDonor.gender || '';
    document.getElementById('profileCity').value = currentDonor.city || '';
    document.getElementById('profileAddress').value = currentDonor.address || '';
    
    // Load blood requests
    await loadBloodRequests();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Load blood requests
async function loadBloodRequests() {
  try {
    const result = await bloodRequestManager.getHospitalRequests(currentDonor.uid);
    
    if (result.success && result.data.length > 0) {
      // Show recent requests
      const recentRequests = result.data.slice(0, 3);
      displayRecentRequests(recentRequests);
      
      // Count pending
      const pendingCount = result.data.filter(r => r.status === 'Pending').length;
      document.getElementById('pendingRequests').textContent = pendingCount;
      
      // Load all for requests view
      displayAllBloodRequests(result.data);
    }
  } catch (error) {
    console.error('Error loading blood requests:', error);
  }
}

// Display recent requests
function displayRecentRequests(requests) {
  if (requests.length === 0) {
    document.getElementById('recentRequestsTable').innerHTML = '<p class="text-center">No recent requests</p>';
    return;
  }
  
  let html = '<table><thead><tr><th>Hospital</th><th>Blood Group</th><th>Units</th><th>Status</th></tr></thead><tbody>';
  
  requests.forEach(req => {
    html += `
      <tr>
        <td>${req.hospitalName}</td>
        <td>${req.bloodGroup}</td>
        <td>${req.units}</td>
        <td><span class="badge badge-${req.status.toLowerCase()}">${req.status}</span></td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  document.getElementById('recentRequestsTable').innerHTML = html;
}

// Display all blood requests
function displayAllBloodRequests(requests) {
  let html = '';
  
  if (requests.length === 0) {
    html = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-inbox"></i></div>
          <div class="empty-state-title">No Blood Requests</div>
          <p class="empty-state-message">No hospitals have requested blood from you yet.</p>
        </div>
      </div>
    `;
  } else {
    requests.forEach(req => {
      const statusClass = req.status.toLowerCase();
      html += `
        <div class="request-card ${statusClass}">
          <div class="request-header">
            <div class="request-title">${req.hospitalName}</div>
            <span class="request-status status-${statusClass}">${req.status}</span>
          </div>
          <div class="request-details">
            <div class="request-detail">
              <span class="request-detail-label">Blood Group</span>
              <span class="request-detail-value">${req.bloodGroup}</span>
            </div>
            <div class="request-detail">
              <span class="request-detail-label">Units Needed</span>
              <span class="request-detail-value">${req.units}</span>
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
          ${req.status === 'Pending' ? `
            <div class="request-actions">
              <button class="btn btn-success" onclick="acceptRequest('${req.id}')">
                <i class="fas fa-check"></i> Accept
              </button>
              <button class="btn btn-danger" onclick="rejectRequest('${req.id}')">
                <i class="fas fa-times"></i> Reject
              </button>
            </div>
          ` : ''}
        </div>
      `;
    });
  }
  
  document.getElementById('bloodRequestsList').innerHTML = html;
}

// Accept blood request
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

// Reject blood request
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

// Load notifications
async function loadNotifications() {
  try {
    const result = await bloodRequestManager.getNotifications(currentDonor.uid);
    
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
    html = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-bell"></i></div>
        <div class="empty-state-title">No Notifications</div>
        <p class="empty-state-message">You're all caught up!</p>
      </div>
    `;
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

// Get time ago string
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
  // Hide all views
  document.querySelectorAll('.dashboard-view').forEach(v => v.classList.add('hidden'));
  
  // Show selected view
  document.getElementById(view + 'View').classList.remove('hidden');
  
  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  event.target.closest('.nav-item').classList.add('active');
  
  currentView = view;
}

// Profile form submission
document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const updateData = {
    phone: document.getElementById('profilePhone').value,
    age: parseInt(document.getElementById('profileAge').value),
    city: document.getElementById('profileCity').value,
    address: document.getElementById('profileAddress').value
  };
  
  try {
    const result = await authManager.updateProfile(currentDonor.uid, updateData);
    if (result.success) {
      alert('Profile updated successfully!');
      location.reload();
    } else {
      alert('Failed to update profile');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('An error occurred');
  }
});

// Settings form submission
document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  alert('Password change functionality coming soon!');
});

// Logout
async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  
  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}

// Initialize sidebar active state
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[onclick="navigateTo(\'dashboard\')"]').classList.add('active');
});
