
"use client";

import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DevDashboard } from '@/components/dev/DevDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lock } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function DevPage() {
    const { session, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !session?.appAdmin) {
            router.push('/dev/login');
        }
    }, [session, loading, router]);

    if (loading || !session?.appAdmin) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-12 w-1/2" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (!session.appAdmin) {
        return (
            <Alert variant="destructive">
                <Lock className="h-4 w-4" />
                <AlertTitle>アクセス権限がありません</AlertTitle>
                <AlertDescription>このページはアプリ開発者のみがアクセスできます。</AlertDescription>
            </Alert>
        );
    }

    return (
        <QueryClientProvider client={queryClient}>
            <DevDashboard />
        </QueryClientProvider>
    );
}
