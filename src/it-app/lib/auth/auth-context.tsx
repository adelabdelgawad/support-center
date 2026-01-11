 
 
// lib/auth/auth-context.tsx - Auth Context Provider
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '@/types/auth';
import { AuthService } from './auth-service';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: AppUser | null;
  isAuthenticated: boolean;
  _isLoading: boolean;
  login: (username: string, password: string, returnUrl?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [_isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Initialize auth state from cookies
  useEffect(() => {
    const initAuth = () => {
      const userData = AuthService.getUserData();
      const isAuth = AuthService.isAuthenticated();

      if (isAuth && userData) {
        setUser(userData);
      } else {
        setUser(null);
      }

      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Redirect logic - DISABLED
  // Middleware handles authentication redirects
  // This client-side logic is kept only for post-login redirect
  useEffect(() => {
    if (_isLoading) {return;}

    // Only redirect from login page to home after successful login
    if (user && pathname === '/login') {
      router.push('/');
    }
    // Don't redirect to login here - middleware handles that
  }, [user, _isLoading, pathname, router]);

  const login = async (username: string, password: string, returnUrl?: string) => {
    const result = await AuthService.login(username, password);

    if (result.success && result.user) {
      // Use user data returned from login (avoids race condition with cookies)
      setUser(result.user);

      // Redirect to returnUrl if provided, otherwise go to home
      const redirectPath = returnUrl || '/';
      router.push(redirectPath);
    }

    return result;
  };

  const logout = async () => {
    try {
      // Clear user state immediately for UI feedback
      setUser(null);

      // Perform logout (this will redirect to /login)
      await AuthService.logout();
    } catch (_error) {
      // Force redirect even if logout fails
      window.location.href = '/login';
    }
  };

  const refreshUser = () => {
    const userData = AuthService.getUserData();
    setUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        _isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
