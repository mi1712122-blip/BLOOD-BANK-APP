// Blood Request Module
class BloodRequestManager {
  constructor() {
    this.requestStatus = {
      PENDING: 'Pending',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      COMPLETED: 'Completed'
    };
  }

  // Create blood request
  async createBloodRequest(requestData) {
    try {
      const request = {
        hospitalId: requestData.hospitalId,
        hospitalName: requestData.hospitalName,
        bloodGroup: requestData.bloodGroup,
        units: requestData.units,
        urgencyLevel: requestData.urgencyLevel || 'Normal',
        patientName: requestData.patientName || null,
        patientAge: requestData.patientAge || null,
        purpose: requestData.purpose || '',
        organizationId: requestData.organizationId || null,
        status: this.requestStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await firebase.firestore().collection('bloodRequests').add(request);
      
      // Send notification
      await this.sendNotification({
        type: 'blood_request',
        title: 'New Blood Request',
        message: `${requestData.hospitalName} requested ${requestData.units} units of ${requestData.bloodGroup}`,
        recipientId: requestData.organizationId,
        requestId: docRef.id
      });

      return { success: true, id: docRef.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get requests for hospital
  async getHospitalRequests(hospitalId) {
    try {
      const snapshot = await firebase.firestore()
        .collection('bloodRequests')
        .where('hospitalId', '==', hospitalId)
        .orderBy('createdAt', 'desc')
        .get();

      const requests = [];
      snapshot.forEach(doc => {
        requests.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: requests };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get requests for organization
  async getOrganizationRequests(organizationId) {
    try {
      const snapshot = await firebase.firestore()
        .collection('bloodRequests')
        .where('organizationId', '==', organizationId)
        .orderBy('createdAt', 'desc')
        .get();

      const requests = [];
      snapshot.forEach(doc => {
        requests.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: requests };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Approve request
  async approveRequest(requestId, organizationId) {
    try {
      const requestDoc = await firebase.firestore().collection('bloodRequests').doc(requestId).get();
      const request = requestDoc.data();

      await firebase.firestore().collection('bloodRequests').doc(requestId).update({
        status: this.requestStatus.APPROVED,
        organizationId: organizationId,
        approvedAt: new Date()
      });

      // Send notification to hospital
      await this.sendNotification({
        type: 'request_approved',
        title: 'Blood Request Approved',
        message: `Your request for ${request.units} units of ${request.bloodGroup} has been approved`,
        recipientId: request.hospitalId
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Reject request
  async rejectRequest(requestId, reason) {
    try {
      const requestDoc = await firebase.firestore().collection('bloodRequests').doc(requestId).get();
      const request = requestDoc.data();

      await firebase.firestore().collection('bloodRequests').doc(requestId).update({
        status: this.requestStatus.REJECTED,
        rejectionReason: reason,
        rejectedAt: new Date()
      });

      // Send notification
      await this.sendNotification({
        type: 'request_rejected',
        title: 'Blood Request Rejected',
        message: `Your request for ${request.units} units of ${request.bloodGroup} has been rejected. Reason: ${reason}`,
        recipientId: request.hospitalId
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send notification
  async sendNotification(notificationData) {
    try {
      const notification = {
        recipientId: notificationData.recipientId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        isRead: false,
        createdAt: new Date()
      };

      await firebase.firestore().collection('notifications').add(notification);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get notifications
  async getNotifications(userId) {
    try {
      const snapshot = await firebase.firestore()
        .collection('notifications')
        .where('recipientId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const notifications = [];
      snapshot.forEach(doc => {
        notifications.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: notifications };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId) {
    try {
      await firebase.firestore().collection('notifications').doc(notificationId).update({
        isRead: true
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get unread notification count
  async getUnreadNotificationCount(userId) {
    try {
      const snapshot = await firebase.firestore()
        .collection('notifications')
        .where('recipientId', '==', userId)
        .where('isRead', '==', false)
        .get();

      return { success: true, count: snapshot.size };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Create global instance
const bloodRequestManager = new BloodRequestManager();
