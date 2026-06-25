import { authManager } from '../../assets/js/auth.js';

// Login Page Script
const loginForm = document.getElementById('loginForm');
const alertContainer = document.getElementById('alertContainer');
const loadingSpinner = document.getElementById('loadingSpinner');

// Toggle password visibility
function togglePasswordVisibility(event) {
  const passwordInput = document.getElementById('password');
  const toggleBtn = event.currentTarget || event.target.closest('.toggle-password');
  const icon = toggleBtn?.querySelector('i');

  if (!passwordInput || !toggleBtn || !icon) return;
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// Show alert
function showAlert(message, type = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'danger') icon = 'fa-exclamation-circle';
  if (type === 'warning') icon = 'fa-warning';
  
  alertDiv.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
  `;
  
  alertContainer.innerHTML = '';
  alertContainer.appendChild(alertDiv);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (alertDiv.parentElement) {
      alertDiv.remove();
    }
  }, 5000);
}

// Show loading spinner
function showLoading() {
  loadingSpinner.classList.remove('hidden');
}

// Hide loading spinner
function hideLoading() {
  loadingSpinner.classList.add('hidden');
}

// Redirect based on role
function redirectToDashboard(role) {
  const dashboardPaths = {
    'donor': '../../pages/dashboards/donor/dashboard.html',
    'organization': '../../pages/dashboards/organization/dashboard.html',
    'hospital': '../../pages/dashboards/hospital/dashboard.html',
    'admin': '../../pages/dashboards/admin/dashboard.html'
  };
  
  const path = dashboardPaths[role] || '../../index.html';
  window.location.href = path;
}

// Form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Get form values
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role = document.getElementById('role').value;
  
  // Validate
  if (!email || !password || !role) {
    showAlert('Please fill in all fields', 'warning');
    return;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showAlert('Please enter a valid email address', 'danger');
    return;
  }
  
  showLoading();
  
  try {
    // Login with Firebase
    const result = await authManager.login(email, password);
    
    if (result.success) {
      // Check if user role matches selected role
      if (result.role !== role) {
        hideLoading();
        showAlert('Role mismatch. Please select the correct role.', 'danger');
        return;
      }
      
      hideLoading();
      showAlert('Login successful! Redirecting...', 'success');
      
      // Save login preference
      if (document.getElementById('rememberMe').checked) {
        localStorage.setItem('rememberedEmail', email);
      }
      
      // Redirect after 1 second
      setTimeout(() => {
        redirectToDashboard(role);
      }, 1000);
    } else {
      hideLoading();
      showAlert(result.error || 'Login failed. Please try again.', 'danger');
    }
  } catch (error) {
    hideLoading();
    showAlert('An error occurred. Please try again.', 'danger');
    console.error('Login error:', error);
  }
});

// Load remembered email on page load
document.addEventListener('DOMContentLoaded', () => {
  const rememberedEmail = localStorage.getItem('rememberedEmail');
  if (rememberedEmail) {
    document.getElementById('email').value = rememberedEmail;
    document.getElementById('rememberMe').checked = true;
  }

  document.querySelector('.toggle-password')?.addEventListener('click', (event) => {
    togglePasswordVisibility(event);
  });
});
