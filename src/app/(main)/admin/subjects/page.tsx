
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertCircle, WifiOff, PlusCircle, Edit, Trash2, Save, Lock, Info } from 'lucide-react';
import type { Subject } from '@/models/subject';
import { queryFnGetSubjects, addSubject, updateSubject, deleteSubject, onSubjectsUpdate } from '@/controllers/subjectController';
import { useAuth } from '@/contexts/AuthContext';
import { areArraysOfObjectsEqual } from '@/lib/utils'; // Import helper
import { queryFnGetTimetableSettings, TimetableSettings } from '@/controllers/timetableController';

const queryClient = new QueryClient();

function SubjectsPageContent() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient();
  const { session, loading: authLoading } = useAuth();
  const classId = session?.customUser?.classId;

  const [isOffline, setIsOffline] = useState(false);
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [teacherName, setTeacherName] = useState<string | null>('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: settings } = useQuery<TimetableSettings, Error>({
    queryKey: ['timetableSettings', classId],
    queryFn: queryFnGetTimetableSettings(classId!),
    staleTime: Infinity,
    enabled: !!classId && !isOffline,
  });

  const canStudentEdit = settings?.studentPermissions?.canEditSubjects === true;
  const canPerformActions = session?.customUser?.role === 'class_admin' || (session?.customUser?.role === 'student' && canStudentEdit);

  useEffect(() => {
    const handleOnline = () => {
      if (isOffline) {
        setIsOffline(false);
        queryClientHook.invalidateQueries({ queryKey: ['subjects', classId] });
      }
    };
    const handleOffline = () => setIsOffline(true);

    if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
    return () => {};
  }, [isOffline, queryClientHook, classId]);

  const handleQueryError = (error: unknown) => {
    console.error("Subjects Query Error:", error);
    const isOfflineError = (error as any)?.code === 'unavailable';
    if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setIsOffline(true);
    }
  };

  const { data: initialSubjects, isLoading, error } = useQuery({
    queryKey: ['subjects', classId],
    queryFn: queryFnGetSubjects(classId!),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    onError: handleQueryError,
    enabled: !isOffline && !!classId,
  });

  useEffect(() => {
    if (isOffline || !classId) return;
    const unsubscribe = onSubjectsUpdate(
      classId,
      (newSubjects) => {
        setLiveSubjects(prevSubjects => areArraysOfObjectsEqual(prevSubjects, newSubjects) ? prevSubjects : newSubjects);
      }, 
      (error) => {
        console.error("Realtime subjects error:", error);
        setIsOffline(true);
      }
    );
    return () => unsubscribe();
  }, [isOffline, classId]);

  const subjects = useMemo(() => liveSubjects.length > 0 ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]);

  const handleMutationError = (error: Error, action: string) => {
    console.error(`Failed to ${action} subject:`, error);
    const isOfflineError = error.message.includes("オフラインのため");
    if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) setIsOffline(true);
    toast({
      title: isOfflineError ? "オフライン" : "エラー",
      description: isOfflineError ? `科目の${action}に失敗しました。接続を確認してください。` : `科目の${action}に失敗しました: ${error.message}`,
      variant: "destructive",
    });
  };
  
  const userIdForLog = session?.customUser?.id ?? 'admin_user_subjects';

  const addMutation = useMutation({
    mutationFn: ({ name, teacher }: { name: string; teacher: string | null }) => addSubject(classId!, name, teacher, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "科目を追加しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['subjects', classId] });
      setIsModalOpen(false);
    },
    onError: (error: Error) => handleMutationError(error, "追加"),
    onSettled: () => setIsSaving(false),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, teacher }: { id: string; name: string; teacher: string | null }) => updateSubject(classId!, id, name, teacher, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "科目を更新しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['subjects', classId] });
      setIsModalOpen(false);
    },
    onError: (error: Error) => handleMutationError(error, "更新"),
    onSettled: () => setIsSaving(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSubject(classId!, id, userIdForLog),
    onSuccess: async (_, id) => {
      toast({ title: "成功", description: `科目を削除しました。関連する時間割のコマは「未設定」になります。` });
      await queryClientHook.invalidateQueries({ queryKey: ['subjects', classId] });
      await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable', classId] }); // Invalidate fixed timetable
      await queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', classId] }); // Invalidate daily announcements
    },
    onError: (error: Error) => handleMutationError(error, "削除"),
  });

  const openAddModal = () => { setEditingSubject(null); setSubjectName(''); setTeacherName(''); setIsModalOpen(true); };
  const openEditModal = (subject: Subject) => { setEditingSubject(subject); setSubjectName(subject.name); setTeacherName(subject.teacherName); setIsModalOpen(true); };

  const handleSave = () => {
    if (isSaving || isOffline) return;
    if (!subjectName.trim()) {
      toast({ title: "入力エラー", description: "科目名は必須です。", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    if (editingSubject?.id) {
      updateMutation.mutate({ id: editingSubject.id, name: subjectName, teacher: teacherName });
    } else {
      addMutation.mutate({ name: subjectName, teacher: teacherName });
    }
  };

  const showLoading = isLoading && !isOffline;
  const showError = error && !isOffline;
  const tableHeaders = ['科目名', '担当教員名', '操作'];
  const headerWidths = ['', '', 'text-right w-[80px] sm:w-[100px]'];
  
  if (authLoading || (!session && !isOffline)) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
            <Skeleton className="h-12 w-1/2 mb-4" />
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-8 w-3/4" />
        </div>
    );
  }

  if (!classId) {
     return (
        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>クラス情報が見つかりません</AlertTitle>
            <AlertDescription>
                管理者としてログインしているクラスの情報が取得できませんでした。再度ログインし直してください。
            </AlertDescription>
        </Alert>
     )
  }


  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">科目管理</h1>
      {!canPerformActions && session?.customUser?.role === 'student' &&
        <Alert className="mb-4">
            <Lock className="h-4 w-4" />
            <AlertTitle>読み取り専用</AlertTitle>
            <AlertDescription>現在、科目管理はクラス管理者によって制限されています。</AlertDescription>
        </Alert>
      }
      {isOffline && (
        <Alert variant="destructive" className="mb-6">
          <WifiOff className="h-4 w-4" /> <AlertTitle>オフライン</AlertTitle>
          <AlertDescription>現在オフラインです。科目リストの表示や変更はできません。</AlertDescription>
        </Alert>
      )}
      <Card className={`${isOffline || !canPerformActions ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle>科目リスト</CardTitle>
          <CardDescription>登録されている科目と担当教員の一覧です。</CardDescription>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : showError ? (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /> <AlertTitle>エラー</AlertTitle><AlertDescription>科目の読み込みに失敗しました。</AlertDescription></Alert>
          ) : !subjects || subjects.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">科目が登録されていません。</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{tableHeaders.map((header, index) => <TableHead key={`${header}-${index}`} className={headerWidths[index]}>{header}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {subjects.map((subject) => {
                    const cells = [
                      <TableCell key={`${subject.id}-name`} className="font-medium">{subject.name}</TableCell>,
                      <TableCell key={`${subject.id}-teacher`}>{subject.teacherName || <span className="text-muted-foreground italic">未設定</span>}</TableCell>,
                      <TableCell key={`${subject.id}-actions`} className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(subject)} className="mr-1 h-8 w-8" disabled={isOffline}><Edit className="h-4 w-4" /><span className="sr-only">編集</span></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" disabled={isOffline || deleteMutation.isPending}><Trash2 className="h-4 w-4" /><span className="sr-only">削除</span></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>本当に科目「{subject.name}」を削除しますか？</AlertDialogTitle><AlertDialogDescription>この操作は元に戻せません。この科目が時間割で使用されている場合、該当箇所は「未設定」として扱われます。</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel disabled={deleteMutation.isPending}>キャンセル</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(subject.id!)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? '削除中...' : '削除する'}</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    ];
                    return <TableRow key={subject.id}>{cells.map(cell => cell)}</TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={openAddModal} disabled={isOffline || isLoading} size="sm"><PlusCircle className="mr-2 h-4 w-4" />新規科目を追加</Button>
        </CardFooter>
      </Card>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSubject ? '科目を編集' : '新規科目を追加'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="subjectName" className="text-right">科目名</Label><Input id="subjectName" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className="col-span-3" placeholder="例: 数学I" disabled={isSaving} /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="teacherName" className="text-right">担当教員名</Label><Input id="teacherName" value={teacherName ?? ''} onChange={(e) => setTeacherName(e.target.value)} className="col-span-3" placeholder="例: 山田 太郎 (任意)" disabled={isSaving} /></div>
          </div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="secondary" disabled={isSaving} size="sm">キャンセル</Button></DialogClose><Button onClick={handleSave} disabled={isSaving || isOffline} size="sm"><Save className="mr-2 h-4 w-4" />{isSaving ? '保存中...' : '保存'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function SubjectsPage() {
    return (
      <QueryClientProvider client={queryClient}>
        <SubjectsPageContent />
      </QueryClientProvider>
    );
}
