
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryFnGetTimetableSettings, updateTimetableSettings, onTimetableSettingsUpdate, queryFnGetFixedTimetable, batchUpdateFixedTimetable, applyFixedTimetableForFuture, resetFixedTimetable, resetFutureDailyAnnouncements } from '@/controllers/timetableController';
import { queryFnGetSubjects, onSubjectsUpdate } from '@/controllers/subjectController';
import type { TimetableSettings, FixedTimeSlot, DayOfWeek, StudentPermissions } from '@/models/timetable';
import type { Subject } from '@/models/subject';
import { DEFAULT_TIMETABLE_SETTINGS, ConfigurableWeekDays, getDayOfWeekName } from '@/models/timetable';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertCircle, WifiOff, Save, RefreshCw, RotateCcw, Settings2 } from 'lucide-react';
import { SubjectSelector } from '@/components/timetable/SubjectSelector';
import { useAuth } from '@/contexts/AuthContext';
import { areSettingsEqual, areArraysOfObjectsEqual } from '@/lib/utils'; // Import helpers
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export default function SettingsContent() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient();
  const { session } = useAuth();
  const classId = session?.customUser?.classId;

  const [numberOfPeriods, setNumberOfPeriods] = useState<number | string>(DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods);
  const [studentPermissions, setStudentPermissions] = useState<StudentPermissions>(DEFAULT_TIMETABLE_SETTINGS.studentPermissions);
  const [isOffline, setIsOffline] = useState(false);
  const [liveSettings, setLiveSettings] = useState<TimetableSettings | null>(null);
  const [editedFixedTimetable, setEditedFixedTimetable] = useState<FixedTimeSlot[]>([]);
  const [initialFixedTimetableData, setInitialFixedTimetableData] = useState<FixedTimeSlot[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const [isOverwritingFuture, setIsOverwritingFuture] = useState(false);
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);
  
  const userIdForLog = session?.customUser?.id ?? session?.appAdmin?.uid ?? 'system_settings_op';

  useEffect(() => {
    const handleOnline = () => {
      if (isOffline) { 
        setIsOffline(false);
        queryClientHook.invalidateQueries({ queryKey: ['timetableSettings', classId] });
        queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable', classId] });
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

  const handleQueryError = (queryKey: string) => (error: unknown) => {
    console.error(`Settings Query Error (${queryKey}):`, error);
    const isOfflineError = (error as any)?.code === 'unavailable';
    if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setIsOffline(true);
    }
  };

  const { data: initialSettings, isLoading: isLoadingSettings, error: errorSettings } = useQuery({
    queryKey: ['timetableSettings', classId],
    queryFn: queryFnGetTimetableSettings(classId!),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    onError: handleQueryError('timetableSettings'),
    enabled: !isOffline && !!classId,
  });

  useEffect(() => {
    if (isOffline || !classId) return;
    const unsubscribe = onTimetableSettingsUpdate(
      classId,
      (newSettings) => {
        setLiveSettings(prevSettings => areSettingsEqual(prevSettings, newSettings) ? prevSettings : newSettings);
        if (newSettings?.numberOfPeriods !== undefined && numberOfPeriods !== newSettings.numberOfPeriods) {
          setNumberOfPeriods(newSettings.numberOfPeriods);
        }
        if(newSettings?.studentPermissions) {
          setStudentPermissions(newSettings.studentPermissions);
        }
      }, 
      (error) => { console.error("Realtime settings error:", error); setIsOffline(true); }
    );
    return () => unsubscribe();
  }, [isOffline, numberOfPeriods, classId]);

  const settings = useMemo(() => liveSettings ?? initialSettings ?? DEFAULT_TIMETABLE_SETTINGS, [liveSettings, initialSettings]);
  
  useEffect(() => {
    if (settings?.numberOfPeriods !== undefined && (numberOfPeriods === DEFAULT_TIMETABLE_SETTINGS.numberOfPeriods || numberOfPeriods === '')) {
      setNumberOfPeriods(settings.numberOfPeriods);
    }
    if (settings?.studentPermissions) {
        setStudentPermissions(settings.studentPermissions);
    }
  }, [settings, numberOfPeriods]);


  const { data: fetchedFixedTimetable, isLoading: isLoadingFixed, error: errorFixed } = useQuery({
    queryKey: ['fixedTimetable', classId],
    queryFn: queryFnGetFixedTimetable(classId!),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    onError: handleQueryError('fixedTimetable'),
    enabled: !isOffline && !!settings && !!classId,
  });

  const { data: initialSubjects, isLoading: isLoadingSubjects, error: errorSubjects } = useQuery({
    queryKey: ['subjects', classId],
    queryFn: queryFnGetSubjects(classId!),
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    onError: handleQueryError('subjects'),
    enabled: !isOffline && !!classId,
  });

  useEffect(() => {
    if (isOffline || !classId) return;
    const unsubscribe = onSubjectsUpdate(
      classId,
      (newSubjects) => { 
        setLiveSubjects(prevSubjects => areArraysOfObjectsEqual(prevSubjects, newSubjects) ? prevSubjects : newSubjects);
      }, 
      (error) => { console.error("Realtime subjects error:", error); setIsOffline(true); }
    );
    return () => unsubscribe();
  }, [isOffline, classId]);

  const subjects = useMemo(() => liveSubjects.length > 0 ? liveSubjects : initialSubjects ?? [], [liveSubjects, initialSubjects]);

  useEffect(() => {
    if (fetchedFixedTimetable && settings) {
      const completeTimetable: FixedTimeSlot[] = [];
      (settings.activeDays ?? ConfigurableWeekDays).forEach(day => {
        for (let period = 1; period <= settings.numberOfPeriods; period++) {
          const existingSlot = fetchedFixedTimetable.find(slot => slot.day === day && slot.period === period);
          completeTimetable.push(existingSlot ?? { id: `${day}_${period}`, day, period, subjectId: null });
        }
      });
      setEditedFixedTimetable(completeTimetable);
      setInitialFixedTimetableData(completeTimetable);
    } else if (settings && !fetchedFixedTimetable && !isLoadingFixed) {
      const defaultGrid: FixedTimeSlot[] = [];
      (settings.activeDays ?? ConfigurableWeekDays).forEach(day => { for (let period = 1; period <= settings.numberOfPeriods; period++) defaultGrid.push({ id: `${day}_${period}`, day, period, subjectId: null }); });
      setEditedFixedTimetable(defaultGrid);
      setInitialFixedTimetableData(defaultGrid);
    }
  }, [fetchedFixedTimetable, settings, isLoadingFixed]);

  const settingsMutation = useMutation({
    mutationFn: (newSettings: Partial<TimetableSettings>) => updateTimetableSettings(classId!, newSettings, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "設定を更新しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['timetableSettings', classId] });
      await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable', classId] });
    },
    onError: (error: Error) => {
      const isOfflineError = error.message.includes("オフラインのため");
      if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) setIsOffline(true);
      toast({ title: isOfflineError ? "オフライン" : "エラー", description: isOfflineError ? "設定の更新に失敗しました。" : `設定の更新に失敗しました: ${error.message}`, variant: "destructive" });
    },
  });

  const fixedTimetableMutation = useMutation({
    mutationFn: (slots: FixedTimeSlot[]) => batchUpdateFixedTimetable(classId!, slots, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "固定時間割を更新しました。" });
      setInitialFixedTimetableData([...editedFixedTimetable]); // Reflect saved state
      await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable', classId] });
    },
    onError: (error: Error) => {
      const isOfflineError = error.message.includes("オフラインのため");
      if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) setIsOffline(true);
      toast({ title: isOfflineError ? "オフライン" : "エラー", description: isOfflineError ? "固定時間割の更新に失敗しました。" : `固定時間割の更新に失敗しました: ${error.message}`, variant: "destructive" });
    },
  });

  const applyFutureMutation = useMutation({
    mutationFn: () => applyFixedTimetableForFuture(classId!, userIdForLog),
    onSuccess: () => toast({ title: "適用開始", description: "固定時間割の将来への適用を開始しました。" }),
    onError: (error: Error) => {
      const isOfflineError = error.message.includes("オフラインのため");
      if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) setIsOffline(true);
      toast({ title: isOfflineError ? "オフライン" : "エラー", description: isOfflineError ? "固定時間割の適用に失敗しました。" : `固定時間割の適用に失敗しました: ${error.message}`, variant: "destructive" });
    },
  });

  const resetTimetableMutation = useMutation({
    mutationFn: () => resetFixedTimetable(classId!, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "固定時間割を初期化しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable', classId] });
      await queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', classId] }); // Also invalidate daily as they might be reset
      // Rebuild the UI grid based on current settings (now empty)
      const resetGrid: FixedTimeSlot[] = [];
      (settings.activeDays ?? ConfigurableWeekDays).forEach(day => { for (let period = 1; period <= settings.numberOfPeriods; period++) resetGrid.push({ id: `${day}_${period}`, day, period, subjectId: null }); });
      setEditedFixedTimetable(resetGrid);
      setInitialFixedTimetableData(resetGrid);
    },
    onError: (error: Error) => {
      const isOfflineError = error.message.includes("オフラインのため");
      if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) setIsOffline(true);
      toast({ title: isOfflineError ? "オフライン" : "エラー", description: isOfflineError ? "固定時間割の初期化に失敗しました。" : `固定時間割の初期化に失敗しました: ${error.message}`, variant: "destructive" });
    },
    onSettled: () => setIsResetting(false),
  });

  const overwriteFutureMutation = useMutation({
    mutationFn: () => resetFutureDailyAnnouncements(classId!, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "将来の時間割を基本時間割で上書きしました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', classId] }); // Invalidate daily announcements
    },
    onError: (error: Error) => {
      const isOfflineError = error.message.includes("オフラインのため");
      if (isOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) setIsOffline(true);
      toast({ title: isOfflineError ? "オフライン" : "エラー", description: isOfflineError ? "将来の時間割の上書きに失敗しました。" : `将来の時間割の上書きに失敗しました: ${error.message}`, variant: "destructive" });
    },
    onSettled: () => setIsOverwritingFuture(false),
  });

  const handleSaveSettings = () => {
    if (isOffline) { toast({ title: "オフライン", description: "設定を保存できません。", variant: "destructive" }); return; }
    const periods = parseInt(String(numberOfPeriods), 10);
    if (isNaN(periods) || periods < 1 || periods > 12) { toast({ title: "入力エラー", description: "1日の時間数は1から12の間で入力してください。", variant: "destructive" }); return; }
    
    const updates: Partial<TimetableSettings> = {};
    if (settings && periods !== settings.numberOfPeriods) {
        updates.numberOfPeriods = periods;
    }
    if (settings && JSON.stringify(studentPermissions) !== JSON.stringify(settings.studentPermissions)) {
        updates.studentPermissions = studentPermissions;
    }

    if (Object.keys(updates).length > 0) {
        settingsMutation.mutate(updates);
    } else {
        toast({ title: "情報", description: "設定に変更はありませんでした。" });
    }
  };

  const handlePeriodsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string for user input, parse to number on save
    setNumberOfPeriods(value === '' ? '' : (isNaN(parseInt(value, 10)) ? value : parseInt(value, 10)));
  };

  const handlePermissionChange = (permissionKey: keyof StudentPermissions, value: boolean) => {
      setStudentPermissions(prev => ({ ...prev, [permissionKey]: value }));
  };

  const handleSubjectChange = (day: DayOfWeek, period: number, newSubjectId: string | null) => {
    setEditedFixedTimetable(current => current.map(slot => slot.day === day && slot.period === period ? { ...slot, subjectId: newSubjectId } : slot));
  };

  const handleSaveFixedTimetable = () => {
    if (isOffline) { toast({ title: "オフライン", description: "固定時間割を保存できません。", variant: "destructive" }); return; }
    // Filter out slots that might not have full data, though this should be rare with current setup
    fixedTimetableMutation.mutate(editedFixedTimetable.filter(slot => slot?.id && slot?.day && slot?.period !== undefined));
  };
  
  const handleResetTimetable = () => {
    if (isOffline || isResetting) { toast({ title: isOffline ? "オフライン" : "処理中", description: "固定時間割を初期化できません。", variant: "destructive" }); return; }
    setIsResetting(true);
    resetTimetableMutation.mutate();
  };

  const handleOverwriteFuture = () => {
    if (isOffline || isOverwritingFuture) { toast({ title: isOffline ? "オフライン" : "処理中", description: "将来の時間割を上書きできません。", variant: "destructive" }); return; }
    setIsOverwritingFuture(true);
    overwriteFutureMutation.mutate();
  };

  const showLoadingSettings = isLoadingSettings && !isOffline;
  const showErrorSettings = errorSettings && !isOffline;
  const showLoadingFixed = isLoadingFixed && !isOffline;
  const showErrorFixed = errorFixed && !isOffline;
  const showLoadingSubjects = isLoadingSubjects && !isOffline;
  const showErrorSubjects = errorSubjects && !isOffline;

  const hasFixedTimetableChanged = useMemo(() => JSON.stringify(editedFixedTimetable) !== JSON.stringify(initialFixedTimetableData), [editedFixedTimetable, initialFixedTimetableData]);
  const hasSettingsChanged = useMemo(() => {
    if (!settings) return false;
    const periodsChanged = parseInt(String(numberOfPeriods)) !== settings.numberOfPeriods;
    const permissionsChanged = JSON.stringify(studentPermissions) !== JSON.stringify(settings.studentPermissions);
    return periodsChanged || permissionsChanged;
  }, [numberOfPeriods, studentPermissions, settings]);
  
  const tableHeaderCells = [<TableHead key="period-header" className="w-[50px] sm:w-[60px] text-center">時限</TableHead>];
  (settings?.activeDays ?? ConfigurableWeekDays).forEach((day) => {
    tableHeaderCells.push(<TableHead key={`header-${day}`} className="min-w-[150px] sm:min-w-[180px] text-center">{getDayOfWeekName(day)}</TableHead>

);
  });


  return (
    <div> {/* Main wrapper div */}
      <h1 className="text-2xl font-semibold mb-6">設定</h1>

       {isOffline && (
        <Alert variant="destructive" className="mb-6">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>オフライン</AlertTitle>
          <AlertDescription>
            現在オフラインです。設定の表示や変更はできません。接続が回復するまでお待ちください。
          </AlertDescription>
        </Alert>
      )}

      <Card className={`mb-6 ${isOffline ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle>一般設定</CardTitle>
          <CardDescription>クラスの基本設定と学生の権限を管理します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showLoadingSettings ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-1/4" /><Skeleton className="h-10 w-1/2" />
              <Separator className="my-4"/>
              <Skeleton className="h-6 w-1/3" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
            </div>
          ) : showErrorSettings ? (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>エラー</AlertTitle><AlertDescription>基本設定の読み込みに失敗しました。</AlertDescription></Alert>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="numberOfPeriods">1日の時間数</Label>
                <Input id="numberOfPeriods" type="number" min="1" max="12" value={numberOfPeriods} onChange={handlePeriodsChange} className="w-24" disabled={settingsMutation.isPending || isOffline}/>
                <p className="text-sm text-muted-foreground">時間割に表示する1日の時間数を1〜12の間で設定します。</p>
              </div>
              <Separator />
              <div className="space-y-4">
                  <div className="space-y-2">
                      <Label className="flex items-center gap-2"><Settings2 className="h-4 w-4"/>学生の権限設定</Label>
                      <p className="text-sm text-muted-foreground">学生アカウントが実行できる操作を許可または制限します。</p>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                          <Label htmlFor="canEditTimeSlots" className="font-medium">時間割スロットの編集</Label>
                          <p className="text-xs text-muted-foreground">学生が各コマの科目変更や連絡事項を追加できるようにします。</p>
                      </div>
                      <Switch id="canEditTimeSlots" checked={studentPermissions.canEditTimeSlots} onCheckedChange={(val) => handlePermissionChange('canEditTimeSlots', val)} disabled={settingsMutation.isPending || isOffline}/>
                  </div>
                   <div className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                          <Label htmlFor="canEditGeneralAnnouncements" className="font-medium">全体お知らせの編集</Label>
                           <p className="text-xs text-muted-foreground">学生がホーム画面上部のお知らせを編集できるようにします。</p>
                      </div>
                      <Switch id="canEditGeneralAnnouncements" checked={studentPermissions.canEditGeneralAnnouncements} onCheckedChange={(val) => handlePermissionChange('canEditGeneralAnnouncements', val)} disabled={settingsMutation.isPending || isOffline}/>
                  </div>
                   <div className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                          <Label htmlFor="canUseAiSummary" className="font-medium">お知らせのAI要約機能</Label>
                           <p className="text-xs text-muted-foreground">学生がAI要約の生成をリクエストできるようにします。</p>
                      </div>
                      <Switch id="canUseAiSummary" checked={studentPermissions.canUseAiSummary} onCheckedChange={(val) => handlePermissionChange('canUseAiSummary', val)} disabled={settingsMutation.isPending || isOffline}/>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                          <Label htmlFor="canEditAssignments" className="font-medium">課題の管理 (追加/編集/削除)</Label>
                          <p className="text-xs text-muted-foreground">学生が課題一覧を操作できるようにします。</p>
                      </div>
                      <Switch id="canEditAssignments" checked={studentPermissions.canEditAssignments} onCheckedChange={(val) => handlePermissionChange('canEditAssignments', val)} disabled={settingsMutation.isPending || isOffline}/>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                          <Label htmlFor="canEditSubjects" className="font-medium">科目の管理 (追加/編集/削除)</Label>
                          <p className="text-xs text-muted-foreground">学生が科目マスタを編集できるようにします。(強力な権限)</p>
                      </div>
                      <Switch id="canEditSubjects" checked={studentPermissions.canEditSubjects} onCheckedChange={(val) => handlePermissionChange('canEditSubjects', val)} disabled={settingsMutation.isPending || isOffline}/>
                  </div>
                   <div className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                          <Label htmlFor="canAddSchoolEvents" className="font-medium">行事の管理 (追加/編集/削除)</Label>
                          <p className="text-xs text-muted-foreground">学生がカレンダーの行事を編集できるようにします。</p>
                      </div>
                      <Switch id="canAddSchoolEvents" checked={studentPermissions.canAddSchoolEvents} onCheckedChange={(val) => handlePermissionChange('canAddSchoolEvents', val)} disabled={settingsMutation.isPending || isOffline}/>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                          <Label htmlFor="canSubmitInquiries" className="font-medium">お問い合わせの送信</Label>
                          <p className="text-xs text-muted-foreground">学生が管理者宛にお問い合わせを送信できるようにします。</p>
                      </div>
                      <Switch id="canSubmitInquiries" checked={studentPermissions.canSubmitInquiries} onCheckedChange={(val) => handlePermissionChange('canSubmitInquiries', val)} disabled={settingsMutation.isPending || isOffline}/>
                  </div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveSettings} disabled={!hasSettingsChanged || settingsMutation.isPending || showLoadingSettings || isOffline}>
            <Save className="mr-2 h-4 w-4" />
            {settingsMutation.isPending ? '保存中...' : '一般設定を保存'}
          </Button>
           {!hasSettingsChanged && !settingsMutation.isPending && (
              <p className="text-sm text-muted-foreground ml-4 self-center">変更はありません。</p>
            )}
        </CardFooter>
      </Card>


      {/* --- Fixed Timetable Card --- */}
      <Card className={`${isOffline ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle>固定時間割の設定</CardTitle>
          <CardDescription>基本的な曜日ごとの時間割を設定します。保存後、自動的に将来の予定に適用されます。</CardDescription>
        </CardHeader>
        <CardContent>
          {showLoadingSettings || showLoadingFixed || showLoadingSubjects ? (
            <div className="space-y-4">
              {[...Array(settings.numberOfPeriods || 5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : showErrorSettings || showErrorFixed || showErrorSubjects ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>固定時間割または科目の読み込みに失敗しました。{showErrorSubjects ? ' 科目データを確認してください。' : ''}</AlertDescription>
            </Alert>
          ) : editedFixedTimetable.length > 0 && subjects.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{tableHeaderCells.map(cell => cell)}</TableRow></TableHeader>
                <TableBody>
                  {Array.from({ length: settings.numberOfPeriods }, (_, i) => i + 1).map((period) => {
                    const cells = [<TableCell key={`period-cell-${period}`} className="font-medium text-center p-1 sm:p-2">{period}</TableCell>];
                    (settings?.activeDays ?? ConfigurableWeekDays).forEach((day) => {
                      const slot = editedFixedTimetable.find(s => s.day === day && s.period === period);
                      cells.push(
                        <TableCell key={`${day}-${period}-cell`} className="p-1 sm:p-2">
                          <SubjectSelector
                            subjects={subjects}
                            selectedSubjectId={slot?.subjectId ?? null}
                            onValueChange={(newSubId) => handleSubjectChange(day, period, newSubId)}
                            placeholder="科目未設定"
                            disabled={fixedTimetableMutation.isPending || isOffline || isLoadingSubjects}
                            className="w-full text-xs sm:text-sm"
                            classId={classId!}
                          />
                        </TableCell>
                      );
                    });
                    return <TableRow key={period}>{cells.map(cell => cell)}</TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>
          ) : subjects.length === 0 && !isLoadingSubjects ? (
                 <Alert variant="default">
                     <AlertCircle className="h-4 w-4" />
                     <AlertTitle>科目未登録</AlertTitle>
                     <AlertDescription>固定時間割を設定する前に、科目管理ページで科目を登録してください。</AlertDescription>
                 </Alert>
            ) : (
            <p className="text-muted-foreground text-center py-4">時間割データがありません。</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between items-center flex-wrap gap-2">
          <div className="flex gap-2 items-center">
            <Button onClick={handleSaveFixedTimetable} disabled={!hasFixedTimetableChanged || fixedTimetableMutation.isPending || showLoadingFixed || showLoadingSubjects || isOffline} size="sm">
              <Save className="mr-2 h-4 w-4" />
              {fixedTimetableMutation.isPending ? '保存中...' : '固定時間割を保存'}
            </Button>
            {!hasFixedTimetableChanged && !fixedTimetableMutation.isPending && !showLoadingFixed && (
              <p className="text-sm text-muted-foreground self-center">変更はありません。</p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
             <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={resetTimetableMutation.isPending || showLoadingFixed || isOffline} size="sm">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {resetTimetableMutation.isPending ? '初期化中...' : '時間割を初期化'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>時間割を初期化しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    すべての固定時間割の科目が「未設定」に戻ります。将来の時間割も未設定で上書きされます。この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetTimetable} disabled={resetTimetableMutation.isPending || isOffline}>初期化する</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={overwriteFutureMutation.isPending || fixedTimetableMutation.isPending || isResetting || isOffline} title="現在保存されている固定時間割で、将来の変更を含むすべての日付を上書きします" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {overwriteFutureMutation.isPending ? '上書き中...' : '将来の時間割を基本で上書き'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>将来の時間割を上書きしますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    現在保存されている固定時間割の内容で、将来の日付のすべての時間割（手動での変更を含む）を上書きします。この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleOverwriteFuture} disabled={overwriteFutureMutation.isPending || isOffline}>上書きする</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
