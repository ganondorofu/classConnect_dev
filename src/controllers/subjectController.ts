
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  FirestoreError,
  addDoc, 
  getDoc, 
  where, 
} from 'firebase/firestore';
import type { Subject } from '@/models/subject';
import { logAction } from '@/services/logService';
import { prepareStateForLog } from '@/lib/logUtils'; // Import from new location


const getSubjectsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'subjects');
const getFixedTimetableCollectionRef = (classId: string) => collection(db, 'classes', classId, 'fixedTimetable');
const getDailyAnnouncementsCollectionRef = (classId: string) => collection(db, 'classes', classId, 'dailyAnnouncements');

export const getSubjects = async (classId: string): Promise<Subject[]> => {
  const subjectsCollectionRef = getSubjectsCollectionRef(classId);
  try {
    const q = query(subjectsCollectionRef, orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));
  } catch (error) {
    console.error(`Error fetching subjects for class ${classId}:`, error);
    if ((error as FirestoreError).code === 'unavailable') {
      return [];
    }
    if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
        console.error("Firestore query for subjects requires an index on 'name'. Please create it.");
        throw new Error("Firestore 科目クエリに必要なインデックス(name)がありません。作成してください。");
    }
    throw error;
  }
};

export const addSubject = async (classId: string, name: string, teacherName: string | null, userId: string = 'system_add_subject'): Promise<string> => {
  if (!name) {
    throw new Error("科目名は必須です。");
  }
  const subjectsCollectionRef = getSubjectsCollectionRef(classId);
  const trimmedTeacherName = teacherName?.trim() || null;
  const dataToSet: Omit<Subject, 'id'> = {
    name: name.trim(),
    teacherName: trimmedTeacherName,
  };
  try {
    const docRef = await addDoc(subjectsCollectionRef, dataToSet);
    const newSubjectWithId = { id: docRef.id, ...dataToSet };
    await logAction(classId, 'add_subject', {
        before: null,
        after: prepareStateForLog(newSubjectWithId)
    }, userId);
    return docRef.id;
  } catch (error) {
    console.error("Error adding subject:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため科目を追加できませんでした。");
    }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
        console.error("Firestore Error: Attempted to save 'undefined' in subject. Check data structure.", dataToSet);
        throw new Error("科目データに無効な値(undefined)が含まれていました。");
   }
    throw error;
  }
};

export const updateSubject = async (classId: string, id: string, name: string, teacherName: string | null, userId: string = 'system_update_subject'): Promise<void> => {
   if (!id) throw new Error("Subject ID is required for updates.");
   if (!name) throw new Error("科目名は必須です。");

  const docRef = doc(getSubjectsCollectionRef(classId), id);
  const trimmedTeacherName = teacherName?.trim() || null;
  const dataToSet: Omit<Subject, 'id'> = {
    name: name.trim(),
    teacherName: trimmedTeacherName,
  };
  let beforeState: Subject | null = null;

  try {
    const oldSnap = await getDoc(docRef);
    if (oldSnap.exists()) {
        beforeState = { id: oldSnap.id, ...oldSnap.data() } as Subject;
    }

    await setDoc(docRef, dataToSet, { merge: true });
    const afterState = { id, ...dataToSet };
    await logAction(classId, 'update_subject', {
        before: prepareStateForLog(beforeState),
        after: prepareStateForLog(afterState)
     }, userId);
  } catch (error) {
    console.error("Error updating subject:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため科目を更新できませんでした。");
    }
     if ((error as FirestoreError).code === 'invalid-argument' && (error as FirestoreError).message.includes('undefined')) {
        console.error("Firestore Error: Attempted to save 'undefined' in subject update. Check data structure.", dataToSet);
        throw new Error("更新データに無効な値(undefined)が含まれていました。");
   }
    throw error;
  }
};

export const deleteSubject = async (classId: string, id: string, userId: string = 'system_delete_subject'): Promise<void> => {
  if (!id) throw new Error("Subject ID is required for deletion.");
  const subjectDocRef = doc(getSubjectsCollectionRef(classId), id);
  const fixedTimetableColRef = getFixedTimetableCollectionRef(classId);
  const dailyAnnouncementsColRef = getDailyAnnouncementsCollectionRef(classId);

  let beforeState: Subject | null = null;
  let referencesUpdatedCount = 0;

  try {
    const batch = writeBatch(db);
    const subjectSnap = await getDoc(subjectDocRef);
    if (subjectSnap.exists()) {
      beforeState = { id: subjectSnap.id, ...subjectSnap.data() } as Subject;
    } else {
      console.warn(`Subject with ID ${id} not found for deletion.`);
      throw new Error(`科目 (ID: ${id}) が見つかりませんでした。`);
    }

    const fixedUsageQuery = query(fixedTimetableColRef, where('subjectId', '==', id));
    const fixedUsageSnapshot = await getDocs(fixedUsageQuery);
    fixedUsageSnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { subjectId: null });
      referencesUpdatedCount++;
    });

    const dailyUsageQuery = query(dailyAnnouncementsColRef, where('subjectIdOverride', '==', id));
    const dailyUsageSnapshot = await getDocs(dailyUsageQuery);
    dailyUsageSnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { subjectIdOverride: null });
      referencesUpdatedCount++;
    });

    batch.delete(subjectDocRef);
    await batch.commit();

    await logAction(classId, 'delete_subject', {
      before: prepareStateForLog(beforeState),
      after: null,
      meta: { referencesUpdatedCount }
    }, userId);

  } catch (error: any) {
    console.error(`Error deleting subject ${id} and updating references:`, error);
    if ((error as FirestoreError)?.code === 'unavailable') {
      throw new Error("オフラインのため科目削除および関連箇所の更新ができませんでした。");
    }
    throw new Error(`科目の削除および関連箇所の更新中にエラーが発生しました: ${error.message}`);
  }
};

export const onSubjectsUpdate = (
    classId: string,
    callback: (subjects: Subject[]) => void,
    onError?: (error: Error) => void
): Unsubscribe => {
    const subjectsCollectionRef = getSubjectsCollectionRef(classId);
    const q = query(subjectsCollectionRef, orderBy('name'));
    return onSnapshot(q, (snapshot) => {
        const subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), teacherName: doc.data().teacherName ?? null } as Subject));
        if (typeof callback === 'function') {
          callback(subjects);
        }
    }, (error) => {
      console.error("Snapshot error on subjects:", error);
      if (typeof onError === 'function') {
        if ((error as FirestoreError).code === 'failed-precondition' && (error as FirestoreError).message.includes('index')) {
            console.error("Firestore query for subjects requires an index on 'name' for realtime updates. Please create it.");
            onError(new Error("Firestore 科目クエリに必要なインデックス(name) がありません (realtime)。作成してください。"));
        } else {
           onError(error);
        }
      }
    });
};

export const queryFnGetSubjects = (classId: string) => () => getSubjects(classId);
