import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { db } from './firebase-config.js';

class BloodInventoryManager {
  constructor() {
    this.bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    this.bloodGroupColors = {
      'A+': '#D32F2F',
      'A-': '#E53935',
      'B+': '#F57C00',
      'B-': '#FB8C00',
      'AB+': '#7B1FA2',
      'AB-': '#6A1B9A',
      'O+': '#2E7D32',
      'O-': '#388E3C'
    };
  }

  async addBlood(organizationId, bloodData) {
    try {
      const bloodRecord = {
        organizationId,
        bloodGroup: bloodData.bloodGroup,
        units: bloodData.units,
        expiryDate: bloodData.expiryDate,
        collectionDate: new Date(),
        donorId: bloodData.donorId || null,
        status: 'Available',
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'bloodInventory'), bloodRecord);
      return { success: true, id: docRef.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getInventoryByOrganization(organizationId) {
    try {
      const inventoryQuery = query(
        collection(db, 'bloodInventory'),
        where('organizationId', '==', organizationId),
        where('status', '==', 'Available')
      );
      const snapshot = await getDocs(inventoryQuery);

      const inventory = {};
      this.bloodGroups.forEach((group) => inventory[group] = 0);

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        inventory[data.bloodGroup] = (inventory[data.bloodGroup] || 0) + data.units;
      });

      return { success: true, data: inventory };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateBloodQuantity(bloodId, newUnits) {
    try {
      await updateDoc(doc(db, 'bloodInventory', bloodId), {
        units: newUnits,
        updatedAt: new Date()
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteBlood(bloodId) {
    try {
      await deleteDoc(doc(db, 'bloodInventory', bloodId));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async searchBloodAvailability(bloodGroup, city) {
    try {
      const organizationQuery = query(
        collection(db, 'organizations'),
        where('city', '==', city),
        where('isApproved', '==', true)
      );
      const snapshot = await getDocs(organizationQuery);

      const availability = [];
      for (const org of snapshot.docs) {
        const inventoryQuery = query(
          collection(db, 'bloodInventory'),
          where('organizationId', '==', org.id),
          where('bloodGroup', '==', bloodGroup),
          where('status', '==', 'Available')
        );
        const inventorySnapshot = await getDocs(inventoryQuery);

        let totalUnits = 0;
        inventorySnapshot.forEach((docSnap) => {
          totalUnits += docSnap.data().units;
        });

        if (totalUnits > 0) {
          availability.push({
            organizationId: org.id,
            organizationName: org.data().organizationName,
            bloodGroup,
            units: totalUnits,
            phone: org.data().phone,
            address: org.data().address
          });
        }
      }

      return { success: true, data: availability };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getBloodGroupColor(bloodGroup) {
    return this.bloodGroupColors[bloodGroup] || '#333333';
  }
}

export const bloodInventoryManager = new BloodInventoryManager();
window.bloodInventoryManager = bloodInventoryManager;
