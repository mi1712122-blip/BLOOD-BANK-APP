// Authentication Module
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentUserRole = null;
    this.currentUserData = null;
  }

  // Register new user
  async register(email, password, userData) {
    try {
      // Create user account
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // Store additional user data in Firestore
      const userDocData = {
        uid: user.uid,
        email: email,
        role: userData.role,
        createdAt: new Date(),
        ...userData
      };

      // Create collection based on role
      await firebase.firestore().collection('users').doc(user.uid).set(userDocData);

      // Create role-specific collection entry
      if (userData.role === 'donor') {
        await firebase.firestore().collection('donors').doc(user.uid).set({
          uid: user.uid,
          email: email,
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
        await firebase.firestore().collection('organizations').doc(user.uid).set({
          uid: user.uid,
          email: email,
          organizationName: userData.organizationName,
          phone: userData.phone,
          address: userData.address,
          city: userData.city,
          licenseNumber: userData.licenseNumber,
          isApproved: false,
          createdAt: new Date()
        });
      } else if (userData.role === 'hospital') {
        await firebase.firestore().collection('hospitals').doc(user.uid).set({
          uid: user.uid,
          email: email,
          hospitalName: userData.hospitalName,
          phone: userData.phone,
          address: userData.address,
          city: userData.city,
          licenseNumber: userData.licenseNumber,
          isApproved: false,
          createdAt: new Date()
        });
      }

      return { success: true, user: user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Login user
  async login(email, password) {
    try {
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // Fetch user data from Firestore
      const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
      
      if (userDoc.exists) {
        this.currentUser = user;
        this.currentUserRole = userDoc.data().role;
        this.currentUserData = userDoc.data();
        
        // Store in sessionStorage for persistence
        sessionStorage.setItem('userRole', this.currentUserRole);
        sessionStorage.setItem('userId', user.uid);
        
        return { success: true, user: user, role: this.currentUserRole };
      } else {
        return { success: false, error: 'User data not found' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Logout user
  async logout() {
    try {
      await firebase.auth().signOut();
      this.currentUser = null;
      this.currentUserRole = null;
      this.currentUserData = null;
      sessionStorage.removeItem('userRole');
      sessionStorage.removeItem('userId');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get current user
  async getCurrentUser() {
    return new Promise((resolve) => {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
          const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
          this.currentUser = user;
          this.currentUserRole = userDoc.data().role;
          this.currentUserData = userDoc.data();
          resolve({ user: user, role: this.currentUserRole, data: userDoc.data() });
        } else {
          resolve(null);
        }
      });
    });
  }

  // Update user profile
  async updateProfile(uid, updateData) {
    try {
      await firebase.firestore().collection('users').doc(uid).update(updateData);
      
      // Update role-specific collection
      if (this.currentUserRole === 'donor') {
        await firebase.firestore().collection('donors').doc(uid).update(updateData);
      } else if (this.currentUserRole === 'organization') {
        await firebase.firestore().collection('organizations').doc(uid).update(updateData);
      } else if (this.currentUserRole === 'hospital') {
        await firebase.firestore().collection('hospitals').doc(uid).update(updateData);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Reset password
  async resetPassword(email) {
    try {
      await firebase.auth().sendPasswordResetEmail(email);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Create global instance
const authManager = new AuthManager();
