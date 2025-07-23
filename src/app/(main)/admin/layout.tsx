
"use client";

import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until the loading is complete before checking the session
    if (!loading) {
      // If not loading and not a class admin or app admin, redirect to login
      if (!session?.customUser?.role && !session?.appAdmin) {
        router.push('/login');
      }
    }
  }, [session, loading, router]);

  if (loading) {
    return (
        <div className="space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
    );
  }

  if (session?.customUser?.role || session?.appAdmin) {
    return <>{children}</>;
  }

  // Fallback while redirecting or for edge cases (e.g., non-admin user somehow gets here)
  return (
      <Alert variant="destructive">
        <Lock className="h-4 w-4" />
        <AlertTitle>アクセス権限がありません</AlertTitle>
        <AlertDescription>
            このページにアクセスするには管理者権限が必要です。
            <Button onClick={() => router.push('/login')} className="mt-4">ログインページへ</Button>
        </AlertDescription>
      </Alert>
  );
}
