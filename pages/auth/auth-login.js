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

function initRoleDropdown() {
  const dropdown = document.getElementById('roleDropdown');
  const toggle = document.getElementById('roleDropdownToggle');
  const menu = document.getElementById('roleDropdownMenu');
  const valueEl = document.getElementById('roleDropdownValue');
  const nativeSelect = document.getElementById('role');

  if (!dropdown || !toggle || !menu || !valueEl || !nativeSelect) return;

  const options = Array.from(menu.querySelectorAll('.role-dropdown-option'));
  const roles = {
    donor: { label: 'Donor', iconClass: 'fas fa-droplet', accent: 'role-accent-donor' },
    organization: { label: 'Organization', iconClass: 'fas fa-building', accent: 'role-accent-organization' },
    hospital: { label: 'Hospital', iconClass: 'fas fa-hospital', accent: 'role-accent-hospital' },
    admin: { label: 'Admin', iconClass: 'fas fa-shield-halved', accent: 'role-accent-admin' }
  };

  let activeIndex = -1;

  function isOpen() {
    return dropdown.classList.contains('is-open');
  }

  function setActiveIndex(index) {
    activeIndex = index;
    options.forEach((option, i) => {
      option.classList.toggle('is-active', i === index);
    });

    const active = options[index];
    if (active) {
      toggle.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      toggle.removeAttribute('aria-activedescendant');
    }
  }

  function positionMenu() {
    menu.classList.remove('opens-up');
    const toggleRect = toggle.getBoundingClientRect();
    const menuHeight = menu.scrollHeight || 240;
    const spaceBelow = window.innerHeight - toggleRect.bottom;
    const spaceAbove = toggleRect.top;

    if (spaceBelow < menuHeight + 16 && spaceAbove > spaceBelow) {
      menu.classList.add('opens-up');
    }
  }

  function openDropdown() {
    dropdown.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    positionMenu();

    const selectedIndex = options.findIndex((option) => option.classList.contains('is-selected'));
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }

  function closeDropdown() {
    if (!isOpen()) return;
    dropdown.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('opens-up');
    setActiveIndex(-1);
  }

  function renderPlaceholder() {
    const placeholder = document.createElement('span');
    placeholder.className = 'role-dropdown-placeholder';
    placeholder.textContent = 'Select your role';
    valueEl.replaceChildren(placeholder);
  }

  function renderSelected(value) {
    options.forEach((option) => {
      const selected = option.dataset.value === value;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    const role = roles[value];
    if (!role) {
      renderPlaceholder();
      return;
    }

    const iconWrap = document.createElement('span');
    iconWrap.className = `role-option-icon ${role.accent}`;
    iconWrap.setAttribute('aria-hidden', 'true');

    const icon = document.createElement('i');
    icon.className = role.iconClass;
    iconWrap.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'role-dropdown-label';
    label.textContent = role.label;

    valueEl.replaceChildren(iconWrap, label);
  }

  function selectRole(value) {
    if (!roles[value]) return;

    const previous = nativeSelect.value;
    nativeSelect.value = value;
    renderSelected(value);
    dropdown.classList.remove('is-invalid');
    closeDropdown();
    toggle.focus();

    if (previous !== value) {
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      nativeSelect.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    if (isOpen()) closeDropdown();
    else openDropdown();
  });

  toggle.addEventListener('keydown', (event) => {
    if (!isOpen()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openDropdown();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(activeIndex < options.length - 1 ? activeIndex + 1 : 0);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(activeIndex > 0 ? activeIndex - 1 : options.length - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (activeIndex >= 0) {
        selectRole(options[activeIndex].dataset.value);
      }
    }
  });

  options.forEach((option, index) => {
    option.addEventListener('click', (event) => {
      event.preventDefault();
      selectRole(option.dataset.value);
    });

    option.addEventListener('mouseenter', () => {
      if (isOpen()) setActiveIndex(index);
    });
  });

  document.addEventListener('click', (event) => {
    if (!dropdown.contains(event.target)) {
      closeDropdown();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      closeDropdown();
      toggle.focus();
    }

    if (event.key === 'Tab' && isOpen()) {
      closeDropdown();
    }
  });

  nativeSelect.addEventListener('change', () => {
    renderSelected(nativeSelect.value);
  });

  window.addEventListener('resize', () => {
    if (isOpen()) positionMenu();
  });

  renderSelected(nativeSelect.value);
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

  initRoleDropdown();

  // Google Sign-In
  document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('googleSignInBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    showLoading();

    try {
      const result = await authManager.signInWithGoogle();

      if (!result.success) {
        hideLoading();
        btn.disabled = false;
        btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" height="20"> Continue with Google';
        showAlert(result.error || 'Google Sign-In failed.', result.cancelled ? 'warning' : 'danger');
        return;
      }

      // New user or incomplete profile → complete profile page
      if (result.isNewUser || !result.profileComplete) {
        window.location.href = 'complete-profile.html';
        return;
      }

      // Existing user with complete profile → dashboard
      hideLoading();
      showAlert('Login successful! Redirecting...', 'success');
      setTimeout(() => redirectToDashboard(result.role), 1000);
    } catch (err) {
      hideLoading();
      btn.disabled = false;
      btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" height="20"> Continue with Google';
      showAlert('An error occurred. Please try again.', 'danger');
      console.error('Google sign-in error:', err);
    }
  });
});
