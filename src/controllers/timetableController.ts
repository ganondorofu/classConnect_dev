

import { db } from '@/config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  writeBatch,
  deleteDoc,
  orderBy,
  limit,
  FirestoreError,
  runTransaction,
  addDoc, 
  updateDoc,
} from 'firebase/firestore';
import type {
  FixedTimeSlot,
  TimetableSettings,
  DayOfWeek,
  SchoolEvent,
  StudentPermissions,
} from '@/models/timetable';
import type { DailyAnnouncement, DailyGeneralAnnouncement } from '@/models/announcement';
import type { Assignment } from '@/models/assignment'; 
import { DEFAULT_TIMETABLE_SETTINGS, DayOfWeek as DayOfWeekEnum, getDayOfWeekName, AllDays, DisplayedWeekDaysOrder, dayCodeToDayOfWeekEnum } from '@/models/timetable';
import { format, addDays, startOfDay, getDay, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';
import { logAction } from '@/services/logService';
import { prepareStateForLog } from '@/lib/logUtils'; // Import from new location
import { queryFnGetSubjects as getSubjectsFromSubjectController } from '@/controllers/subjectController';
import { summarizeAnnouncement } from '@/ai/flows/summarize-announcement-flow';


const FUTURE_DAYS_TO_APPLY = 60; 

const getSettingsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'settings');
const getFixedTimetableCollectionRef = (classId: string) => collection(db, 'classes', classId, 'fixedTimetable');
const getDailyAnnouncementsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'dailyAnnouncements');
const getGeneralAnnouncementsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'generalAnnouncements');
const getEventsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'events');
const getAssignmentsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'assignments');

const parseFirestoreTimestamp = (timestampField: any): Date | undefined => {
  if (!timestampField) return undefined;
  if (timestampField instanceof Timestamp) return timestampField.toDate();
  if (typeof timestampField.toDate === 'function') { 
    return timestampField.toDate();
  }
  if (timestampField instanceof Date) { 
    return timestampField;
  }
  if (typeof timestampField === 'string') { 
    const date = parseISO(timestampField);
    return isValid(date) ? date : undefined;
  }
  if (typeof timestampField === 'object' && timestampField.seconds !== undefined && timestampField.nanoseconds !== undefined) {
    try {
      return new Timestamp(timestampField.seconds, timestampField.nanoseconds).toDate();
    } catch (e) {
      console.warn("Failed to parse plain object as Timestamp:", timestampField, e);
      return undefined;
    }
  }
  console.warn("Unparseable timestamp field encountered:", timestampField);
  return undefined;
};

export const getTimetableSettings = async (classId: string): Promise<TimetableSettings> => {
  const docRef = doc(getSettingsCollectionRef(classId), 'timetable');
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const activeDays = data.activeDays && Array.isArray(data.activeDays) && data.activeDays.length > 0 ? data.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      return {
        numberOfPeriods: data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
        activeDays: activeDays,
        studentPermissions: { ...DEFAULT_TIMETABLE_SETTINGS.studentPermissions, ...(data.studentPermissions ?? {}) }
      } as TimetableSettings;
    } else {
      await setDoc(docRef, DEFAULT_TIMETABLE_SETTINGS);
      await logAction(classId, 'initialize_settings', { before: null, after: prepareStateForLog(DEFAULT_TIMETABLE_SETTINGS) }, 'system_init_settings');
      return DEFAULT_TIMETABLE_SETTINGS;
    }
  } catch (error) {
    console.error("Error fetching timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') return DEFAULT_TIMETABLE_SETTINGS;
    throw error;
  }
};

export const updateTimetableSettings = async (classId: string, settingsUpdates: Partial<TimetableSettings>, userId: string = 'system_update_settings'): Promise<void> => {
  let currentSettings: TimetableSettings;
  try {
    currentSettings = await getTimetableSettings(classId);
  } catch (fetchError) {
    console.error("Critical error fetching current settings before update:", fetchError);
    throw fetchError;
  }

  const newSettingsData: TimetableSettings = {
    numberOfPeriods: settingsUpdates.numberOfPeriods ?? currentSettings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
    activeDays: settingsUpdates.activeDays ?? currentSettings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays,
    studentPermissions: settingsUpdates.studentPermissions ? { ...currentSettings.studentPermissions, ...settingsUpdates.studentPermissions } : currentSettings.studentPermissions,
  };
  const docRef = doc(getSettingsCollectionRef(classId), 'timetable');

  try {
    let fixedTimetableNeedsUpdate = false;
    await runTransaction(db, async (transaction) => {
      const settingsDoc = await transaction.get(docRef);
      const currentSettingsInTx = settingsDoc.exists() ? (settingsDoc.data() as TimetableSettings) : DEFAULT_TIMETABLE_SETTINGS;
      const currentActiveDaysInTx = currentSettingsInTx.activeDays && Array.isArray(currentSettingsInTx.activeDays) && currentSettingsInTx.activeDays.length > 0 ? currentSettingsInTx.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      const newActiveDays = newSettingsData.activeDays && Array.isArray(newSettingsData.activeDays) && newSettingsData.activeDays.length > 0 ? newSettingsData.activeDays : DEFAULT_TIMETABLE_SETTINGS.activeDays;
      transaction.set(docRef, newSettingsData);

      const currentPeriods = currentSettingsInTx.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
      const newPeriodsValue = settingsUpdates.numberOfPeriods;

      if (newPeriodsValue !== undefined && newPeriodsValue !== currentPeriods) {
        fixedTimetableNeedsUpdate = true;
        const daysToUpdate = newActiveDays;
        if (newPeriodsValue > currentPeriods) {
          for (let day of daysToUpdate) {
            for (let period = currentPeriods + 1; period <= newPeriodsValue; period++) {
              const slotId = `${day}_${period}`;
              transaction.set(doc(getFixedTimetableCollectionRef(classId), slotId), { id: slotId, day, period, subjectId: null });
            }
          }
        } else {
          const q = query(getFixedTimetableCollectionRef(classId), where('period', '>', newPeriodsValue), where('day', 'in', daysToUpdate));
          const snapshot = await getDocs(q); 
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      } else if (settingsUpdates.activeDays && JSON.stringify(newActiveDays.sort()) !== JSON.stringify(currentActiveDaysInTx.sort())) {
        fixedTimetableNeedsUpdate = true;
        const addedDays = newActiveDays.filter(d => !currentActiveDaysInTx.includes(d));
        const removedDays = currentActiveDaysInTx.filter(d => !newActiveDays.includes(d));
        const periodsToManage = newSettingsData.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods;
        for (const day of addedDays) for (let period = 1; period <= periodsToManage; period++) transaction.set(doc(getFixedTimetableCollectionRef(classId), `${day}_${period}`), { id: `${day}_${period}`, day, period, subjectId: null });
        if (removedDays.length > 0) {
          const q = query(getFixedTimetableCollectionRef(classId), where('day', 'in', removedDays));
          const snapshot = await getDocs(q); 
          snapshot.forEach((docToDelete) => transaction.delete(docToDelete.ref));
        }
      }
    });

    await logAction(classId, 'update_settings', { before: prepareStateForLog(currentSettings), after: prepareStateForLog(newSettingsData) }, userId);
    if (fixedTimetableNeedsUpdate) await applyFixedTimetableForFuture(classId, userId);
  } catch (error) {
    console.error("Error updating timetable settings:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため設定を更新できませんでした。");
    throw error;
  }
};

export const onTimetableSettingsUpdate = (
  classId: string,
  callback: (settings: TimetableSettings) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const docRef = doc(getSettingsCollectionRef(classId), 'timetable');
  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      let newSettings: TimetableSettings;
      if (docSnap.exists()) {
        const data = docSnap.data();
        const activeDays =
          data.activeDays &&
          Array.isArray(data.activeDays) &&
          data.activeDays.length > 0
            ? data.activeDays
            : DEFAULT_TIMETABLE_SETTINGS.activeDays;
        newSettings = {
          numberOfPeriods:
            data.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods,
          activeDays,
          studentPermissions: { ...DEFAULT_TIMETABLE_SETTINGS.studentPermissions, ...(data.studentPermissions ?? {}) }
        };
      } else {
        newSettings = DEFAULT_TIMETABLE_SETTINGS;
      }
      callback(newSettings);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('Snapshot error on settings:', error);
    }
  );
  return unsubscribe;
};

export const getFixedTimetable = async (classId: string): Promise<FixedTimeSlot[]> => {
  try {
    const snapshot = await getDocs(getFixedTimetableCollectionRef(classId));
    let slots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), subjectId: doc.data().subjectId === undefined ? null : doc.data().subjectId } as FixedTimeSlot));
    slots.sort((a, b) => AllDays.indexOf(a.day) - AllDays.indexOf(b.day) || a.period - b.period);
    return slots;
  } catch (error) {
    console.error("Error fetching fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore クエリに必要なインデックスがありません。");
    throw error;
  }
};

export const batchUpdateFixedTimetable = async (classId: string, slots: FixedTimeSlot[], userId: string = 'system_batch_update_tt'): Promise<void> => {
  const batch = writeBatch(db);
  let changesMade = false;
  const existingSlotsData = await getFixedTimetable(classId);
  const existingSlotsMap: Map<string, FixedTimeSlot> = new Map(existingSlotsData.map(slot => [slot.id, slot]))

  const beforeStates: Array<{ id: string, subjectId: string | null }> = [];
  const afterStates: Array<{ id: string, subjectId: string | null }> = [];

  slots.forEach(slot => {
    if (!slot.id || !slot.day || slot.period === undefined) return;
    const existingSlot = existingSlotsMap.get(slot.id);
    const newSubjectId = slot.subjectId === undefined ? null : slot.subjectId;
    if (!existingSlot || (existingSlot.subjectId ?? null) !== newSubjectId) {
      batch.set(doc(getFixedTimetableCollectionRef(classId), slot.id), { ...slot, subjectId: newSubjectId, updatedAt: Timestamp.now() });
      changesMade = true;
      beforeStates.push({ id: slot.id, subjectId: existingSlot?.subjectId ?? null });
      afterStates.push({ id: slot.id, subjectId: newSubjectId });
    }
  });

  if (!changesMade) return;
  try {
    await batch.commit();
    await logAction(classId, 'batch_update_fixed_timetable', { before: prepareStateForLog(beforeStates), after: prepareStateForLog(afterStates), count: afterStates.length }, userId);
    await applyFixedTimetableForFuture(classId, userId);
  } catch (error) {
    console.error("Error batch updating fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため固定時間割を一括更新できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("固定時間割データに無効な値が含まれていました。");
    throw error;
  }
};

export const resetFixedTimetable = async (classId: string, userId: string = 'system_reset_tt'): Promise<void> => {
  const batch = writeBatch(db);
  let resetCount = 0;
  const beforeStates: Array<{ id: string, subjectId: string | null }> = [];
  try {
    const snapshot = await getDocs(getFixedTimetableCollectionRef(classId));
    snapshot.forEach((docSnap) => {
      const slot = docSnap.data() as FixedTimeSlot;
      if ((slot.subjectId ?? null) !== null) {
        beforeStates.push({ id: docSnap.id, subjectId: slot.subjectId });
        batch.update(docSnap.ref, { subjectId: null, updatedAt: Timestamp.now() });
        resetCount++;
      }
    });
    if (resetCount === 0) return;
    await batch.commit();
    await logAction(classId, 'reset_fixed_timetable', { before: prepareStateForLog(beforeStates), after: null, count: resetCount }, userId);
    await applyFixedTimetableForFuture(classId, userId);
  } catch (error) {
    console.error("Error resetting fixed timetable:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため固定時間割を初期化できませんでした。");
    throw error;
  }
};

export const onFixedTimetableUpdate = (classId: string, callback: (timetable: FixedTimeSlot[]) => void, onError?: (error: Error) => void): Unsubscribe => {
  const unsubscribe = onSnapshot(query(getFixedTimetableCollectionRef(classId)), (snapshot) => {
    let timetable = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), subjectId: doc.data().subjectId === undefined ? null : doc.data().subjectId } as FixedTimeSlot));
    timetable.sort((a, b) => AllDays.indexOf(a.day) - AllDays.indexOf(b.day) || a.period - b.period);
    callback(timetable);
  }, (error) => {
    console.error("Snapshot error on fixed timetable:", error);
    if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error("Firestore 固定時間割のリアルタイム更新に必要なインデックスがありません。"));
    else onError?.(error);
  });
  return unsubscribe;
};

export const getDailyAnnouncements = async (classId: string, date: string): Promise<DailyAnnouncement[]> => {
  try {
    const q = query(getDailyAnnouncementsCollectionRef(classId), where('date', '==', date));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        subjectIdOverride: data.subjectIdOverride === undefined ? null : data.subjectIdOverride,
        showOnCalendar: data.showOnCalendar === undefined ? false : data.showOnCalendar,
        updatedAt: parseFirestoreTimestamp(data.updatedAt) ?? new Date(),
        itemType: 'announcement',
        isManuallyCleared: data.isManuallyCleared === undefined ? false : data.isManuallyCleared,
      } as DailyAnnouncement;
    });
  } catch (error) {
    console.error(`Error fetching daily announcements for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error(`Firestore 連絡クエリ(日付: ${date})に必要なインデックス(date)がありません。`);
    throw error;
  }
};

export const upsertDailyAnnouncement = async (
  classId: string,
  announcementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'>,
  userId: string = 'system_upsert_announcement'
): Promise<void> => {
  const { date, period } = announcementData;
  const docId = `${date}_${period}`;
  const docRef = doc(getDailyAnnouncementsCollectionRef(classId), docId);
  
  const textToPersist = announcementData.text?.trim() ?? '';
  const subjectIdOverrideToPersist = announcementData.subjectIdOverride === undefined ? null : announcementData.subjectIdOverride;
  const showOnCalendarToPersist = announcementData.showOnCalendar === undefined ? false : announcementData.showOnCalendar;
  const isManuallyClearedToPersist = announcementData.isManuallyCleared === true;


  let beforeState: DailyAnnouncement | null = null;
  const oldDataSnap = await getDoc(docRef);
  if (oldDataSnap.exists()) {
    const oldData = oldDataSnap.data();
    beforeState = {
      id: oldDataSnap.id,
      ...oldData,
      date: oldData.date,
      period: oldData.period,
      subjectIdOverride: oldData.subjectIdOverride === undefined ? null : oldData.subjectIdOverride,
      text: oldData.text ?? '',
      showOnCalendar: oldData.showOnCalendar === undefined ? false : oldData.showOnCalendar,
      updatedAt: parseFirestoreTimestamp(oldData.updatedAt) ?? new Date(),
      itemType: 'announcement',
      isManuallyCleared: oldData.isManuallyCleared === undefined ? false : oldData.isManuallyCleared,
    } as DailyAnnouncement;
  }

  let dataToSet: Partial<DailyAnnouncement>;
  let actionType: string;

  if (isManuallyClearedToPersist) {
      dataToSet = {
          date,
          period,
          text: '', 
          subjectIdOverride: subjectIdOverrideToPersist, 
          showOnCalendar: false,
          isManuallyCleared: true, 
          itemType: 'announcement',
          updatedAt: Timestamp.now(),
      };
      actionType = 'clear_announcement_slot';
  } else {
      dataToSet = { 
          date, 
          period, 
          subjectIdOverride: subjectIdOverrideToPersist, 
          text: textToPersist, 
          showOnCalendar: showOnCalendarToPersist, 
          itemType: 'announcement',
          isManuallyCleared: false, 
          updatedAt: Timestamp.now(),
      };
      actionType = 'upsert_announcement';
  }
  
  const afterState: DailyAnnouncement = { ...dataToSet, id: docId, updatedAt: (dataToSet.updatedAt as Timestamp).toDate() } as DailyAnnouncement;

  const hasChanged = !beforeState ||
                     beforeState.text !== dataToSet.text ||
                     (beforeState.subjectIdOverride ?? null) !== (dataToSet.subjectIdOverride ?? null) ||
                     (beforeState.showOnCalendar ?? false) !== (dataToSet.showOnCalendar ?? false) ||
                     (beforeState.isManuallyCleared ?? false) !== (dataToSet.isManuallyCleared ?? false);

  if (hasChanged) {
    try {
      await setDoc(docRef, dataToSet); 
      await logAction(classId, 'upsert_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterState) }, userId);
    } catch (error) {
      console.error("Error upserting daily announcement:", error);
      if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため連絡を保存できませんでした。");
      if ((error as FirestoreError).code === 'invalid-argument') throw new Error("保存データに無効な値が含まれていました。");
      throw error;
    }
  }
};

export const batchUpsertAnnouncements = async (
  classId: string,
  announcementsData: Array<Omit<DailyAnnouncement, 'id' | 'updatedAt'>>,
  userId: string = 'system_batch_upsert'
): Promise<void> => {
  const batch = writeBatch(db);
  const beforeStates: Record<string, DailyAnnouncement | null> = {};
  const afterStates: Record<string, DailyAnnouncement> = {};

  for (const announcementData of announcementsData) {
    const { date, period } = announcementData;
    const docId = `${date}_${period}`;
    const docRef = doc(getDailyAnnouncementsCollectionRef(classId), docId);
    
    // Fetch current state for logging
    const oldSnap = await getDoc(docRef);
    beforeStates[docId] = oldSnap.exists() ? { id: docId, ...oldSnap.data() } as DailyAnnouncement : null;

    const dataToSet: Partial<DailyAnnouncement> = {
      ...announcementData,
      updatedAt: Timestamp.now(),
    };
    batch.set(docRef, dataToSet, { merge: true });
    afterStates[docId] = { ...dataToSet, id: docId, updatedAt: new Date() } as DailyAnnouncement;
  }
  
  try {
    await batch.commit();
    await logAction(classId, 'batch_upsert_announcements', {
      count: announcementsData.length,
      before: prepareStateForLog(beforeStates),
      after: prepareStateForLog(afterStates)
    }, userId);
  } catch (error) {
    console.error("Error in batch upsert announcements:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため一括更新に失敗しました。");
    }
    throw error;
  }
};


export const onDailyAnnouncementsUpdate = (classId: string, date: string, callback: (announcements: DailyAnnouncement[]) => void, onError?: (error: Error) => void): Unsubscribe => {
  const q = query(getDailyAnnouncementsCollectionRef(classId), where('date', '==', date));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            subjectIdOverride: data.subjectIdOverride === undefined ? null : data.subjectIdOverride,
            showOnCalendar: data.showOnCalendar === undefined ? false : data.showOnCalendar,
            updatedAt: parseFirestoreTimestamp(data.updatedAt) ?? new Date(),
            itemType: 'announcement',
            isManuallyCleared: data.isManuallyCleared === undefined ? false : data.isManuallyCleared,
        } as DailyAnnouncement;
    }));
  }, (error) => {
    console.error(`Snapshot error on daily announcements for ${date}:`, error);
    if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error(`Firestore 連絡のリアルタイム更新に必要なインデックス(date)がありません(日付:${date})。`));
    else onError?.(error);
  });
  return unsubscribe;
};

export const getDailyGeneralAnnouncement = async (classId: string, date: string): Promise<DailyGeneralAnnouncement | null> => {
  const docRef = doc(getGeneralAnnouncementsCollectionRef(classId), date);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return { 
        id: docSnap.id, 
        date: data.date, 
        content: data.content ?? '', 
        updatedAt: parseFirestoreTimestamp(data.updatedAt) ?? new Date(), 
        itemType: 'general',
        aiSummary: data.aiSummary ?? null,
        aiSummaryLastGeneratedAt: parseFirestoreTimestamp(data.aiSummaryLastGeneratedAt) ?? null,
      } as DailyGeneralAnnouncement;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching general announcement for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') return null;
    throw error;
  }
};

export const upsertDailyGeneralAnnouncement = async (classId: string, date: string, content: string, userId: string = 'system_upsert_general_annc'): Promise<void> => {
  const docRef = doc(getGeneralAnnouncementsCollectionRef(classId), date);
  const trimmedContent = content.trim();
  let beforeState: DailyGeneralAnnouncement | null = null;

  try {
    const oldSnap = await getDoc(docRef);
    if (oldSnap.exists()) {
        const oldData = oldSnap.data();
        beforeState = { 
            id: date, 
            ...oldData, 
            updatedAt: parseFirestoreTimestamp(oldData.updatedAt) ?? new Date(), 
            itemType: 'general',
            aiSummary: oldData.aiSummary ?? null,
            aiSummaryLastGeneratedAt: parseFirestoreTimestamp(oldData.aiSummaryLastGeneratedAt) ?? null,
        } as DailyGeneralAnnouncement;
    }

    const dataToSet: Partial<DailyGeneralAnnouncement> = {
        date,
        content: trimmedContent,
        itemType: 'general',
        updatedAt: Timestamp.now()
    };
    
    let afterStateContent = { ...dataToSet, id: date, aiSummary: beforeState?.aiSummary, aiSummaryLastGeneratedAt: beforeState?.aiSummaryLastGeneratedAt, updatedAt: new Date() };


    if (!trimmedContent) { 
      if (beforeState) { 
        dataToSet.aiSummary = null; 
        dataToSet.aiSummaryLastGeneratedAt = null;
        afterStateContent.aiSummary = null;
        afterStateContent.aiSummaryLastGeneratedAt = null;

        await setDoc(docRef, dataToSet, { merge: true }); 
        await logAction(classId, 'delete_general_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterStateContent) }, userId);
      }
      return;
    }
    
    if (beforeState && beforeState.content !== trimmedContent) { 
        dataToSet.aiSummary = null;
        dataToSet.aiSummaryLastGeneratedAt = null;
        afterStateContent.aiSummary = null;
        afterStateContent.aiSummaryLastGeneratedAt = null;
    }
    
    if (!beforeState || beforeState.content !== trimmedContent || (beforeState.aiSummary && !dataToSet.aiSummary )) { 
        await setDoc(docRef, dataToSet, { merge: true });
        await logAction(classId, 'upsert_general_announcement', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterStateContent) }, userId);
    }

  } catch (error) {
    console.error(`Error upserting general announcement for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのためお知らせを保存できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("保存データに無効な値が含まれていました。");
    throw error;
  }
};


export const onDailyGeneralAnnouncementUpdate = (classId: string, date: string, callback: (announcement: DailyGeneralAnnouncement | null) => void, onError?: (error: Error) => void): Unsubscribe => {
  const docRef = doc(getGeneralAnnouncementsCollectionRef(classId), date);
  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      callback({ 
        id: docSnap.id, 
        date: data.date, 
        content: data.content ?? '', 
        updatedAt: parseFirestoreTimestamp(data.updatedAt) ?? new Date(), 
        itemType: 'general',
        aiSummary: data.aiSummary ?? null,
        aiSummaryLastGeneratedAt: parseFirestoreTimestamp(data.aiSummaryLastGeneratedAt) ?? null,
      } as DailyGeneralAnnouncement);
    } else {
      callback(null);
    }
  }, (error) => { if (onError) onError(error); else console.error(`Snapshot error on general announcement for ${date}:`, error); });
  return unsubscribe;
};

export const generateAndStoreAnnouncementSummary = async (classId: string, date: string, userId: string = 'system_ai_summary'): Promise<string | null> => {
  const announcementRef = doc(getGeneralAnnouncementsCollectionRef(classId), date);
  try {
    if (!process.env.GOOGLE_GENAI_API_KEY) {
        throw new Error("AI機能は設定されていません。管理者に連絡してください。");
    }
    const announcementSnap = await getDoc(announcementRef);
    if (!announcementSnap.exists() || !announcementSnap.data()?.content) {
      if (announcementSnap.exists() && announcementSnap.data()?.aiSummary) {
        await updateDoc(announcementRef, { aiSummary: null, aiSummaryLastGeneratedAt: null });
        await logAction(classId, 'clear_ai_summary_no_content', { date }, userId);
      }
      return null;
    }

    const announcementContent = announcementSnap.data()!.content;    
    const summaryResult = await summarizeAnnouncement({ announcementText: announcementContent });

    if (summaryResult && summaryResult.summary) {
      await updateDoc(announcementRef, {
        aiSummary: summaryResult.summary,
        aiSummaryLastGeneratedAt: Timestamp.now(),
      });
      await logAction(classId, 'generate_ai_summary', { date, summaryLength: summaryResult.summary.length }, userId);
      return summaryResult.summary;
    } else {
      await updateDoc(announcementRef, { aiSummary: null, aiSummaryLastGeneratedAt: null });
      await logAction(classId, 'clear_ai_summary_empty_result', { date }, userId);
      throw new Error('AI summary generation returned no content.');
    }
  } catch (error: any) {
    console.error(`Full error during generateAndStoreAnnouncementSummary for ${date}:`, error);
    try {
        const announcementSnap = await getDoc(announcementRef);
        if (announcementSnap.exists()) {
             await updateDoc(announcementRef, { aiSummary: null, aiSummaryLastGeneratedAt: null });
             await logAction(classId, 'clear_ai_summary_on_error', { date, error: String(error.message || error) }, userId);
        }
    } catch (clearError: any) {
        console.error(`Failed to clear AI summary on error for ${date}:`, clearError);
    }
    if (error.message && error.message.includes("AI機能は設定されていません")) {
        throw error;
    }
    throw new Error(`AI要約の生成または保存中にエラーが発生しました: ${error.message || '不明なエラー'}`);
  }
};

export const deleteAiSummary = async (classId: string, date: string, userId: string): Promise<void> => {
  const announcementRef = doc(getGeneralAnnouncementsCollectionRef(classId), date);
  try {
    const announcementSnap = await getDoc(announcementRef);
    if (!announcementSnap.exists() || !announcementSnap.data()?.aiSummary) {
      console.log(`No AI summary to delete for announcement on ${date}.`);
      return;
    }

    const oldSummary = announcementSnap.data()!.aiSummary;

    await updateDoc(announcementRef, {
      aiSummary: null,
      aiSummaryLastGeneratedAt: null,
    });

    await logAction(classId, 'delete_ai_summary', prepareStateForLog({
      date,
      deletedSummaryPreview: oldSummary ? oldSummary.substring(0, 50) + '...' : 'N/A',
    }), userId);

  } catch (error) {
    console.error(`Error deleting AI summary for ${date}:`, error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのためAI要約を削除できませんでした。");
    }
    throw error;
  }
};


export const getSchoolEvents = async (classId: string): Promise<SchoolEvent[]> => {
  try {
    const q = query(getEventsCollectionRef(classId), orderBy('startDate'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return { 
            id: docSnap.id, 
            title: data.title,
            startDate: data.startDate,
            endDate: data.endDate,
            description: data.description,
            itemType: 'event', 
            createdAt: parseFirestoreTimestamp(data.createdAt),
            updatedAt: parseFirestoreTimestamp(data.updatedAt),
        } as SchoolEvent;
    });
  } catch (error) {
    console.error("Error fetching school events:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません。");
    throw error;
  }
};

export const addSchoolEvent = async (classId: string, eventData: Omit<SchoolEvent, 'id' | 'createdAt' | 'updatedAt'> & { startDate: string; endDate?: string }, userId: string = 'system_add_event'): Promise<string> => {
  const dataToSet = {
    title: eventData.title || '',
    startDate: eventData.startDate, 
    endDate: eventData.endDate || eventData.startDate, 
    description: eventData.description || '',
    itemType: 'event' as const, 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now(),
  };
  try {
    const newDocRef = await addDoc(getEventsCollectionRef(classId), dataToSet);
    const afterState = { id: newDocRef.id, ...dataToSet, createdAt: dataToSet.createdAt.toDate(), updatedAt: dataToSet.updatedAt.toDate() }; 
    await logAction(classId, 'add_event', { before: null, after: prepareStateForLog(afterState) }, userId);
    return newDocRef.id;
  } catch (error) {
    console.error("Error adding school event:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため行事を追加できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("行事データに無効な値が含まれていました。");
    throw error;
  }
};


export const updateSchoolEvent = async (classId: string, eventData: SchoolEvent, userId: string = 'system_update_event'): Promise<void> => {
  if (!eventData.id) throw new Error("Event ID is required for updates.");
  const docRef = doc(getEventsCollectionRef(classId), eventData.id);
  const dataToUpdate: Partial<SchoolEvent> = { 
    title: eventData.title || '', 
    startDate: eventData.startDate, 
    endDate: eventData.endDate || eventData.startDate, 
    description: eventData.description || '',
    itemType: 'event' as const, 
    updatedAt: Timestamp.now() 
  };

  let beforeState: SchoolEvent | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
        const oldData = oldDataSnap.data();
        beforeState = { 
            id: eventData.id, 
            ...oldData,
            itemType: 'event' as const, 
            createdAt: parseFirestoreTimestamp(oldData.createdAt), 
            updatedAt: parseFirestoreTimestamp(oldData.updatedAt),
        } as SchoolEvent;
    }
    
    const cleanDataToUpdate = { ...dataToUpdate };
    delete (cleanDataToUpdate as any).id; 
    
    await setDoc(docRef, cleanDataToUpdate, { merge: true });
    
    const afterSnap = await getDoc(docRef);
    let afterState: SchoolEvent | null = null;
    if (afterSnap.exists()) {
        const newData = afterSnap.data();
        afterState = { 
            id: afterSnap.id, 
            ...newData, 
            itemType: 'event' as const,
            createdAt: parseFirestoreTimestamp(newData.createdAt),
            updatedAt: parseFirestoreTimestamp(newData.updatedAt),
        } as SchoolEvent;
    }

    if (!beforeState || JSON.stringify(prepareStateForLog(beforeState)) !== JSON.stringify(prepareStateForLog(afterState))) {
      await logAction(classId, 'update_event', { before: prepareStateForLog(beforeState), after: prepareStateForLog(afterState) }, userId);
    }
  } catch (error) {
    console.error("Error updating school event:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため行事を更新できませんでした。");
    if ((error as FirestoreError).code === 'invalid-argument') throw new Error("更新データに無効な値が含まれていました。");
    throw error;
  }
};

export const deleteSchoolEvent = async (classId: string, eventId: string, userId: string = 'system_delete_event'): Promise<void> => {
  const docRef = doc(getEventsCollectionRef(classId), eventId);
  let beforeState: SchoolEvent | null = null;
  try {
    const oldDataSnap = await getDoc(docRef);
    if (oldDataSnap.exists()) {
      const oldData = oldDataSnap.data();
      beforeState = { 
          id: eventId, 
          ...oldData, 
          itemType: 'event' as const,
          createdAt: parseFirestoreTimestamp(oldData.createdAt),
          updatedAt: parseFirestoreTimestamp(oldData.updatedAt),
      } as SchoolEvent;
      await deleteDoc(docRef);
      await logAction(classId, 'delete_event', { before: prepareStateForLog(beforeState), after: null }, userId);
    }
  } catch (error) {
    console.error("Error deleting school event:", error);
    if ((error as FirestoreError).code === 'unavailable') throw new Error("オフラインのため行事を削除できませんでした。");
    throw error;
  }
};

export const onSchoolEventsUpdate = (classId: string, callback: (events: SchoolEvent[]) => void, onError?: (error: Error) => void): Unsubscribe => {
  const q = query(getEventsCollectionRef(classId), orderBy('startDate'));
  const unsubscribe = onSnapshot(q, (snapshot) => callback(snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return { 
      id: docSnap.id,
      title: data.title,
      startDate: data.startDate,
      endDate: data.endDate,
      description: data.description,
      itemType: 'event' as const, 
      createdAt: parseFirestoreTimestamp(data.createdAt),
      updatedAt: parseFirestoreTimestamp(data.updatedAt),
    } as SchoolEvent;
  })),
    (error) => {
      console.error("Snapshot error on school events:", error);
      if ((error as FirestoreError).code === 'failed-precondition') onError?.(new Error("Firestore 行事クエリに必要なインデックス(startDate)がありません (realtime)。"));
      else onError?.(error);
    });
  return unsubscribe;
};

export const applyFixedTimetableForFuture = async (classId: string, userId: string = 'system_apply_future_tt'): Promise<void> => {
  let operationsCount = 0;
  let datesAffected: string[] = [];
  try {
    const settings = await getTimetableSettings(classId);
    const fixedTimetable = await getFixedTimetable(classId);
    if (!fixedTimetable || fixedTimetable.length === 0) return;
    const today = startOfDay(new Date());
    const batch = writeBatch(db);
    const dayMapping: { [key: number]: DayOfWeek } = { 1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY, 4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY };
    const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

    for (let i = 0; i < FUTURE_DAYS_TO_APPLY; i++) {
      const futureDate = addDays(today, i); 
      const dateStr = format(futureDate, 'yyyy-MM-dd');
      const dayOfWeekEnum = dayMapping[getDay(futureDate)];
      if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) continue;

      const existingAnnouncements = await getDailyAnnouncements(classId, dateStr);
      const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));
      let dateNeedsUpdate = false;
      const fixedSlotsForDay = fixedTimetable.filter(slot => slot.day === dayOfWeekEnum);

      for (const fixedSlot of fixedSlotsForDay) {
        if (fixedSlot.period > (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods)) continue;
        const existingAnn = existingAnnouncementsMap.get(fixedSlot.period);
        
        if (existingAnn?.isManuallyCleared) {
            continue; 
        }

        const fixedSubjectIdOrNull = fixedSlot.subjectId ?? null;
        
        if (!existingAnn || 
            (!existingAnn.text && !existingAnn.showOnCalendar && (existingAnn.subjectIdOverride ?? null) !== fixedSubjectIdOrNull)
           ) {
          const docRef = doc(getDailyAnnouncementsCollectionRef(classId), `${dateStr}_${fixedSlot.period}`);
          const newAnnouncementData: Omit<DailyAnnouncement, 'id' | 'updatedAt'> = { 
            date: dateStr, 
            period: fixedSlot.period, 
            subjectIdOverride: fixedSubjectIdOrNull, 
            text: '', 
            showOnCalendar: false, 
            itemType: 'announcement', 
            isManuallyCleared: false 
          };
          
          if (!existingAnn || (existingAnn.subjectIdOverride ?? null) !== fixedSubjectIdOrNull) {
            batch.set(docRef, {...newAnnouncementData, updatedAt: Timestamp.now()}); 
            operationsCount++;
            dateNeedsUpdate = true;
          }
        }
      }
      if (dateNeedsUpdate && !datesAffected.includes(dateStr)) datesAffected.push(dateStr);
    }
    if (operationsCount > 0) {
      await batch.commit();
      await logAction(classId, 'apply_fixed_timetable_future', { meta: prepareStateForLog({ operationsCount, daysAffected: datesAffected.length, daysAppliedRange: FUTURE_DAYS_TO_APPLY }) }, userId);
    }
  } catch (error) {
    console.error("Error applying fixed timetable to future dates:", error);
    await logAction(classId, 'apply_fixed_timetable_future_error', { meta: prepareStateForLog({ error: String(error) }) }, userId);
    if ((error as FirestoreError).code === 'unavailable') console.warn("Client is offline. Cannot apply fixed timetable to future.");
    else if ((error as FirestoreError).code === 'failed-precondition') console.error("Firestore index required for applying fixed timetable to future.");
  }
};

export const resetFutureDailyAnnouncements = async (classId: string, userId: string = 'system_reset_future_annc'): Promise<void> => {
  let operationsCount = 0;
  let datesAffected: string[] = [];
  const beforeStates: { [date: string]: (DailyAnnouncement | null)[] } = {};
  try {
    const settings = await getTimetableSettings(classId);
    const fixedTimetable = await getFixedTimetable(classId);
    const today = startOfDay(new Date());
    const batch = writeBatch(db);
    const dayMapping: { [key: number]: DayOfWeek } = { 1: DayOfWeekEnum.MONDAY, 2: DayOfWeekEnum.TUESDAY, 3: DayOfWeekEnum.WEDNESDAY, 4: DayOfWeekEnum.THURSDAY, 5: DayOfWeekEnum.FRIDAY, 6: DayOfWeekEnum.SATURDAY, 0: DayOfWeekEnum.SUNDAY };
    const activeDaysSet = new Set(settings.activeDays ?? DEFAULT_TIMETABLE_SETTINGS.activeDays);

    for (let i = 0; i < FUTURE_DAYS_TO_APPLY; i++) { 
      const futureDate = addDays(today, i); 
      const dateStr = format(futureDate, 'yyyy-MM-dd');
      const dayOfWeekEnum = dayMapping[getDay(futureDate)];
      if (!dayOfWeekEnum || !activeDaysSet.has(dayOfWeekEnum)) continue;

      const existingAnnouncements = await getDailyAnnouncements(classId, dateStr);
      const existingAnnouncementsMap = new Map(existingAnnouncements.map(a => [a.period, a]));
      let dateNeedsUpdate = false;
      beforeStates[dateStr] = [];
      const fixedSlotsForDay = fixedTimetable.filter(fs => fs.day === dayOfWeekEnum);

      for (let period = 1; period <= (settings.numberOfPeriods ?? DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods); period++) {
        const docRef = doc(getDailyAnnouncementsCollectionRef(classId), `${dateStr}_${period}`);
        const fixedSlot = fixedSlotsForDay.find(fs => fs.period === period);
        const existingAnnForLog = existingAnnouncementsMap.get(period);
        if (existingAnnForLog) beforeStates[dateStr].push(existingAnnForLog); else beforeStates[dateStr].push(null);
        
        const newAnnouncementData: Omit<DailyAnnouncement, 'id'|'updatedAt'> = { 
          date: dateStr, 
          period: period, 
          subjectIdOverride: fixedSlot?.subjectId ?? null, 
          text: '', 
          showOnCalendar: false, 
          itemType: 'announcement', 
          isManuallyCleared: false 
        };
        
        const existingDoc = existingAnnouncementsMap.get(period);
        if (!existingDoc || 
            (existingDoc.text !== newAnnouncementData.text) || 
            ((existingDoc.subjectIdOverride ?? null) !== (newAnnouncementData.subjectIdOverride ?? null)) ||
            (existingDoc.showOnCalendar !== newAnnouncementData.showOnCalendar) ||
            (existingDoc.isManuallyCleared !== newAnnouncementData.isManuallyCleared) 
           ) {
            batch.set(docRef, {...newAnnouncementData, updatedAt: Timestamp.now()});
            operationsCount++;
            dateNeedsUpdate = true;
        }
      }
      if (dateNeedsUpdate && !datesAffected.includes(dateStr)) datesAffected.push(dateStr);
    }
    if (operationsCount > 0) {
      await batch.commit();
      await logAction(classId, 'reset_future_daily_announcements', { meta: prepareStateForLog({ operationsCount, daysAffected: datesAffected.length, daysAppliedRange: FUTURE_DAYS_TO_APPLY }), before: prepareStateForLog(beforeStates) }, userId);
    }
  } catch (error) {
    console.error("Error resetting future daily announcements:", error);
    await logAction(classId, 'reset_future_daily_announcements_error', { meta: prepareStateForLog({ error: String(error) }) }, userId);
    if ((error as FirestoreError).code === 'unavailable') console.warn("Client is offline. Cannot reset future daily announcements.");
    else if ((error as FirestoreError).code === 'failed-precondition') console.error("Firestore index required for resetting future daily announcements.");
  }
};

export const getLogs = async (classId: string, limitCount: number = 100): Promise<any[]> => {
  const logsCollectionRef = collection(db, 'classes', classId, 'logs');
  try {
    const q = query(logsCollectionRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data(), timestamp: parseFirestoreTimestamp(docSnap.data().timestamp) }));
  } catch (error) {
    console.error("Error fetching logs:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') throw new Error("Firestore ログクエリに必要なインデックス(timestamp)がありません。");
    throw error;
  }
};

type CalendarItemUnion = (SchoolEvent & { itemType: 'event' }) | (DailyAnnouncement & { itemType: 'announcement' }) | (Assignment & { itemType: 'assignment' });

export const getCalendarDisplayableItemsForMonth = async (classId: string, year: number, month: number): Promise<CalendarItemUnion[]> => {
  console.log(`[CalendarDebug] Fetching items for ${year}-${month}`);
  const monthStartDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
  const monthEndDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
  console.log(`[CalendarDebug] Date range: ${monthStartDate} to ${monthEndDate}`);
  const items: CalendarItemUnion[] = [];
  const eventsCollectionRef = getEventsCollectionRef(classId);
  const dailyAnnouncementsCollectionRef = getDailyAnnouncementsCollectionRef(classId);
  const assignmentsCollectionRef = getAssignmentsCollectionRef(classId);

  try {
    // Fetch Events
    const eventsQuery = query(
      eventsCollectionRef,
      where('startDate', '<=', monthEndDate), // Events starting before or during the month
      orderBy('startDate')
    );
    const eventsSnapshot = await getDocs(eventsQuery);
    let fetchedEventsCount = 0;
    eventsSnapshot.forEach(docSnap => {
      const eventData = docSnap.data();
      const event: SchoolEvent = { 
        id: docSnap.id, 
        title: eventData.title,
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        description: eventData.description,
        itemType: 'event', 
        createdAt: parseFirestoreTimestamp(eventData.createdAt),
        updatedAt: parseFirestoreTimestamp(eventData.updatedAt),
      };
      // Further filter: events ending on or after the month starts
      if ((event.endDate ?? event.startDate) >= monthStartDate) {
        items.push(event);
        fetchedEventsCount++;
      }
    });
    console.log(`[CalendarDebug] Fetched ${eventsSnapshot.docs.length} raw events, added ${fetchedEventsCount} to calendar items.`);

    // Fetch Announcements
    const announcementsQuery = query(
      dailyAnnouncementsCollectionRef,
      where('date', '>=', monthStartDate),
      where('date', '<=', monthEndDate),
      where('showOnCalendar', '==', true),
      orderBy('date'),
    );
    const announcementsSnapshot = await getDocs(announcementsQuery);
    let fetchedAnnouncementsCount = 0;
    announcementsSnapshot.forEach(docSnap => {
      const annData = docSnap.data();
      const announcementItem: DailyAnnouncement = {
        id: docSnap.id,
        date: annData.date,
        period: annData.period,
        subjectIdOverride: annData.subjectIdOverride ?? null,
        text: annData.text ?? '',
        showOnCalendar: annData.showOnCalendar ?? false, // Ensure this is boolean
        updatedAt: parseFirestoreTimestamp(annData.updatedAt) ?? new Date(),
        itemType: 'announcement',
        isManuallyCleared: annData.isManuallyCleared ?? false,
      };
      items.push(announcementItem);
      fetchedAnnouncementsCount++;
    });
    console.log(`[CalendarDebug] Fetched ${fetchedAnnouncementsCount} announcements with showOnCalendar=true.`);

    // Fetch Assignments
    const assignmentsQuery = query(
      assignmentsCollectionRef,
      where('dueDate', '>=', monthStartDate),
      where('dueDate', '<=', monthEndDate),
      orderBy('dueDate')
    );
    const assignmentsSnapshot = await getDocs(assignmentsQuery);
    let fetchedAssignmentsCount = 0;
    assignmentsSnapshot.forEach(docSnap => {
        const assignData = docSnap.data();
        const assignment: Assignment = {
            id: docSnap.id,
            title: assignData.title,
            description: assignData.description,
            subjectId: assignData.subjectId,
            customSubjectName: assignData.customSubjectName,
            dueDate: assignData.dueDate,
            duePeriod: assignData.duePeriod,
            submissionMethod: assignData.submissionMethod,
            targetAudience: assignData.targetAudience,
            createdAt: parseFirestoreTimestamp(assignData.createdAt) as Date,
            updatedAt: parseFirestoreTimestamp(assignData.updatedAt) as Date,
            itemType: 'assignment',
        };
        items.push(assignment);
        fetchedAssignmentsCount++;
    });
    console.log(`[CalendarDebug] Fetched ${fetchedAssignmentsCount} assignments.`);
    
    items.sort((a, b) => {
        const dateAStr = a.itemType === 'event' ? (a as SchoolEvent).startDate : (a.itemType === 'assignment' ? (a as Assignment).dueDate : (a as DailyAnnouncement).date);
        const dateBStr = b.itemType === 'event' ? (b as SchoolEvent).startDate : (b.itemType === 'assignment' ? (b as Assignment).dueDate : (b as DailyAnnouncement).date);
        
        const dateA = parseISO(dateAStr);
        const dateB = parseISO(dateBStr);

        const timeA = isValid(dateA) ? dateA.getTime() : 0;
        const timeB = isValid(dateB) ? dateB.getTime() : 0;


        if (timeA !== timeB) {
            return timeA - timeB;
        }
        const typeOrder = { event: 1, assignment: 2, announcement: 3 };
        if (typeOrder[a.itemType] !== typeOrder[b.itemType]) {
            return typeOrder[a.itemType] - typeOrder[b.itemType];
        }
        if (a.itemType === 'announcement' && b.itemType === 'announcement') {
            return (a as DailyAnnouncement).period - (b as DailyAnnouncement).period;
        }
        if (a.itemType === 'assignment' && b.itemType === 'assignment') {
            const titleCompare = (a as Assignment).title.localeCompare((b as Assignment).title, 'ja');
            if (titleCompare !== 0) return titleCompare;
            return (parseFirestoreTimestamp((a as Assignment).createdAt)?.getTime() ?? 0) - (parseFirestoreTimestamp((b as Assignment).createdAt)?.getTime() ?? 0);
        }
        return 0;
    });
    console.log(`[CalendarDebug] Total combined and sorted items for calendar: ${items.length}`);
    return items;

  } catch (error) {
    console.error(`[CalendarDebug] Error fetching calendar items for ${year}-${month}:`, error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') {
      console.error("[CalendarDebug] Firestore query requires an index. Check Firebase console. Error:", (error as FirestoreError).message);
      throw new Error(`Firestore クエリに必要なインデックスがありません。Firebaseコンソールを確認してください。`);
    }
    throw error;
  }
};


export const queryFnGetTimetableSettings = (classId: string) => () => getTimetableSettings(classId);
export const queryFnGetFixedTimetable = (classId: string) => () => getFixedTimetable(classId);
export const queryFnGetDailyAnnouncements = (classId: string, date: string) => () => getDailyAnnouncements(classId, date);
export const queryFnGetDailyGeneralAnnouncement = (classId: string, date: string) => () => getDailyGeneralAnnouncement(classId, date);
export const queryFnGetSchoolEvents = (classId: string) => () => getSchoolEvents(classId);
export const queryFnGetCalendarDisplayableItemsForMonth = (classId: string, year: number, month: number) => () => getCalendarDisplayableItemsForMonth(classId, year, month);
export const queryFnGetSubjects = (classId: string) => () => getSubjectsFromSubjectController(classId);
