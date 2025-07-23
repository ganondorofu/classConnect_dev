
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation"; 
import type { FormEvent} from 'react';
import React, { useState, useEffect, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import Image from "next/image";

function AdminLoginForm() {
  const [classCode, setClassCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { loginCustomUser, loading } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const user = await loginCustomUser(classCode, username, password);
    if (user && user.role === 'class_admin') {
      router.push('/');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="classCodeAdmin">クラスコード</Label>
        <Input id="classCodeAdmin" placeholder="クラスコード" value={classCode} onChange={(e) => setClassCode(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="usernameAdmin">ユーザー名</Label>
        <Input id="usernameAdmin" placeholder="管理者ユーザー名" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordAdmin">パスワード</Label>
        <Input id="passwordAdmin" type="password" placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "ログイン中..." : <><LogIn className="mr-2 h-4 w-4" /> 管理者としてログイン</>}
      </Button>
    </form>
  );
}

function StudentLoginForm() {
  const [classCode, setClassCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { loginCustomUser, loading } = useAuth();
  const router = useRouter();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const user = await loginCustomUser(classCode, username, password);
    if (user && user.role === 'student') {
      router.push('/');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
       <div className="space-y-2">
        <Label htmlFor="classCodeStudent">クラスコード</Label>
        <Input id="classCodeStudent" placeholder="クラスコード" value={classCode} onChange={(e) => setClassCode(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="usernameStudent">ユーザー名</Label>
        <Input id="usernameStudent" placeholder="ユーザー名" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordStudent">パスワード</Label>
        <Input id="passwordStudent" type="password" placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "ログイン中..." : <><LogIn className="mr-2 h-4 w-4" /> 学生としてログイン</>}
      </Button>
    </form>
  );
}

function LoginPageContent() {
    const { session, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!loading && session) {
            const redirectUrl = searchParams.get('redirect') || '/';
            router.push(redirectUrl);
        }
    }, [session, loading, router, searchParams]);

    if (loading || session) {
      return (
         <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <p>読み込み中...</p>
        </div>
      )
    }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 flex-col">
       <div className="flex items-center space-x-2 mb-6">
            <Image
              src="/logo.png"
              alt="ClassConnect Logo"
              width={40}
              height={40}
              data-ai-hint="logo education"
            />
            <h1 className="text-3xl font-bold">ClassConnect</h1>
        </div>
      <Tabs defaultValue="student" className="w-full max-w-md">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="student">学生ログイン</TabsTrigger>
          <TabsTrigger value="admin">管理者ログイン</TabsTrigger>
        </TabsList>
        <TabsContent value="student">
          <Card>
            <CardHeader>
              <CardTitle>学生ログイン</CardTitle>
              <CardDescription>クラスコード、ユーザー名、パスワードを入力してください。</CardDescription>
            </CardHeader>
            <CardContent>
              <StudentLoginForm />
            </CardContent>
             <CardFooter className="text-xs justify-center">
                 <Link href="/dev/login" className="text-muted-foreground hover:text-primary">アプリ開発者の方はこちら</Link>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="admin">
          <Card>
            <CardHeader>
              <CardTitle>管理者ログイン</CardTitle>
              <CardDescription>クラスの管理者アカウントでログインします。</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminLoginForm />
            </CardContent>
             <CardFooter className="text-xs justify-center">
                 <Link href="/dev/login" className="text-muted-foreground hover:text-primary">アプリ開発者の方はこちら</Link>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
