import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { io, type Socket } from 'socket.io-client';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiFetch } from '../lib/api.ts';

export type StudioRole = 'DIRECTOR' | 'ADMIN' | 'DEPT_HEAD' | 'MEMBER' | 'GUEST';

export interface StudioUser {
  id: number;
  uid: string;
  memberId: string | null;
  email: string;
  fullName: string;
  role: StudioRole;
  status: string;
  phone: string | null;
  bio: string | null;
  skills: string[];
  avatarUrl: string | null;
  sessionVersion: number;
  departments: Array<{ departmentId: string; deptRole: string }>;
}

interface AuthContextValue {
  firebaseUser: User | null;
  studioUser: StudioUser | null;
  unreadNotifications: number;
  loading: boolean;
  authError: string | null;
  socket: Socket | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUnreadNotifications: React.Dispatch<React.SetStateAction<number>>;
}

const StudioAuthContext = createContext<AuthContextValue | null>(null);

export function StudioAuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [studioUser, setStudioUser] = useState<StudioUser | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const connectSocket = useCallback(async (user: User) => {
    try {
      const token = await user.getIdToken();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      const s = io({
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      s.on('notification:new', () => {
        setUnreadNotifications((prev) => prev + 1);
      });
      socketRef.current = s;
      setSocket(s);
    } catch {
      // Non-fatal if socket fails
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setStudioUser(null);
      setUnreadNotifications(0);
      return;
    }
    try {
      const data = await apiFetch<{ user: StudioUser; unreadNotifications: number }>('/api/auth/me');
      setStudioUser(data.user);
      setUnreadNotifications(data.unreadNotifications);
      setAuthError(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to verify studio profile.');
      setStudioUser(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await refreshProfile();
        await connectSocket(user);
      } else {
        setStudioUser(null);
        setUnreadNotifications(0);
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
          setSocket(null);
        }
      }
      setLoading(false);
    });
    return () => {
      unsubscribe();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [connectSocket, refreshProfile]);

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setStudioUser(null);
    setUnreadNotifications(0);
  };

  return (
    <StudioAuthContext.Provider
      value={{
        firebaseUser,
        studioUser,
        unreadNotifications,
        loading,
        authError,
        socket,
        loginWithGoogle,
        logout,
        refreshProfile,
        setUnreadNotifications,
      }}
    >
      {children}
    </StudioAuthContext.Provider>
  );
}

export function useStudioAuth() {
  const ctx = useContext(StudioAuthContext);
  if (!ctx) throw new Error('useStudioAuth must be used inside StudioAuthProvider');
  return ctx;
}
