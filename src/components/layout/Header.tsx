
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, UserCircle, Menu as MenuIcon, X as XIcon, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import type { Dispatch, SetStateAction } from 'react';

interface HeaderProps {
  toggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export function Header({ toggleSidebar, isSidebarOpen }: HeaderProps) {
  const { session, loading, logout } = useAuth();
  const router = useRouter();

  const handleLoginClick = () => {
    router.push('/login');
  };

  const renderUserStatus = () => {
    if (loading) {
       return (
           <div className="flex items-center gap-1 sm:gap-2">
              <Skeleton className="h-8 w-8 sm:w-20" />
              <Skeleton className="h-8 w-8" />
           </div>
        );
    }
    
    if (session?.appAdmin) {
      return (
        <>
            <span className="text-sm text-destructive-foreground bg-destructive/80 px-2 py-1 rounded-md flex items-center" title={session.appAdmin.email}>
                <ShieldCheck className="h-4 w-4 mr-1" />
                <span className="hidden md:inline">開発者モード</span>
            </span>
            <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">ログアウト</span>
            </Button>
        </>
      )
    }

    if (session?.customUser) {
       return (
            <>
              <span className="text-sm text-muted-foreground flex items-center mr-1 sm:mr-2" title={session.customUser.username}>
                  <UserCircle className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">{session.customUser.displayName || session.customUser.username}</span>
                  <span className="sm:hidden">{session.customUser.displayName || session.customUser.username}</span>
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">ログアウト</span>
              </Button>
            </>
          );
    }

    // Not logged in
    return (
        <Button variant="outline" size="sm" onClick={handleLoginClick}>
            <LogIn className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">ログイン</span>
            <span className="sm:hidden">ログイン</span>
        </Button>
    )

  }

  return (
    <header className="sticky top-0 z-[55] w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-screen-2xl items-center px-4 md:px-8">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-2 relative z-[60]">
          {isSidebarOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          <span className="sr-only">{isSidebarOpen ? "ナビゲーションを閉じる" : "ナビゲーションを開く"}</span>
        </Button>
        <div className="mr-4 flex items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/logo.png"
              alt="ClassConnect Logo"
              width={28}
              height={28}
              className="text-primary"
              data-ai-hint="logo education"
            />
            <span className="hidden font-bold sm:inline-block">
              ClassConnect
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-1 md:space-x-2">
          {renderUserStatus()}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
