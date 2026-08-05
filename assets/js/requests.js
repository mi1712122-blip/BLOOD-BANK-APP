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
      PROCESSING: 'Processing',
      REJECTED: 'Rejected',
      CANCELLED: 'Cancelled',
      COMPLETED: 'Completed'
    };
  }

  async getAdminRecipientIds() {
    try {
      const adminQuery = query(
        collection(db, 'users'),
        where('role', '==', 'admin')
      );
      const snapshot = await getDocs(adminQuery);
      const adminIds = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const uid = data.uid || docSnap.id;
        if (uid) adminIds.push(uid);
      });
      return adminIds;
    } catch (error) {
      console.error('Error loading admin recipients:', error);
      return [];
    }
  }

  async broadcastRequestNotification({ request, event, title, message, senderId = null, senderRole = null, senderName = null }) {
    const notifications = [];

    if (event === 'new_request' && request?.organizationId) {
      notifications.push({
        recipientId: request.organizationId,
        recipientRole: 'organization',
        type: event,
        title,
        message,
        senderId,
        senderRole,
        senderName,
        isRead: false
      });
    }

    if (event === 'request_cancelled' && request?.organizationId) {
      notifications.push({
        recipientId: request.organizationId,
        recipientRole: 'organization',
        type: event,
        title,
        message,
        senderId,
        senderRole,
        senderName,
        isRead: false
      });
    }

    if (['request_submitted', 'request_approved', 'request_rejected', 'processing_started', 'blood_delivered'].includes(event) && request?.hospitalId) {
      notifications.push({
        recipientId: request.hospitalId,
        recipientRole: 'hospital',
        type: event,
        title,
        message,
        senderId,
        senderRole,
        senderName,
        isRead: false
      });
    }

    const adminIds = await this.getAdminRecipientIds();
    adminIds.forEach((adminId) => {
      notifications.push({
        recipientId: adminId,
        recipientRole: 'admin',
        type: `${event}_admin`,
        title: `${title} - Admin`,
        message: `${message} (${request?.hospitalName || 'Hospital'} / ${request?.bloodGroup || 'Blood'})`,
        senderId,
        senderRole,
        senderName,
        isRead: false
      });
    });

    for (const notification of notifications) {
      await this.sendNotification(notification);
    }
    return { success: true };
  }

  async createBloodRequest(requestData) {
    try {
      const organizationId = requestData.organizationId || requestData.organizationUid || requestData.organization?.uid || requestData.organization?.id || null;
      const organizationName = requestData.organizationName || requestData.organization?.organizationName || requestData.organization?.hospitalName || null;

      const request = {
        hospitalId: requestData.hospitalId,
        hospitalName: requestData.hospitalName,
        bloodGroup: requestData.bloodGroup,
        units: requestData.units,
        urgencyLevel: requestData.urgencyLevel || 'Normal',
        patientName: requestData.patientName || null,
        patientAge: requestData.patientAge || null,
        purpose: requestData.purpose || '',
        organizationId,
        organizationName,
        status: this.requestStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'bloodRequests'), request);
      const createdRequest = { ...request, id: docRef.id };

      await this.broadcastRequestNotification({
        request: createdRequest,
        event: 'new_request',
        title: 'New Blood Request',
        message: `${requestData.hospitalName} requested ${requestData.units} units of ${requestData.bloodGroup}.`,
        senderId: requestData.hospitalId,
        senderRole: 'hospital',
        senderName: requestData.hospitalName
      });

      await this.broadcastRequestNotification({
        request: createdRequest,
        event: 'request_submitted',
        title: 'Request Submitted',
        message: `Your request for ${requestData.units} units of ${requestData.bloodGroup} has been submitted successfully.`,
        senderId: requestData.hospitalId,
        senderRole: 'hospital',
        senderName: requestData.hospitalName
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

  async getOrganizationRequests(organizationId, fallbackOrganizationId = null) {
    try {
      const orgIds = [...new Set([organizationId, fallbackOrganizationId].filter(Boolean))];
      if (!orgIds.length) {
        return { success: true, data: [] };
      }

      const snapshots = await Promise.all(
        orgIds.map((id) => getDocs(query(
          collection(db, 'bloodRequests'),
          where('organizationId', '==', id)
        )))
      );

      const requestMap = new Map();
      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          const requestData = { id: docSnap.id, ...docSnap.data() };
          requestMap.set(docSnap.id, requestData);
        });
      });

      const requests = [...requestMap.values()].sort((a, b) => {
        const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      return { success: true, data: requests };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async approveRequest(requestId, organizationId) {
    try {
      const requestDoc = await getDoc(doc(db, 'bloodRequests', requestId));
      if (!requestDoc.exists()) {
        return { success: false, error: 'Request not found.' };
      }

      const request = requestDoc.data();
      if (request.status === this.requestStatus.REJECTED || request.status === this.requestStatus.COMPLETED) {
        return { success: false, error: 'This request can no longer be updated.' };
      }

      await updateDoc(doc(db, 'bloodRequests', requestId), {
        status: this.requestStatus.PROCESSING,
        organizationId: organizationId || request.organizationId || null,
        approvedAt: new Date(),
        updatedAt: new Date()
      });

      await this.broadcastRequestNotification({
        request: { ...request, id: requestId, organizationId: organizationId || request.organizationId || null },
        event: 'request_approved',
        title: 'Request Approved',
        message: `Your request for ${request.units} units of ${request.bloodGroup} has been approved.`,
        senderId: organizationId || request.organizationId || null,
        senderRole: 'organization',
        senderName: request.organizationName || 'Organization'
      });

      await this.broadcastRequestNotification({
        request: { ...request, id: requestId, organizationId: organizationId || request.organizationId || null },
        event: 'processing_started',
        title: 'Processing Started',
        message: `Processing has started for your ${request.bloodGroup} request. The organization is preparing the blood delivery.`,
        senderId: organizationId || request.organizationId || null,
        senderRole: 'organization',
        senderName: request.organizationName || 'Organization'
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async completeRequest(requestId, details = {}) {
    try {
      const requestDoc = await getDoc(doc(db, 'bloodRequests', requestId));
      if (!requestDoc.exists()) {
        return { success: false, error: 'Request not found.' };
      }

      const request = requestDoc.data();
      await updateDoc(doc(db, 'bloodRequests', requestId), {
        status: this.requestStatus.COMPLETED,
        issuedAt: new Date(),
        completedAt: new Date(),
        updatedAt: new Date(),
        issueDetails: {
          organizationId: details.organizationId || request.organizationId || null,
          organizationName: details.organizationName || request.organizationName || null,
          unitsIssued: details.units || request.units || 0,
          bloodGroup: details.bloodGroup || request.bloodGroup || null,
          issuedBy: details.issuedBy || null
        }
      });

      await this.broadcastRequestNotification({
        request: { ...request, id: requestId },
        event: 'blood_delivered',
        title: 'Blood Delivered',
        message: `${details.units || request.units || 0} units of ${details.bloodGroup || request.bloodGroup} have been delivered to your hospital.`,
        senderId: details.organizationId || request.organizationId || null,
        senderRole: 'organization',
        senderName: details.organizationName || request.organizationName || 'Organization'
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

      await this.broadcastRequestNotification({
        request: { ...request, id: requestId },
        event: 'request_rejected',
        title: 'Request Rejected',
        message: `Your request for ${request.units} units of ${request.bloodGroup} has been rejected. Reason: ${reason}`,
        senderId: request.organizationId || null,
        senderRole: 'organization',
        senderName: request.organizationName || 'Organization'
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cancelRequest(requestId, reason = 'Cancelled by hospital') {
    try {
      const requestDoc = await getDoc(doc(db, 'bloodRequests', requestId));
      if (!requestDoc.exists()) {
        return { success: false, error: 'Request not found.' };
      }

      const request = requestDoc.data();
      await updateDoc(doc(db, 'bloodRequests', requestId), {
        status: this.requestStatus.CANCELLED,
        cancellationReason: reason,
        cancelledAt: new Date(),
        updatedAt: new Date()
      });

      await this.broadcastRequestNotification({
        request: { ...request, id: requestId },
        event: 'request_cancelled',
        title: 'Request Cancelled',
        message: `${request.hospitalName || 'Hospital'} cancelled the request for ${request.units} units of ${request.bloodGroup}. Reason: ${reason}`,
        senderId: request.hospitalId,
        senderRole: 'hospital',
        senderName: request.hospitalName || 'Hospital'
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
        recipientRole: notificationData.recipientRole || notificationData.senderRole || null,
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
