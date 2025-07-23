

'use server';

/**
 * @fileOverview Service for logging user and system actions to Firestore.
 */

import { db } from '@/config/firebase';
import { collection, doc, setDoc, Timestamp, FirestoreError, getDoc, writeBatch } from 'firebase/firestore';
import type { Subject } from '@/models/subject';
import { prepareStateForLog } from '@/lib/logUtils';

// --- Firestore Collection Reference (Now dynamic) ---
const getLogsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'logs');

export interface LogEntry {
  id?: string;
  action: string;
  timestamp: Timestamp;
  userId: string;
  details: {
    before?: any; // State before the action
    after?: any; // State after the action
    meta?: any; // Additional context (e.g., rolled back log ID)
    originalLogId?: string; // Added for rollback tracking
    originalAction?: string; // Added for rollback tracking
    [key: string]: any; // Allow other details
  };
}

/**
 * Logs an action performed by a user (or system).
 */
export const logAction = async (
  classId: string,
  actionType: string,
  details: object, // This details object must now be pre-processed to be plain
  userId: string = 'anonymous'
): Promise<string | null> => {
  if (!classId) {
    console.error("LogAction failed: classId is required.");
    return null;
  }
  const logsCollectionRef = getLogsCollectionRef(classId);
  const logEntry: Omit<LogEntry, 'id'> = {
      action: actionType,
      timestamp: Timestamp.now(),
      userId: userId,
      details: details ?? {},
  };

  try {
    const newLogRef = doc(logsCollectionRef);
    await setDoc(newLogRef, logEntry);
    console.log(`Action logged in class ${classId}: ${actionType} by ${userId}`);
    return newLogRef.id;
  } catch (error) {
    console.error(`Failed to log action '${actionType}' in class ${classId} (might be offline):`, error);
    if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
       console.error("Firestore Logging Error: Attempted to save 'undefined' in log details.", logEntry);
    }
    return null;
  }
};


/**
 * Attempts to roll back a previously logged action.
 */
export const rollbackAction = async (classId: string, logId: string, userId: string = 'system_rollback'): Promise<void> => {
    const logsCollectionRef = getLogsCollectionRef(classId);
    const logRef = doc(logsCollectionRef, logId);
    let logEntry: LogEntry | null = null;

    try {
        const logSnap = await getDoc(logRef);
        if (!logSnap.exists()) {
            throw new Error(`Log entry with ID ${logId} not found in class ${classId}.`);
        }
        const rawData = logSnap.data();
        logEntry = {
            id: logSnap.id,
            action: rawData.action,
            timestamp: rawData.timestamp,
            userId: rawData.userId,
            details: rawData.details || {},
        } as LogEntry;

        const { action, details } = logEntry;
        const { before, after, originalLogId } = details;

        if (action === 'rollback_action') {
            if (!originalLogId) {
                 throw new Error(`Cannot roll back a rollback action (Log ID: ${logId}) without the originalLogId.`);
            }
             console.warn(`Attempting to re-apply original action from Log ID: ${originalLogId} due to rollback of Log ID: ${logId}`);
             const originalLogRef = doc(logsCollectionRef, originalLogId);
             const originalLogSnap = await getDoc(originalLogRef);
             if (!originalLogSnap.exists()) {
                 throw new Error(`Original log entry (ID: ${originalLogId}) for rollback action (Log ID: ${logId}) not found.`);
             }
             const originalLogData = originalLogSnap.data() as LogEntry; // Cast to LogEntry
             const originalActionToReapply = originalLogData.action;
             const originalDetailsToReapply = originalLogData.details || {};
             await performActionBasedOnLog(classId, originalActionToReapply, originalDetailsToReapply.after, originalDetailsToReapply.before, userId, `reapply_after_rollback_${logId}`);
             await logAction(classId, 'rollback_rollback_action', {
                 originalRollbackLogId: logId,
                 reappliedOriginalLogId: originalLogId,
                 reappliedAction: originalActionToReapply,
             }, userId);
            return;
        }

        if (action === 'rollback_action_failed' || action === 'rollback_rollback_action') {
            throw new Error(`Action type '${action}' (Log ID: ${logId}) cannot be rolled back.`);
        }

        let rollbackDetails: any = { originalLogId: logId, originalAction: action };
        const batch = writeBatch(db);

        console.log(`Attempting rollback for action: ${action}`, logEntry);

        const prepareDataForFirestore = (data: any): any => {
            if (!data) return null;
            const firestoreData = { ...data };
            Object.keys(firestoreData).forEach(key => {
                if (firestoreData[key] === undefined) {
                    firestoreData[key] = null; // Convert undefined to null
                }
                if (typeof firestoreData[key] === 'string') {
                    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
                    if (isoDateRegex.test(firestoreData[key])) {
                        try {
                            const parsedDate = new Date(firestoreData[key]);
                            if (isNaN(parsedDate.getTime())) { // Check if date is valid
                                console.warn(`Invalid date string encountered for key ${key}: ${firestoreData[key]}. Setting to null.`);
                                firestoreData[key] = null;
                            } else {
                                firestoreData[key] = Timestamp.fromDate(parsedDate);
                            }
                        } catch (e) {
                            console.warn(`Could not convert string ${firestoreData[key]} to Timestamp for key ${key}. Setting to null. Error:`, e);
                            firestoreData[key] = null;
                        }
                    }
                }
            });
            if (firestoreData.updatedAt && !(firestoreData.updatedAt instanceof Timestamp)) {
                 try {
                    const parsedUpdatedAt = new Date(firestoreData.updatedAt);
                    if (!isNaN(parsedUpdatedAt.getTime())) {
                        firestoreData.updatedAt = Timestamp.fromDate(parsedUpdatedAt);
                    } else {
                         firestoreData.updatedAt = Timestamp.now(); 
                    }
                 } catch {
                    firestoreData.updatedAt = Timestamp.now(); 
                 }
            } else if (!firestoreData.updatedAt && action !== 'delete_subject') { // Subjects don't have updatedAt
                 firestoreData.updatedAt = Timestamp.now();
            }
             if (firestoreData.createdAt && !(firestoreData.createdAt instanceof Timestamp) && action !== 'delete_subject') {
                 try {
                    const parsedCreatedAt = new Date(firestoreData.createdAt);
                     if (!isNaN(parsedCreatedAt.getTime())) {
                        firestoreData.createdAt = Timestamp.fromDate(parsedCreatedAt);
                    } else {
                         firestoreData.createdAt = Timestamp.now(); 
                    }
                 } catch {
                     firestoreData.createdAt = Timestamp.now(); 
                 }
            } else if (!firestoreData.createdAt && action !== 'delete_subject') {
                  firestoreData.createdAt = Timestamp.now();
            }
            return firestoreData;
        };

        if (action.startsWith('add_')) {
            const docId = after?.id ?? after?.subjectId ?? after?.eventId ?? (action.includes('general_announcement') ? after?.date : after?.assignmentId);
            if (!docId) throw new Error(`Cannot determine document ID to delete for rollback of add action (Log ID: ${logId}). After state: ${JSON.stringify(after)}`);
            const collectionPath = getCollectionPathForAction(classId, action);
            if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
            const docToDeleteRef = doc(db, collectionPath, docId);
            batch.delete(docToDeleteRef);
            rollbackDetails.deletedDocId = docId;
            rollbackDetails.deletedDocPath = docToDeleteRef.path;

        } else if (action.startsWith('update_') || action.startsWith('upsert_')) {
             const docId = before?.id ?? after?.id ?? (action.includes('settings') ? 'timetable' : (action.includes('general_announcement') ? before?.date ?? after?.date : after?.assignmentId ?? before?.assignmentId));
             if (!docId) throw new Error(`Cannot determine document ID to update for rollback of action ${action} (Log ID: ${logId}). Before: ${JSON.stringify(before)}, After: ${JSON.stringify(after)}`);
             const collectionPath = getCollectionPathForAction(classId, action);
             if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
             const docToUpdateRef = doc(db, collectionPath, docId);

            if (before === null || Object.keys(before).length === 0) {
                batch.delete(docToUpdateRef);
                rollbackDetails.deletedDocId = docId;
                rollbackDetails.deletedDocPath = docToUpdateRef.path;
            } else {
                 const dataToRestore = { ...before };
                 delete dataToRestore.id;
                 const firestoreReadyData = prepareDataForFirestore(dataToRestore);
                 batch.set(docToUpdateRef, firestoreReadyData);
                 rollbackDetails.restoredDocId = docId;
                 rollbackDetails.restoredDocPath = docToUpdateRef.path;
            }

        } else if (action.startsWith('delete_')) {
             const docId = before?.id ?? (action.includes('general_announcement') ? before?.date : before?.assignmentId);
             if (!docId || before === null) throw new Error(`Cannot determine document ID/data to restore for rollback of delete action (Log ID: ${logId}). Before state: ${JSON.stringify(before)}`);
             const collectionPath = getCollectionPathForAction(classId, action);
             if (!collectionPath) throw new Error(`Unsupported action type for rollback: ${action}`);
             const docToRestoreRef = doc(db, collectionPath, docId);

             let dataToRestore: Partial<Subject> | any = {};
             if (action === 'delete_subject') {
                if (!before.name) { // teacherName is optional
                    throw new Error(`Cannot restore subject (Log ID: ${logId}) without name in 'before' state.`);
                }
                dataToRestore = { name: before.name, teacherName: before.teacherName ?? null };
             } else {
                dataToRestore = { ...before };
                delete dataToRestore.id;
             }

             const firestoreReadyData = prepareDataForFirestore(dataToRestore);
            batch.set(docToRestoreRef, firestoreReadyData);
            rollbackDetails.restoredDocId = docId;
            rollbackDetails.restoredDocPath = docToRestoreRef.path;

        } else if (action === 'batch_update_fixed_timetable' || action === 'reset_fixed_timetable') {
            const beforeSlots: Array<{ id: string, subjectId: string | null, day?: string, period?: number }> = details.before || [];
            if (!Array.isArray(beforeSlots)) {
                 throw new Error(`Rollback for ${action} requires 'before' details to be an array of slot changes.`);
            }
            let restoredCount = 0;
            for(const beforeSlot of beforeSlots) {
                if (!beforeSlot || typeof beforeSlot.id !== 'string') continue;
                const slotRef = doc(db, `classes/${classId}/fixedTimetable`, beforeSlot.id);
                const dataToRestore: any = { subjectId: beforeSlot.subjectId ?? null, updatedAt: Timestamp.now() };
                if(beforeSlot.day) dataToRestore.day = beforeSlot.day;
                if(beforeSlot.period) dataToRestore.period = beforeSlot.period;

                batch.set(slotRef, dataToRestore, {merge: true}); // Use set with merge or update
                restoredCount++;
            }
             rollbackDetails.restoredSlotsCount = restoredCount;

        } else if (action === 'batch_upsert_announcements') {
            const beforeStates = details.before || {};
            let restoredCount = 0;
            for (const docId in beforeStates) {
                if (Object.prototype.hasOwnProperty.call(beforeStates, docId)) {
                    const beforeSlot = beforeStates[docId];
                    const slotRef = doc(db, `classes/${classId}/dailyAnnouncements`, docId);
                    if (beforeSlot === null) {
                        batch.delete(slotRef); // If it didn't exist before, delete it
                    } else {
                        const dataToRestore = { ...beforeSlot };
                        delete dataToRestore.id;
                        batch.set(slotRef, prepareDataForFirestore(dataToRestore));
                    }
                    restoredCount++;
                }
            }
            rollbackDetails.restoredSlotsCount = restoredCount;
        } else if (action === 'apply_fixed_timetable_future' || action === 'reset_future_daily_announcements') {
             throw new Error(`Action '${action}' affects future dates and cannot be automatically rolled back.`);
        }
         else {
            throw new Error(`Unsupported action type for automatic rollback: ${action}`);
        }

        await batch.commit();
        console.log(`Rollback successful for Log ID: ${logId}, Action: ${action}`);
        await logAction(classId, 'rollback_action', prepareStateForLog(rollbackDetails), userId);

    } catch (error) {
        console.error(`Rollback failed for Log ID: ${logId}:`, error);
        await logAction(classId, 'rollback_action_failed', prepareStateForLog({
             originalLogId: logId,
             originalAction: logEntry?.action,
             error: String(error),
        }), userId);
        throw error;
    }
};

/**
 * Helper function to perform an action based on log data, used for re-applying actions
 * during a rollback of a rollback.
 */
async function performActionBasedOnLog(classId: string, action: string, targetState: any, previousState: any, userId: string, context: string): Promise<void> {
    const collectionPath = getCollectionPathForAction(classId, action);
    if (!collectionPath) throw new Error(`Unsupported action type for re-apply: ${action}`);

    const batch = writeBatch(db);

    const prepareDataForFirestore = (data: any): any => {
        if (!data) return null;
        const firestoreData = { ...data };
        Object.keys(firestoreData).forEach(key => {
            if (firestoreData[key] === undefined) {
                firestoreData[key] = null; 
            }
            if (typeof firestoreData[key] === 'string') {
                const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
                if (isoDateRegex.test(firestoreData[key])) {
                    try {
                       const parsedDate = new Date(firestoreData[key]);
                       if (isNaN(parsedDate.getTime())) {
                           console.warn(`Invalid date string for re-apply key ${key}: ${firestoreData[key]}. Setting to null.`);
                           firestoreData[key] = null;
                       } else {
                           firestoreData[key] = Timestamp.fromDate(parsedDate);
                       }
                    } catch (e) {
                         console.warn(`Could not convert string ${firestoreData[key]} to Timestamp for re-apply key ${key}. Setting to null. Error:`, e);
                         firestoreData[key] = null;
                    }
                }
            }
        });
        if (firestoreData.updatedAt && !(firestoreData.updatedAt instanceof Timestamp)) {
            try {
                const parsedUpdatedAt = new Date(firestoreData.updatedAt);
                if (!isNaN(parsedUpdatedAt.getTime())) {
                    firestoreData.updatedAt = Timestamp.fromDate(parsedUpdatedAt);
                } else {
                    firestoreData.updatedAt = Timestamp.now(); 
                }
            } catch {
                firestoreData.updatedAt = Timestamp.now(); 
            }
        } else if (!firestoreData.updatedAt && action !== 'delete_subject') {
            firestoreData.updatedAt = Timestamp.now();
        }
         if (firestoreData.createdAt && !(firestoreData.createdAt instanceof Timestamp) && action !== 'delete_subject') {
             try {
                const parsedCreatedAt = new Date(firestoreData.createdAt);
                 if (!isNaN(parsedCreatedAt.getTime())) {
                    firestoreData.createdAt = Timestamp.fromDate(parsedCreatedAt);
                } else {
                     firestoreData.createdAt = Timestamp.now(); 
                 }
             } catch {
                 firestoreData.createdAt = Timestamp.now(); 
             }
        } else if (!firestoreData.createdAt && action !== 'delete_subject') {
              firestoreData.createdAt = Timestamp.now();
        }
        return firestoreData;
    };

    if (action.startsWith('add_')) {
        const docId = targetState?.id ?? targetState?.date ?? targetState?.subjectId ?? targetState?.assignmentId;
        if (!docId || !targetState) throw new Error(`Cannot determine document ID/data to re-add for action ${action} (${context})`);
        const docRef = doc(db, collectionPath, docId);
        const dataToRestore = { ...targetState };
        delete dataToRestore.id; 
        batch.set(docRef, prepareDataForFirestore(dataToRestore));

    } else if (action.startsWith('update_') || action.startsWith('upsert_')) {
         const docId = targetState?.id ?? previousState?.id ?? (action.includes('settings') ? 'timetable' : (action.includes('general_announcement') ? targetState?.date ?? previousState?.date : targetState?.assignmentId ?? previousState?.assignmentId));
         if (!docId) throw new Error(`Cannot determine document ID to re-update for action ${action} (${context})`);
         const docRef = doc(db, collectionPath, docId);
        if (targetState === null || Object.keys(targetState).length === 0) { 
            batch.delete(docRef);
        } else {
             const dataToRestore = { ...targetState };
             delete dataToRestore.id;
             batch.set(docRef, prepareDataForFirestore(dataToRestore));
        }

    } else if (action.startsWith('delete_')) {
         const docId = previousState?.id ?? (action.includes('general_announcement') ? previousState?.date : previousState?.assignmentId);
         if (!docId) throw new Error(`Cannot determine document ID to re-delete for action ${action} (${context})`);
         const docRef = doc(db, collectionPath, docId);
         batch.delete(docRef);

    } else if (action === 'batch_update_fixed_timetable' || action === 'reset_fixed_timetable') {
         const targetSlots: Array<{ id: string, subjectId: string | null, day?: string, period?: number }> = (action === 'reset_fixed_timetable') ? (previousState || []).map((s: any) => ({ ...s, subjectId: null })) : (targetState || []);
         if (!Array.isArray(targetSlots)) throw new Error(`Re-apply for ${action} requires target state to be an array.`);
         targetSlots.forEach(slot => {
             if (!slot || typeof slot.id !== 'string') return;
             const slotRef = doc(db, `classes/${classId}/fixedTimetable`, slot.id);
             const dataToRestore: any = { subjectId: slot.subjectId ?? null, updatedAt: Timestamp.now() };
             if(slot.day) dataToRestore.day = slot.day;
             if(slot.period) dataToRestore.period = slot.period;
             batch.set(slotRef, dataToRestore, {merge: true});
         });
    } else if (action === 'batch_upsert_announcements') {
        const targetStates = targetState || {};
        if (typeof targetStates !== 'object' || targetStates === null) {
            throw new Error(`Re-apply for ${action} requires target state to be an object/map.`);
        }
        for (const docId in targetStates) {
            if (Object.prototype.hasOwnProperty.call(targetStates, docId)) {
                const targetSlot = targetStates[docId];
                const slotRef = doc(db, `classes/${classId}/dailyAnnouncements`, docId);
                if (targetSlot === null) {
                    batch.delete(slotRef); // If the target state is null, it means deletion
                } else {
                    const dataToRestore = { ...targetSlot };
                    delete dataToRestore.id;
                    batch.set(slotRef, prepareDataForFirestore(dataToRestore));
                }
            }
        }
    } else {
        throw new Error(`Unsupported action type for re-apply: ${action} (${context})`);
    }

    await batch.commit();
}


function getCollectionPathForAction(classId: string, action: string): string | null {
    if (!classId) return null;
    const basePath = `classes/${classId}`;

    if (action.includes('subject') && !action.includes('override')) {
        return `${basePath}/subjects`;
    }
    if (action.includes('event')) {
        return `${basePath}/events`;
    }
    if (action === 'batch_update_fixed_timetable' || action === 'reset_fixed_timetable' || action === 'update_fixed_slot') {
        return `${basePath}/fixedTimetable`;
    }
    if (action.includes('announcement') && !action.includes('general_announcement') && !action.includes('future_daily_announcements')) {
        return `${basePath}/dailyAnnouncements`;
    }
     if (action.includes('general_announcement')) {
        return `${basePath}/generalAnnouncements`;
    }
    if (action.includes('settings')) {
         return `${basePath}/settings`;
    }
    if (action.includes('inquiry')) {
        return `${basePath}/inquiries`;
    }
    if (action.includes('assignment')) {
        return `${basePath}/assignments`;
    }
    if (action.startsWith('dev_')) {
        return `users`;
    }
    console.warn(`Could not determine collection path for action: ${action}`);
    return null;
}
