
import { db } from '@/config/firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
  FirestoreError,
  serverTimestamp,
  getDoc,
  where,
  onSnapshot,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import type { Inquiry, InquiryStatus, InquiryMessage, MessageSenderRole } from '@/models/inquiry';
import { logAction } from '@/services/logService';
import { prepareStateForLog } from '@/lib/logUtils';
import { getTimetableSettings } from './timetableController';


const parseInquiryTimestamp = (timestampField: any): Date | Timestamp => {
  if (!timestampField) return new Date(); 
  if (timestampField instanceof Timestamp) return timestampField;
  if (typeof timestampField.toDate === 'function') return timestampField.toDate();
  if (timestampField instanceof Date) return timestampField;
  if (typeof timestampField === 'object' && timestampField.seconds !== undefined && timestampField.nanoseconds !== undefined) {
    try {
      return new Timestamp(timestampField.seconds, timestampField.nanoseconds).toDate();
    } catch (e) {
      console.warn("Failed to parse plain object as Timestamp for inquiry:", timestampField, e);
      return new Date(); 
    }
  }
  return new Date(); 
};

// --- Inquiry Thread Functions ---

export const createInquiry = async (
    classId: string, 
    userId: string,
    userDisplayName: string,
    type: Inquiry['type'],
    title: string,
    initialMessage: string,
    targetRole: Inquiry['targetRole'] // Added targetRole
): Promise<string> => {
  const inquiriesCollectionRef = collection(db, 'classes', classId, 'inquiries');
  const batch = writeBatch(db);

  try {
    const inquiryData: Omit<Inquiry, 'id'> = {
      classId,
      userId,
      userDisplayName,
      type,
      title,
      status: 'new' as InquiryStatus,
      targetRole, // Set targetRole here
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageSnippet: initialMessage.substring(0, 80),
    };
    const inquiryDocRef = doc(inquiriesCollectionRef);
    batch.set(inquiryDocRef, inquiryData);
    
    const initialMessageData: Omit<InquiryMessage, 'id'> = {
        senderId: userId,
        senderRole: 'user',
        senderName: userDisplayName,
        content: initialMessage,
        createdAt: serverTimestamp(),
    };
    const messageDocRef = doc(collection(inquiriesCollectionRef, inquiryDocRef.id, 'messages'));
    batch.set(messageDocRef, initialMessageData);
    
    await batch.commit();

    const afterState = { ...inquiryData, id: inquiryDocRef.id, createdAt: new Date(), updatedAt: new Date(), lastMessageAt: new Date() };
    await logAction(classId, 'create_inquiry', { after: prepareStateForLog(afterState) }, userId);
    return inquiryDocRef.id;

  } catch (error) {
    console.error("Error creating inquiry thread:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため問い合わせを送信できませんでした。");
    }
    throw error;
  }
};

export const getInquiriesForUser = async (classId: string, userId: string): Promise<Inquiry[]> => {
  const inquiriesCollectionRef = collection(db, 'classes', classId, 'inquiries');
  try {
    const q = query(inquiriesCollectionRef, where('userId', '==', userId), orderBy('lastMessageAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Inquiry));
  } catch (error) {
    console.error("Error fetching user inquiries:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    throw error;
  }
}

export const getInquiriesForAdmin = async (classId: string): Promise<Inquiry[]> => {
  const inquiriesCollectionRef = collection(db, 'classes', classId, 'inquiries');
  try {
    const q = query(inquiriesCollectionRef, orderBy('lastMessageAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Inquiry));
  } catch (error) {
    console.error("Error fetching inquiries for admin:", error);
    if ((error as FirestoreError).code === 'unavailable') return [];
    if ((error as FirestoreError).code === 'failed-precondition') {
        console.error("Firestore query for inquiries requires an index on 'lastMessageAt'. Please create it in firestore.indexes.json.");
        throw new Error("Firestore 問い合わせクエリに必要なインデックス(lastMessageAt)がありません。作成してください。");
    }
    throw error;
  }
};
export const queryFnGetInquiriesForAdmin = (classId: string) => () => getInquiriesForAdmin(classId);
export const queryFnGetTimetableSettings = (classId: string) => () => getTimetableSettings(classId);


export const updateInquiryStatus = async (classId: string, inquiryId: string, status: InquiryStatus, userId: string): Promise<void> => {
  const docRef = doc(collection(db, 'classes', classId, 'inquiries'), inquiryId);
  try {
    const oldSnap = await getDoc(docRef);
    let beforeState: Inquiry | null = null;
    if (oldSnap.exists()) {
        const oldData = oldSnap.data();
        beforeState = {
             id: oldSnap.id, ...oldData,
             createdAt: parseInquiryTimestamp(oldData.createdAt),
             updatedAt: oldData.updatedAt ? parseInquiryTimestamp(oldData.updatedAt) : parseInquiryTimestamp(oldData.createdAt),
        } as Inquiry;
    }

    await updateDoc(docRef, { status, updatedAt: serverTimestamp() });
    
    const afterState = { ...beforeState, status, updatedAt: new Date() } as Inquiry;
    await logAction(classId, 'update_inquiry_status', { 
        before: prepareStateForLog(beforeState), 
        after: prepareStateForLog(afterState), 
        inquiryId 
    }, userId);
  } catch (error) {
    console.error("Error updating inquiry status:", error);
    if ((error as FirestoreError).code === 'unavailable') {
      throw new Error("オフラインのため問い合わせステータスを更新できませんでした。");
    }
    throw error;
  }
};

// --- Inquiry Messages Functions ---

export const getInquiryMessages = async (classId: string, inquiryId: string): Promise<InquiryMessage[]> => {
    const messagesRef = collection(db, 'classes', classId, 'inquiries', inquiryId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: parseInquiryTimestamp(docSnap.data().createdAt),
    } as InquiryMessage));
};

export const onInquiryMessagesUpdate = (
    classId: string,
    inquiryId: string,
    callback: (messages: InquiryMessage[]) => void,
    onError: (error: Error) => void
): Unsubscribe => {
    const messagesRef = collection(db, 'classes', classId, 'inquiries', inquiryId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: parseInquiryTimestamp(docSnap.data().createdAt),
        } as InquiryMessage));
        callback(messages);
    }, onError);
};


export const addInquiryMessage = async (
    classId: string,
    inquiryId: string,
    senderId: string,
    senderRole: MessageSenderRole,
    senderName: string,
    content: string
): Promise<void> => {
    const messagesRef = collection(db, 'classes', classId, 'inquiries', inquiryId, 'messages');
    const inquiryRef = doc(db, 'classes', classId, 'inquiries', inquiryId);
    const batch = writeBatch(db);
    
    try {
        const newMessage: Omit<InquiryMessage, 'id'> = {
            senderId,
            senderRole,
            senderName,
            content,
            createdAt: serverTimestamp(),
        };
        const messageDocRef = doc(messagesRef);
        batch.set(messageDocRef, newMessage);

        batch.update(inquiryRef, {
            updatedAt: serverTimestamp(),
            lastMessageAt: serverTimestamp(),
            lastMessageSnippet: content.substring(0, 80),
        });

        await batch.commit();

        await logAction(classId, 'add_inquiry_message', {
          inquiryId,
          message: prepareStateForLog(newMessage),
        }, senderId);

    } catch (error) {
        console.error("Error adding inquiry message:", error);
        if ((error as FirestoreError).code === 'unavailable') {
            throw new Error("オフラインのためメッセージを送信できませんでした。");
        }
        throw error;
    }
};
