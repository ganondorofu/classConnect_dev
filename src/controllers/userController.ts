
'use server';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  writeBatch,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import type { CustomUser } from '@/models/user';
import type { ClassMetadata } from '@/models/class';
import { logAction } from '@/services/logService';
import { prepareStateForLog } from '@/lib/logUtils';

// --- App Admin ---
// This is now defined in AuthContext, but kept here for type reference if needed.
export interface AppAdmin {
    uid: string;
    email: string;
    name: string; // This might be derived from Firebase Auth user display name
}

// --- Custom User Account Logic ---

const usersCollectionRef = collection(db, 'users');
const classesMetadataCollectionRef = collection(db, 'classes_metadata');

// --- Password Hashing (Client-Side) ---
// IMPORTANT: This is a client-side implementation for prototyping.
// In a production app, hashing should ideally be handled server-side.
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  // Using the Web Crypto API, available in modern browsers and secure contexts (like localhost/https)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// NOTE: This is NOT a secure way to handle login in production.
// This logic should be in a secure backend (e.g., Firebase Function).
export const getUser = async (classCode: string, username: string, pass: string): Promise<CustomUser | null> => {
  try {
    const q = query(
      usersCollectionRef,
      where('classCode', '==', classCode),
      where('username', '==', username)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('No matching user found for:', classCode, username);
      return null;
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data() as CustomUser;
    
    // Check if user is disabled
    if (userData.disabled === true) {
      console.log(`Login attempt for disabled user: ${username}`);
      throw new Error("このアカウントは無効化されています。管理者にお問い合わせください。");
    }

    // Compare the hashed version of the provided password with the stored hash
    const providedPasswordHash = await hashPassword(pass);
    if (userData.password !== providedPasswordHash) {
        console.log('Password mismatch for user:', username);
        return null;
    }

    // Do not return the password hash to the client application state
    delete userData.password;

    return {
      id: userDoc.id,
      ...userData
    };
  } catch (error) {
    console.error("Error getting user:", error);
    if (error instanceof Error && error.message.includes("無効化")) {
        throw error;
    }
    throw new Error("ユーザー情報の取得中にエラーが発生しました。");
  }
};

// --- App Developer Actions ---

export const createClass = async (className: string, classCode: string): Promise<string> => {
    // Check if classCode already exists
    const q = query(classesMetadataCollectionRef, where('classCode', '==', classCode));
    const existing = await getDocs(q);
    if (!existing.empty) {
        throw new Error(`クラスコード "${classCode}" は既に使用されています。`);
    }

    // The document ID for the class settings will be a new unique ID.
    // This ID will be stored in the class metadata and used to reference the class's subcollections.
    const classDocRef = doc(collection(db, 'classes'));
    const classId = classDocRef.id;

    // Create the metadata document linking the user-friendly classCode to the internal classId
    await addDoc(classesMetadataCollectionRef, {
        className,
        classCode,
        classId: classId, // Store the generated ID here
    });

    return classId;
};

export const createUsersInBulk = async (classId: string, usersData: Omit<CustomUser, 'id' | 'classId'>[]): Promise<void> => {
    const q = query(classesMetadataCollectionRef, where('classId', '==', classId));
    const classSnap = await getDocs(q);

    if (classSnap.empty) {
        throw new Error(`クラスID "${classId}" が存在しません。`);
    }
    const classCode = classSnap.docs[0].data().classCode;

    const batch = writeBatch(db);

    for (const userData of usersData) {
        const newUserRef = doc(collection(db, 'users'));
        if (!userData.password) {
            throw new Error(`User data for '${userData.username}' is missing a password.`);
        }
        const hashedPassword = await hashPassword(userData.password);

        batch.set(newUserRef, {
            ...userData,
            password: hashedPassword, // Store the hashed password
            classId: classId,
            classCode: classCode, // Add classCode for easier querying during login
            disabled: false, // Default to enabled
        });
    }

    await batch.commit();
};

export const getAllClasses = async (): Promise<ClassMetadata[]> => {
    const snapshot = await getDocs(classesMetadataCollectionRef);
    return snapshot.docs.map(doc => ({ id: doc.data().classId, ...doc.data() } as ClassMetadata));
};


export const getUsersForClass = async (classId: string): Promise<CustomUser[]> => {
    const q = query(usersCollectionRef, where('classId', '==', classId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        delete data.password; // Never return password hash
        return {
            id: doc.id,
            ...data
        } as CustomUser;
    });
};

export const updateUserPassword = async (userId: string, newPassword: string): Promise<void> => {
    if (newPassword.length < 6) {
        throw new Error("パスワードは6文字以上である必要があります。");
    }
    const userRef = doc(db, 'users', userId);
    const newHashedPassword = await hashPassword(newPassword);

    const oldSnap = await getDoc(userRef);
    if (!oldSnap.exists()) throw new Error("User not found.");
    
    await updateDoc(userRef, { password: newHashedPassword });

    await logAction(oldSnap.data().classId, 'dev_update_password', { 
        userId: userId, 
        username: oldSnap.data().username,
    }, 'app_developer');
};

export const setUserDisabledStatus = async (userId: string, disabled: boolean): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const oldSnap = await getDoc(userRef);
    if (!oldSnap.exists()) throw new Error("User not found.");

    await updateDoc(userRef, { disabled });

     await logAction(oldSnap.data().classId, 'dev_set_user_disabled', {
        userId: userId,
        username: oldSnap.data().username,
        disabled,
    }, 'app_developer');
};
