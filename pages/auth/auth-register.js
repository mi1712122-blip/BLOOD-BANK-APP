import { authManager } from '../../assets/js/auth.js';

// Register Page Script
let selectedRole = null;

const roleButtons = document.querySelectorAll('.role-btn');
const registerForm = document.getElementById('registerForm');
const roleSelection = document.getElementById('roleSelection');
const alertContainer = document.getElementById('alertContainer');
const loadingSpinner = document.getElementById('loadingSpinner');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Get role from URL if present
  const urlParams = new URLSearchParams(window.location.search);
  const roleParam = urlParams.get('role');
  
  if (roleParam && ['donor', 'organization', 'hospital'].includes(roleParam)) {
    selectRole(roleParam);
  }

  document.querySelectorAll('.toggle-password').forEach((button) => {
    button.addEventListener('click', (event) => {
      const fieldId = button.dataset.target;
      if (fieldId) {
        togglePasswordVisibility(event, fieldId);
      }
    });
  });
});

// Role selection
roleButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const role = btn.dataset.role;
    selectRole(role);
  });
});

function selectRole(role) {
  selectedRole = role;
  
  // Update UI
  roleButtons.forEach(btn => btn.classList.remove('active'));
  document.querySelector(`[data-role="${role}"]`).classList.add('active');
  
  // Show form and hide role selection
  roleSelection.style.display = 'none';
  registerForm.classList.remove('hidden');
  
  // Show/hide role-specific fields
  document.getElementById('donorFields').classList.toggle('hidden', role !== 'donor');
  document.getElementById('organizationFields').classList.toggle('hidden', role !== 'organization');
  document.getElementById('hospitalFields').classList.toggle('hidden', role !== 'hospital');
  
  // Show/hide role icons on sides
  document.querySelectorAll('.donor-icon').forEach(icon => icon.classList.toggle('active', role === 'donor'));
  document.querySelectorAll('.organization-icon').forEach(icon => icon.classList.toggle('active', role === 'organization'));
  document.querySelectorAll('.hospital-icon').forEach(icon => icon.classList.toggle('active', role === 'hospital'));
  
  // Scroll to form
  registerForm.scrollIntoView({ behavior: 'smooth' });
}

function goBackToRoleSelection() {
  roleSelection.style.display = 'block';
  registerForm.classList.add('hidden');
  selectedRole = null;
  roleButtons.forEach(btn => btn.classList.remove('active'));
  
  // Hide all role icons
  document.querySelectorAll('.role-icon').forEach(icon => icon.classList.remove('active'));
  
  alertContainer.innerHTML = '';
}

// Toggle password visibility
function togglePasswordVisibility(event, fieldId) {
  const field = document.getElementById(fieldId);
  const btn = event.currentTarget || event.target.closest('.toggle-password');
  const icon = btn?.querySelector('i');

  if (!field || !btn || !icon) return;
  
  if (field.type === 'password') {
    field.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    field.type = 'password';
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
}

// Show loading
function showLoading() {
  loadingSpinner.classList.remove('hidden');
}

function hideLoading() {
  loadingSpinner.classList.add('hidden');
}

// Validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password strength
function isStrongPassword(password) {
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasMinLength = password.length >= 8;
  
  return hasUppercase && hasLowercase && hasNumbers && hasMinLength;
}

// Validate phone number
function isValidPhone(phone) {
  const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
  return phoneRegex.test(phone);
}

// Form submission
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Get common fields
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const phone = document.getElementById('phone').value.trim();
  const terms = document.getElementById('terms').checked;
  
  // Validate common fields
  if (!email || !password || !confirmPassword || !phone) {
    showAlert('Please fill in all required fields', 'warning');
    return;
  }
  
  if (!isValidEmail(email)) {
    showAlert('Please enter a valid email address', 'danger');
    return;
  }
  
  if (!isStrongPassword(password)) {
    showAlert('Password must be at least 8 characters with uppercase, lowercase, and numbers', 'danger');
    return;
  }
  
  if (password !== confirmPassword) {
    showAlert('Passwords do not match', 'danger');
    return;
  }
  
  if (!isValidPhone(phone)) {
    showAlert('Please enter a valid phone number', 'danger');
    return;
  }
  
  if (!terms) {
    showAlert('Please accept the terms and conditions', 'warning');
    return;
  }
  
  // Build user data based on role
  let userData = {
    role: selectedRole,
    email: email,
    phone: phone
  };
  
  if (selectedRole === 'donor') {
    const fullName = document.getElementById('fullName').value.trim();
    const age = document.getElementById('age').value;
    const gender = document.getElementById('gender').value;
    const bloodGroup = document.getElementById('bloodGroup').value;
    const city = document.getElementById('city').value.trim();
    const address = document.getElementById('address').value.trim();
    
    if (!fullName || !age || !gender || !bloodGroup || !city || !address) {
      showAlert('Please fill in all donor information', 'warning');
      return;
    }
    
    if (age < 18 || age > 65) {
      showAlert('Donor age must be between 18 and 65', 'danger');
      return;
    }
    
    userData = {
      ...userData,
      fullName,
      age: parseInt(age),
      gender,
      bloodGroup,
      city,
      address
    };
  } else if (selectedRole === 'organization') {
    const organizationName = document.getElementById('organizationName').value.trim();
    const licenseNumber = document.getElementById('licenseNumber').value.trim();
    const city = document.getElementById('orgCity').value.trim();
    const address = document.getElementById('orgAddress').value.trim();
    
    if (!organizationName || !licenseNumber || !city || !address) {
      showAlert('Please fill in all organization information', 'warning');
      return;
    }
    
    userData = {
      ...userData,
      organizationName,
      licenseNumber,
      city,
      address
    };
  } else if (selectedRole === 'hospital') {
    const hospitalName = document.getElementById('hospitalName').value.trim();
    const licenseNumber = document.getElementById('hospitalLicense').value.trim();
    const city = document.getElementById('hospitalCity').value.trim();
    const address = document.getElementById('hospitalAddress').value.trim();
    
    if (!hospitalName || !licenseNumber || !city || !address) {
      showAlert('Please fill in all hospital information', 'warning');
      return;
    }
    
    userData = {
      ...userData,
      hospitalName,
      licenseNumber,
      city,
      address
    };
  }
  
  showLoading();
  
  try {
    // Register user
    const result = await authManager.register(email, password, userData);
    
    if (result.success) {
      hideLoading();
      showAlert('Account created successfully! Redirecting to login...', 'success');
      
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 2000);
    } else {
      hideLoading();
      showAlert(result.error || 'Registration failed. Please try again.', 'danger');
    }
  } catch (error) {
    hideLoading();
    showAlert('An error occurred during registration. Please try again.', 'danger');
    console.error('Registration error:', error);
  }
});
