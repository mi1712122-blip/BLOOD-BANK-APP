// Blood Inventory Module
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

  // Add blood to inventory
  async addBlood(organizationId, bloodData) {
    try {
      const bloodRecord = {
        organizationId: organizationId,
        bloodGroup: bloodData.bloodGroup,
        units: bloodData.units,
        expiryDate: bloodData.expiryDate,
        collectionDate: new Date(),
        donorId: bloodData.donorId || null,
        status: 'Available',
        createdAt: new Date()
      };

      const docRef = await firebase.firestore().collection('bloodInventory').add(bloodRecord);
      return { success: true, id: docRef.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get blood inventory by organization
  async getInventoryByOrganization(organizationId) {
    try {
      const snapshot = await firebase.firestore()
        .collection('bloodInventory')
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'Available')
        .get();

      const inventory = {};
      this.bloodGroups.forEach(group => inventory[group] = 0);

      snapshot.forEach(doc => {
        const data = doc.data();
        inventory[data.bloodGroup] = (inventory[data.bloodGroup] || 0) + data.units;
      });

      return { success: true, data: inventory };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update blood quantity
  async updateBloodQuantity(bloodId, newUnits) {
    try {
      await firebase.firestore().collection('bloodInventory').doc(bloodId).update({
        units: newUnits,
        updatedAt: new Date()
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Delete blood record
  async deleteBlood(bloodId) {
    try {
      await firebase.firestore().collection('bloodInventory').doc(bloodId).delete();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Search blood availability
  async searchBloodAvailability(bloodGroup, city) {
    try {
      const snapshot = await firebase.firestore()
        .collection('organizations')
        .where('city', '==', city)
        .where('isApproved', '==', true)
        .get();

      const availability = [];
      for (const org of snapshot.docs) {
        const inventorySnapshot = await firebase.firestore()
          .collection('bloodInventory')
          .where('organizationId', '==', org.id)
          .where('bloodGroup', '==', bloodGroup)
          .where('status', '==', 'Available')
          .get();

        let totalUnits = 0;
        inventorySnapshot.forEach(doc => {
          totalUnits += doc.data().units;
        });

        if (totalUnits > 0) {
          availability.push({
            organizationId: org.id,
            organizationName: org.data().organizationName,
            bloodGroup: bloodGroup,
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

  // Get color for blood group
  getBloodGroupColor(bloodGroup) {
    return this.bloodGroupColors[bloodGroup] || '#333333';
  }
}

// Create global instance
const bloodInventoryManager = new BloodInventoryManager();
