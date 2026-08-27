import { authManager } from '../../assets/js/auth.js';

const allowedRoles = ['donor', 'organization', 'hospital'];
let selectedRole = '';
let googleUser = null;

const form = document.getElementById('completeProfileForm');
const roleSelection = document.getElementById('roleSelection');
const alertContainer = document.getElementById('alertContainer');
const spinner = document.getElementById('loadingSpinner');

function showAlert(message, type = 'danger') {
  alertContainer.innerHTML = `<div class="alert alert-${type}"><i class="fas fa-${type === 'danger' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span></div>`;
}

function setLoading(isLoading) {
  spinner.classList.toggle('hidden', !isLoading);
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function redirectToDashboard(role) {
  const paths = {
    donor: '../dashboards/donor/dashboard.html',
    organization: '../dashboards/organization/dashboard.html',
    hospital: '../dashboards/hospital/dashboard.html'
  };
  window.location.href = paths[role] || 'login.html';
}

function selectRole(role) {
  selectedRole = role;
  document.querySelectorAll('.role-btn').forEach((button) => button.classList.toggle('active', button.dataset.role === role));
  roleSelection.classList.add('hidden');
  form.classList.remove('hidden');
  allowedRoles.forEach((item) => document.getElementById(`${item}Fields`).classList.toggle('hidden', item !== role));
  alertContainer.innerHTML = '';
}

function getProfileData() {
  const phone = value('phone');
  if (!/^[\d\s\-+()]{10,}$/.test(phone)) return { error: 'Please enter a valid phone number.' };

  if (selectedRole === 'donor') {
    const data = { phone, fullName: value('fullName'), age: Number(value('age')), gender: value('gender'), bloodGroup: value('bloodGroup'), city: value('city'), address: value('address') };
    if (!data.fullName || !data.age || !data.gender || !data.bloodGroup || !data.city || !data.address) return { error: 'Please complete all donor information.' };
    if (data.age < 18 || data.age > 65) return { error: 'Donor age must be between 18 and 65.' };
    return { data };
  }

  const prefix = selectedRole === 'hospital' ? 'hospital' : 'organization';
  const nameField = selectedRole === 'hospital' ? 'hospitalName' : 'organizationName';
  const data = { phone, [nameField]: value(nameField), licenseNumber: value(`${prefix}License`), city: value(`${prefix}City`), address: value(`${prefix}Address`) };
  if (!data[nameField] || !data.licenseNumber || !data.city || !data.address) return { error: `Please complete all ${selectedRole} information.` };
  return { data };
}

document.addEventListener('DOMContentLoaded', async () => {
  setLoading(true);
  const current = await authManager.getCurrentUser();
  setLoading(false);
  const signedInWithGoogle = current?.user?.providerData?.some((provider) => provider.providerId === 'google.com');
  if (!current?.user || !signedInWithGoogle || current.data?.role === 'admin') {
    window.location.replace('login.html');
    return;
  }

  googleUser = current.user;
  document.getElementById('email').value = googleUser.email || current.data.email || '';
  if (current.data.profileComplete !== false && allowedRoles.includes(current.role)) {
    redirectToDashboard(current.role);
    return;
  }
  if (allowedRoles.includes(current.role)) selectRole(current.role);
});

document.querySelectorAll('.role-btn').forEach((button) => button.addEventListener('click', () => selectRole(button.dataset.role)));
document.getElementById('changeRoleBtn').addEventListener('click', () => {
  selectedRole = '';
  form.classList.add('hidden');
  roleSelection.classList.remove('hidden');
  document.querySelectorAll('.role-btn').forEach((button) => button.classList.remove('active'));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!googleUser || !allowedRoles.includes(selectedRole)) {
    showAlert('Choose one role to continue.');
    return;
  }
  const result = getProfileData();
  if (result.error) {
    showAlert(result.error, 'warning');
    return;
  }

  setLoading(true);
  const saved = await authManager.completeGoogleProfile(selectedRole, result.data);
  setLoading(false);
  if (!saved.success) {
    showAlert(saved.error || 'We could not save your profile. Please try again.');
    return;
  }
  redirectToDashboard(saved.role);
});
