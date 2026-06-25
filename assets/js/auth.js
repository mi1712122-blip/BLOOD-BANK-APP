import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
console.log('Auth module loaded with Firebase project:', auth?.app?.options?.projectId || 'unknown');

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentUserRole = null;
    this.currentUserData = null;
  }

  setSessionUser(user, role, data) {
    this.currentUser = user;
    this.currentUserRole = role;
    this.currentUserData = data;

    if (user && role) {
      sessionStorage.setItem('userRole', role);
      sessionStorage.setItem('userId', user.uid);
    }
  }

  clearSessionUser() {
    this.currentUser = null;
    this.currentUserRole = null;
    this.currentUserData = null;
    sessionStorage.removeItem('userRole');
    sessionStorage.removeItem('userId');
  }

  async register(email, password, userData) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDocData = {
        uid: user.uid,
        email,
        role: userData.role,
        createdAt: new Date(),
        ...userData
      };

      await setDoc(doc(db, 'users', user.uid), userDocData);

      if (userData.role === 'donor') {
        await setDoc(doc(db, 'donors', user.uid), {
          uid: user.uid,
          email,
          fullName: userData.fullName,
          phone: userData.phone,
          bloodGroup: userData.bloodGroup,
          age: userData.age,
          gender: userData.gender,
          city: userData.city,
          address: userData.address,
          lastDonationDate: userData.lastDonationDate || null,
          profilePhoto: userData.profilePhoto || null,
          totalDonations: 0,
          isEligible: true,
          createdAt: new Date()
        });
      } else if (userData.role === 'organization') {
        await setDoc(doc(db, 'organizations', user.uid), {
          uid: user.uid,
          email,
          organizationName: userData.organizationName,
          phone: userData.phone,
          address: userData.address,
          city: userData.city,
          licenseNumber: userData.licenseNumber,
          isApproved: false,
          createdAt: new Date()
        });
      } else if (userData.role === 'hospital') {
        await setDoc(doc(db, 'hospitals', user.uid), {
          uid: user.uid,
          email,
          hospitalName: userData.hospitalName,
          phone: userData.phone,
          address: userData.address,
          city: userData.city,
          licenseNumber: userData.licenseNumber,
          isApproved: false,
          createdAt: new Date()
        });
      }

      return { success: true, user };
    } catch (error) {
      console.error('Firebase auth register error:', error);
      console.error('Registration error code:', error?.code);
      console.error('Registration error message:', error?.message);
      return { success: false, error: error.message || error?.code || 'Registration failed' };
    }
  }

  async login(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userDocRef = await getDoc(doc(db, 'users', user.uid));

      if (userDocRef.exists()) {
        const role = userDocRef.data().role;
        this.setSessionUser(user, role, userDocRef.data());
        return { success: true, user, role };
      }

      return { success: false, error: 'User data not found' };
    } catch (error) {
      console.error('Firebase auth login error:', error);
      console.error('Login error code:', error?.code);
      console.error('Login error message:', error?.message);
      return { success: false, error: error.message || error?.code || 'Login failed' };
    }
  }

  async logout() {
    try {
      await signOut(auth);
      this.clearSessionUser();
      return { success: true };
    } catch (error) {
      console.error('Firebase auth logout error:', error);
      return { success: false, error: error.message };
    }
  }

  async getCurrentUser() {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();

        if (!user) {
          this.clearSessionUser();
          resolve(null);
          return;
        }

        try {
          const userDocRef = await getDoc(doc(db, 'users', user.uid));
          if (userDocRef.exists()) {
            const data = userDocRef.data();
            const role = data.role;
            this.setSessionUser(user, role, data);
            resolve({ user, role, data });
          } else {
            this.clearSessionUser();
            resolve(null);
          }
        } catch (error) {
          console.error('Error loading current user:', error);
          this.clearSessionUser();
          resolve(null);
        }
      });
    });
  }

  async updateProfile(uid, updateData) {
    try {
      await updateDoc(doc(db, 'users', uid), updateData);

      const role = this.currentUserRole || this.currentUserData?.role;
      if (role === 'donor') {
        await updateDoc(doc(db, 'donors', uid), updateData);
      } else if (role === 'organization') {
        await updateDoc(doc(db, 'organizations', uid), updateData);
      } else if (role === 'hospital') {
        await updateDoc(doc(db, 'hospitals', uid), updateData);
      }

      return { success: true };
    } catch (error) {
      console.error('Firebase profile update error:', error);
      return { success: false, error: error.message };
    }
  }

  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      console.error('Firebase password reset error:', error);
      return { success: false, error: error.message };
    }
  }
}

export { AuthManager };
export const authManager = new AuthManager();
window.authManager = authManager;
