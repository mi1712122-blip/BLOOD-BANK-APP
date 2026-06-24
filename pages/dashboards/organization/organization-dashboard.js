// Organization Dashboard Script
let currentOrganization = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndLoadOrganization();
  await loadDashboardData();
});

// Check authentication
async function checkAuthAndLoadOrganization() {
  const user = await authManager.getCurrentUser();
  
  if (!user || user.role !== 'organization') {
    window.location.href = '../../auth/login.html';
    return;
  }
  
  currentOrganization = user.data;
  document.getElementById('orgName').textContent = currentOrganization.organizationName || 'Organization';
  
  // Load notifications
  loadNotifications();
}

// Load dashboard data
async function loadDashboardData() {
  try {
    // Load inventory
    const inventoryResult = await bloodInventoryManager.getInventoryByOrganization(currentOrganization.uid);
    if (inventoryResult.success) {
      displayInventoryOverview(inventoryResult.data);
      calculateTotalUnits(inventoryResult.data);
    }
    
    // Load requests
    const requestsResult = await bloodRequestManager.getOrganizationRequests(currentOrganization.uid);
    if (requestsResult.success) {
      displayRecentRequests(requestsResult.data);
      const pendingCount = requestsResult.data.filter(r => r.status === 'Pending').length;
      document.getElementById('pendingRequests').textContent = pendingCount;
    }
    
    // Load settings
    loadSettings();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Display inventory overview
function displayInventoryOverview(inventory) {
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  let html = '';
  
  bloodGroups.forEach(group => {
    const units = inventory[group] || 0;
    const color = bloodInventoryManager.getBloodGroupColor(group);
    html += `
      <div class="inventory-item" style="border-left: 4px solid ${color}">
        <div class="inventory-group">${group}</div>
        <div class="inventory-units">${units} Units</div>
      </div>
    `;
  });
  
  document.getElementById('inventoryOverview').innerHTML = html;
}

// Calculate total units
function calculateTotalUnits(inventory) {
  const total = Object.values(inventory).reduce((sum, units) => sum + units, 0);
  document.getElementById('totalBloodUnits').textContent = total;
}

// Display recent requests
function displayRecentRequests(requests) {
  const recentRequests = requests.slice(0, 5);
  let html = '';
  
  if (recentRequests.length === 0) {
    html = '<p class="text-center">No requests yet</p>';
  } else {
    recentRequests.forEach(req => {
      const statusClass = req.status.toLowerCase();
      html += `
        <div class="request-card ${statusClass}">
          <div class="request-header">
            <div class="request-title">${req.hospitalName} - ${req.bloodGroup}</div>
            <span class="request-status status-${statusClass}">${req.status}</span>
          </div>
          <div class="request-details">
            <div class="request-detail">
              <span class="request-detail-label">Units</span>
              <span class="request-detail-value">${req.units}</span>
            </div>
            <div class="request-detail">
              <span class="request-detail-label">Urgency</span>
              <span class="request-detail-value">${req.urgencyLevel}</span>
            </div>
            <div class="request-detail">
              <span class="request-detail-label">Date</span>
              <span class="request-detail-value">${new Date(req.createdAt.seconds * 1000).toLocaleDateString()}</span>
            </div>
          </div>
          ${req.status === 'Pending' ? `
            <div class="request-actions">
              <button class="btn btn-success btn-sm" onclick="approveRequest('${req.id}')">
                <i class="fas fa-check"></i> Approve
              </button>
              <button class="btn btn-danger btn-sm" onclick="openRejectModal('${req.id}')">
                <i class="fas fa-times"></i> Reject
              </button>
            </div>
          ` : ''}
        </div>
      `;
    });
  }
  
  document.getElementById('recentRequests').innerHTML = html;
}

// Load notifications
async function loadNotifications() {
  try {
    const result = await bloodRequestManager.getNotifications(currentOrganization.uid);
    
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

// Approve request
async function approveRequest(requestId) {
  try {
    const result = await bloodRequestManager.approveRequest(requestId, currentOrganization.uid);
    if (result.success) {
      alert('Request approved!');
      await loadDashboardData();
    }
  } catch (error) {
    console.error('Error approving request:', error);
    alert('Failed to approve request');
  }
}

// Open reject modal
function openRejectModal(requestId) {
  const reason = prompt('Please provide a reason for rejection:');
  if (!reason) return;
  rejectRequest(requestId, reason);
}

// Reject request
async function rejectRequest(requestId, reason) {
  try {
    const result = await bloodRequestManager.rejectRequest(requestId, reason);
    if (result.success) {
      alert('Request rejected');
      await loadDashboardData();
    }
  } catch (error) {
    console.error('Error rejecting request:', error);
    alert('Failed to reject request');
  }
}

// Navigate between views
function navigateTo(view) {
  document.querySelectorAll('.dashboard-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(view + 'View').classList.remove('hidden');
  
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  event.target.closest('.nav-item').classList.add('active');
}

// Open add blood modal
function openAddBloodModal() {
  document.getElementById('addBloodModal').classList.add('show');
}

// Close add blood modal
function closeAddBloodModal() {
  document.getElementById('addBloodModal').classList.remove('show');
}

// Add blood form submission
document.getElementById('addBloodForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const bloodGroup = document.getElementById('bloodGroupSelect').value;
  const units = parseInt(document.getElementById('unitsInput').value);
  const expiryDate = document.getElementById('expiryDateInput').value;
  
  try {
    const result = await bloodInventoryManager.addBlood(currentOrganization.uid, {
      bloodGroup,
      units,
      expiryDate,
      organizationId: currentOrganization.uid
    });
    
    if (result.success) {
      alert('Blood added successfully!');
      closeAddBloodModal();
      document.getElementById('addBloodForm').reset();
      await loadDashboardData();
    }
  } catch (error) {
    console.error('Error adding blood:', error);
    alert('Failed to add blood');
  }
});

// Load settings
function loadSettings() {
  document.getElementById('settingsOrgName').value = currentOrganization.organizationName || '';
  document.getElementById('settingsPhone').value = currentOrganization.phone || '';
  document.getElementById('settingsAddress').value = currentOrganization.address || '';
  document.getElementById('settingsCity').value = currentOrganization.city || '';
}

// Settings form submission
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

// Logout
async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  
  const result = await authManager.logout();
  if (result.success) {
    window.location.href = '../../auth/login.html';
  }
}

// Modal click outside
document.getElementById('addBloodModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('addBloodModal')) {
    closeAddBloodModal();
  }
});

// CSS for inventory grid
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .inventory-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
    }
    
    .inventory-item {
      background-color: var(--bg-color);
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    
    .inventory-group {
      font-weight: 600;
      font-size: 18px;
      color: var(--primary-color);
      margin-bottom: 5px;
    }
    
    .inventory-units {
      font-size: 14px;
      color: var(--text-light);
    }
    
    .modal.show {
      display: flex;
    }
    
    .modal-footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
    }
  `;
  document.head.appendChild(style);
});
