
"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, UserCredential } from 'firebase/auth';
import type { ReactNode} from 'react';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { app } from '@/config/firebase';
import { useRouter, usePathname } from 'next/navigation'; 
import { useToast } from '@/hooks/use-toast';
import type { CustomUser } from '@/models/user'; // New custom user model
import { getUser, AppAdmin } from '@/controllers/userController'; // New controller

// Define the shape of our custom session
export interface Session {
  firebaseUser: FirebaseUser | null; // For App Admins
  customUser: CustomUser | null; // For Class Admins and Students
  appAdmin: AppAdmin | null; // For App Admins
}

export interface AuthContextType {
  session: Session | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<UserCredential | null>;
  loginCustomUser: (classCode: string, username: string, pass: string) => Promise<CustomUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const auth = getAuth(app);
const SESSION_STORAGE_KEY = 'classconnect_session';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const loadSessionFromStorage = useCallback(() => {
    const savedSessionJson = sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (savedSessionJson) {
      try {
        const savedSession = JSON.parse(savedSessionJson);
        if (savedSession.customUser) {
          setSession({
            firebaseUser: null,
            customUser: savedSession.customUser,
            appAdmin: null,
          });
        } else if (savedSession.appAdmin) { // Also load app admin from session storage
           setSession({
            firebaseUser: savedSession.firebaseUser, // This might be stale, but good for quick UI
            customUser: null,
            appAdmin: savedSession.appAdmin,
           });
        }
      } catch (e) {
        console.error("Failed to parse session from storage", e);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }, []);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Any user authenticated with Firebase Auth is considered an App Admin
        const newSession = {
          firebaseUser,
          customUser: null,
          appAdmin: { 
            uid: firebaseUser.uid, 
            email: firebaseUser.email || 'No Email',
            name: firebaseUser.displayName || 'App Admin'
          },
        };
        setSession(newSession);
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
      } else {
        // No Firebase user, check for custom user session or anonymous access
        loadSessionFromStorage();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadSessionFromStorage]);

  const loginWithEmail = async (email: string, pass: string): Promise<UserCredential | null> => {
    setLoading(true);
    try {
      // Simply sign in. The onAuthStateChanged listener will handle session creation.
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      toast({ title: '開発者としてログイン成功', description: 'ようこそ！' });
      return userCredential;
    } catch (error: any) {
      console.error("Email Login error:", error);
      let errorMessage = 'ログインに失敗しました。';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'メールアドレスまたはパスワードが正しくありません。';
      }
      toast({ title: 'ログイン失敗', description: errorMessage, variant: 'destructive' });
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loginCustomUser = async (classCode: string, username: string, pass: string): Promise<CustomUser | null> => {
    setLoading(true);
    try {
      const user = await getUser(classCode, username, pass);
      if (user) {
        const newSession = { firebaseUser: null, customUser: user, appAdmin: null };
        setSession(newSession);
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
        toast({ title: 'ログイン成功', description: `ようこそ、${user.displayName || user.username}さん！` });
        return user;
      } else {
        toast({ title: 'ログイン失敗', description: 'クラスコード、ユーザー名、またはパスワードが正しくありません。', variant: 'destructive' });
        setSession(null);
        return null;
      }
    } catch (error: any) {
      toast({ title: 'ログインエラー', description: error.message, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      if (session?.firebaseUser) {
        await signOut(auth);
      }
      // Clear all session/auth state
      setSession(null);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      toast({ title: 'ログアウトしました' });
      
      // Redirect to a neutral page after logout
      router.push('/login');
      
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: 'ログアウト失敗', description: 'ログアウト中にエラーが発生しました。', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };


  return (
    <AuthContext.Provider value={{ session, loading, loginWithEmail, loginCustomUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
