import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  writeBatch,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';
console.log('Auth module loaded with Firebase project:', auth?.app?.options?.projectId || 'unknown');

function getGoogleSignInErrorMessage(error) {
  const code = error?.code || '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const errorMessages = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Please allow pop-ups for this site and try again.',
    'auth/operation-not-allowed': 'Google Sign-In is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication, then try again.',
    'auth/unauthorized-domain': `Google Sign-In is not authorized for ${host || 'this domain'}. Add this domain in Firebase Authentication > Settings > Authorized domains.`,
    'auth/operation-not-supported-in-this-environment': 'Google Sign-In requires the app to be opened from a local or hosted web server, not directly from a file.',
    'auth/account-exists-with-different-credential': 'An account already exists for this email with another sign-in method. Please use email and password to sign in.',
    'auth/network-request-failed': 'A network error prevented Google Sign-In. Check your connection and try again.'
  };
  return errorMessages[code] || 'Google Sign-In could not be completed. Please try again.';
}

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

    if (role) {
      try {
        sessionStorage.setItem('userRole', role);
        if (user && user.uid) {
          sessionStorage.setItem('userId', user.uid);
        }
        localStorage.setItem('userRole', role);
        if (user && user.uid) {
          localStorage.setItem('userId', user.uid);
        }
      } catch (error) {
        console.warn('Storage unavailable, auth session persistence may not work:', error);
      }
    }
  }

  clearSessionUser() {
    this.currentUser = null;
    this.currentUserRole = null;
    this.currentUserData = null;
    try {
      sessionStorage.removeItem('userRole');
      sessionStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userId');
    } catch (error) {
      console.warn('Unable to clear stored auth state:', error);
    }
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

  async signInWithGoogle() {
    try {
      if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        return {
          success: false,
          error: 'Google Sign-In requires the app to be opened from a local or hosted web server, not directly from a file.'
        };
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Check if user already exists in Firestore
      const userDocRef = await getDoc(doc(db, 'users', user.uid));

      if (userDocRef.exists()) {
        const data = userDocRef.data();
        // Block admin Google sign-in
        if (data.role === 'admin') {
          await signOut(auth);
          return { success: false, error: 'Admin accounts cannot use Google Sign-In.' };
        }
        const role = data.role;
        const profileComplete = ['donor', 'organization', 'hospital'].includes(role)
          && data.profileComplete !== false;
        this.setSessionUser(user, role, data);
        return { success: true, user, role, isNewUser: false, profileComplete };
      }

      // New Google user — create minimal user doc, mark profile incomplete
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        authProvider: 'google',
        profileComplete: false,
        createdAt: new Date()
      });

      return { success: true, user, isNewUser: true, profileComplete: false };
    } catch (error) {
      const cancelled = error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request';
      console.error('Google sign-in error:', { code: error?.code, message: error?.message, error });
      return { success: false, cancelled, error: getGoogleSignInErrorMessage(error) };
    }
  }

  async completeGoogleProfile(role, profileData) {
    const allowedRoles = ['donor', 'organization', 'hospital'];
    const user = auth.currentUser;

    if (!user) {
      return { success: false, error: 'Please sign in with Google before completing your profile.' };
    }
    if (!user.providerData.some((provider) => provider.providerId === 'google.com')) {
      return { success: false, error: 'Please sign in with Google before completing your profile.' };
    }
    if (!allowedRoles.includes(role)) {
      return { success: false, error: 'Please choose one account role.' };
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnapshot = await getDoc(userRef);
      const existingData = userSnapshot.exists() ? userSnapshot.data() : {};

      if (existingData.role === 'admin') {
        await signOut(auth);
        return { success: false, error: 'Admin accounts cannot use Google Sign-In.' };
      }

      const batch = writeBatch(db);
      const userData = {
        uid: user.uid,
        email: user.email || existingData.email || '',
        displayName: user.displayName || existingData.displayName || '',
        photoURL: user.photoURL || existingData.photoURL || '',
        authProvider: 'google',
        role,
        profileComplete: true,
        completedAt: new Date(),
        ...profileData
      };
      batch.set(userRef, userData, { merge: true });

      if (role === 'donor') {
        batch.set(doc(db, 'donors', user.uid), {
          uid: user.uid,
          email: userData.email,
          fullName: profileData.fullName,
          phone: profileData.phone,
          bloodGroup: profileData.bloodGroup,
          age: profileData.age,
          gender: profileData.gender,
          city: profileData.city,
          address: profileData.address,
          lastDonationDate: null,
          profilePhoto: user.photoURL || null,
          totalDonations: 0,
          isEligible: true,
          createdAt: new Date()
        }, { merge: true });
      } else {
        const collectionName = role === 'hospital' ? 'hospitals' : 'organizations';
        const nameField = role === 'hospital' ? 'hospitalName' : 'organizationName';
        batch.set(doc(db, collectionName, user.uid), {
          uid: user.uid,
          email: userData.email,
          [nameField]: profileData[nameField],
          phone: profileData.phone,
          address: profileData.address,
          city: profileData.city,
          licenseNumber: profileData.licenseNumber,
          isApproved: false,
          createdAt: new Date()
        }, { merge: true });
      }

      await batch.commit();
      const savedData = { ...existingData, ...userData };
      this.setSessionUser(user, role, savedData);
      return { success: true, user, role };
    } catch (error) {
      console.error('Google profile completion error:', error);
      return { success: false, error: 'We could not save your profile. Please try again.' };
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
          const storedUid = sessionStorage.getItem('userId');
          const storedRole = sessionStorage.getItem('userRole');
          if (storedUid && storedRole) {
            try {
              const userDocRef = await getDoc(doc(db, 'users', storedUid));
              if (userDocRef.exists()) {
                const data = userDocRef.data();
                this.setSessionUser(null, storedRole, data);
                resolve({ user: null, role: storedRole, data });
                return;
              }
            } catch (error) {
              console.error('Error reloading current user from session storage:', error);
            }
          }

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
