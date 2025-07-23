
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter } from "next/navigation"; 
import type { FormEvent} from 'react';
import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";

function DevLoginPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { loginWithEmail, loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session?.appAdmin) {
      router.push('/dev');
    }
  }, [session, router]);


  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const userCredential = await loginWithEmail(email, password);
    if (userCredential) {
      router.push('/dev'); 
    }
  };

  if (session?.appAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p>リダイレクトしています...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">アプリ開発者ログイン</CardTitle>
          <CardDescription>
            Firebase認証情報でログインしてください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="developer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "ログイン中..." : <><LogIn className="mr-2 h-5 w-5" /> ログイン</>}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="text-xs justify-center">
             <Link href="/login" className="text-muted-foreground hover:text-primary">クラス/学生ログインに戻る</Link>
        </CardFooter>
      </Card>
    </div>
  );
}

function DevLoginPageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <Skeleton className="h-8 w-3/4 mx-auto" />
          <Skeleton className="h-4 w-full mx-auto mt-2" />
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
        <CardFooter className="text-center text-sm pt-6">
          <Skeleton className="h-4 w-3/4 mx-auto" />
        </CardFooter>
      </Card>
    </div>
  );
}


export default function DevLoginPage() {
    return (
        <Suspense fallback={<DevLoginPageSkeleton />}>
            <DevLoginPageContent />
        </Suspense>
    )
}
