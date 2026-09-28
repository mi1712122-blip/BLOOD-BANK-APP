const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { FieldPath, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

initializeApp();

const db = getFirestore();
const PAGE_SIZE = 200;

function parseExpiryDate(value) {
  if (value === null || value === undefined) return null;

  let date;
  if (typeof value.toDate === 'function') date = value.toDate();
  else if (typeof value.toMillis === 'function') date = new Date(value.toMillis());
  else if (typeof value === 'object' && Number.isFinite(value.seconds)) date = new Date(value.seconds * 1000);
  else date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function expiryHistoryId(inventoryId) {
  const digest = crypto.createHash('sha256').update(inventoryId).digest('hex');
  return `expiry_${digest}`;
}

async function expireInventoryBatch(inventoryDoc, now) {
  const inventoryRef = inventoryDoc.ref;
  const historyRef = db.collection('inventoryHistory').doc(expiryHistoryId(inventoryDoc.id));

  return db.runTransaction(async (transaction) => {
    const [currentInventory, existingHistory] = await Promise.all([
      transaction.get(inventoryRef),
      transaction.get(historyRef)
    ]);

    if (!currentInventory.exists) return false;

    const batch = currentInventory.data();
    if (batch.status === 'Expired') return false;

    const expiryDate = parseExpiryDate(batch.expiryDate);
    if (batch.status !== 'Available' || !expiryDate || expiryDate.getTime() > now.toMillis()) {
      return false;
    }

    const updatedAt = Timestamp.now();
    transaction.update(inventoryRef, {
      status: 'Expired',
      updatedAt
    });

    if (!existingHistory.exists) {
      const originalUnits = batch.units ?? 0;
      const numericUnits = Number(originalUnits);
      const auditUnits = Number.isFinite(numericUnits) && numericUnits > 0 ? numericUnits : 0;
      transaction.create(historyRef, {
        inventoryId: inventoryDoc.id,
        donationId: batch.donationId || null,
        organizationId: batch.organizationId || '',
        organizationName: batch.organizationName || '',
        bloodGroup: batch.bloodGroup || '',
        expiryDate: batch.expiryDate,
        units: originalUnits,
        quantity: originalUnits,
        expiredUnits: originalUnits,
        previousUnits: auditUnits,
        currentUnits: 0,
        difference: -auditUnits,
        reason: 'Expiry',
        userId: 'system',
        actorType: 'system',
        date: updatedAt,
        createdAt: updatedAt
      });
    }

    return true;
  });
}

exports.expireBloodInventoryBatches = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Etc/UTC',
  region: 'us-central1',
  maxInstances: 1,
  timeoutSeconds: 540
}, async () => {
  let lastDocument = null;
  let processedCount = 0;

  while (true) {
    let query = db.collection('bloodInventory')
      .where('status', '==', 'Available')
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDocument) query = query.startAfter(lastDocument);

    const page = await query.get();
    if (page.empty) break;

    const now = Timestamp.now();
    for (const inventoryDoc of page.docs) {
      try {
        if (await expireInventoryBatch(inventoryDoc, now)) processedCount += 1;
      } catch (error) {
        console.error(`Could not process expired inventory batch ${inventoryDoc.id}.`, error);
      }
    }

    lastDocument = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) break;
  }

  console.info(`Expired ${processedCount} blood inventory batch(es).`);
});
