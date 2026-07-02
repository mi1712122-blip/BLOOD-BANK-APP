import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { db } from './firebase-config.js';

class BloodRequestManager {
  constructor() {
    this.requestStatus = {
      PENDING: 'Pending',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      COMPLETED: 'Completed'
    };
  }

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

      const docRef = await addDoc(collection(db, 'bloodRequests'), request);

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

  async getHospitalRequests(hospitalId) {
    try {
      const requestQuery = query(
        collection(db, 'bloodRequests'),
        where('hospitalId', '==', hospitalId)
      );
      const snapshot = await getDocs(requestQuery);

      const requests = [];
      snapshot.forEach((docSnap) => {
        requests.push({ id: docSnap.id, ...docSnap.data() });
      });

      return { success: true, data: requests };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getOrganizationRequests(organizationId) {
    try {
      const requestQuery = query(
        collection(db, 'bloodRequests'),
        where('organizationId', '==', organizationId)
      );
      const snapshot = await getDocs(requestQuery);

      const requests = [];
      snapshot.forEach((docSnap) => {
        requests.push({ id: docSnap.id, ...docSnap.data() });
      });

      return { success: true, data: requests };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async approveRequest(requestId, organizationId) {
    try {
      const requestDoc = await getDoc(doc(db, 'bloodRequests', requestId));
      const request = requestDoc.data();

      await updateDoc(doc(db, 'bloodRequests', requestId), {
        status: this.requestStatus.APPROVED,
        organizationId,
        approvedAt: new Date()
      });

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

  async rejectRequest(requestId, reason) {
    try {
      const requestDoc = await getDoc(doc(db, 'bloodRequests', requestId));
      const request = requestDoc.data();

      await updateDoc(doc(db, 'bloodRequests', requestId), {
        status: this.requestStatus.REJECTED,
        rejectionReason: reason,
        rejectedAt: new Date()
      });

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

  async sendNotification(notificationData) {
    try {
      const notification = {
        recipientId: notificationData.recipientId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        senderId: notificationData.senderId || null,
        senderRole: notificationData.senderRole || null,
        senderName: notificationData.senderName || null,
        isRead: false,
        createdAt: new Date()
      };

      await addDoc(collection(db, 'notifications'), notification);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getNotifications(userId) {
    try {
      const notificationQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId),
        limit(50)
      );
      const snapshot = await getDocs(notificationQuery);

      const notifications = [];
      snapshot.forEach((docSnap) => {
        notifications.push({ id: docSnap.id, ...docSnap.data() });
      });

      return { success: true, data: notifications };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  listenNotifications(userId, callback) {
    try {
      const notificationQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId),
        limit(50)
      );

      return onSnapshot(
        notificationQuery,
        (snapshot) => {
          const notifications = [];
          snapshot.forEach((docSnap) => {
            notifications.push({ id: docSnap.id, ...docSnap.data() });
          });

          notifications.sort((a, b) => {
            const aTime = a.createdAt?.seconds ?? a.createdAt?.toMillis?.() ?? 0;
            const bTime = b.createdAt?.seconds ?? b.createdAt?.toMillis?.() ?? 0;
            return bTime - aTime;
          });

          callback({ success: true, data: notifications });
        },
        (error) => {
          callback({ success: false, error: error.message });
        }
      );
    } catch (error) {
      callback({ success: false, error: error.message });
      return () => {};
    }
  }

  async markNotificationAsRead(notificationId) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
        updatedAt: new Date()
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async markAllNotificationsRead(userId) {
    try {
      const notificationQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId),
        where('isRead', '==', false)
      );
      const snapshot = await getDocs(notificationQuery);
      const promises = [];
      snapshot.forEach((docSnap) => {
        promises.push(updateDoc(doc(db, 'notifications', docSnap.id), { isRead: true, updatedAt: new Date() }));
      });
      await Promise.all(promises);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async clearAllNotifications(userId) {
    try {
      const notificationQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId)
      );
      const snapshot = await getDocs(notificationQuery);
      const promises = [];
      snapshot.forEach((docSnap) => {
        promises.push(deleteDoc(doc(db, 'notifications', docSnap.id)));
      });
      await Promise.all(promises);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getUnreadNotificationCount(userId) {
    try {
      const notificationQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId),
        where('isRead', '==', false)
      );
      const snapshot = await getDocs(notificationQuery);

      return { success: true, count: snapshot.size };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export const bloodRequestManager = new BloodRequestManager();
window.bloodRequestManager = bloodRequestManager;
