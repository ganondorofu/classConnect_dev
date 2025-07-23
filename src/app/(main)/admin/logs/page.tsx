
"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getLogs } from '@/controllers/timetableController';
import { rollbackAction } from '@/services/logService';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertCircle, WifiOff, RotateCcw, Lock, Info, Activity } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Combobox } from '@/components/ui/combobox';
import type { ClassMetadata } from '@/models/class';
import { getAllClasses } from '@/controllers/userController';

export default function LogsPage() {
  const [isOffline, setIsOffline] = useState(false);
  const queryClientHook = useQueryClient();
  const { toast } = useToast();
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const { session, loading: authLoading } = useAuth();
  
  // For App Admins, this will be set via Combobox. For Class Admins, it's from the session.
  const [selectedClassId, setSelectedClassId] = useState<string | null>(session?.customUser?.classId ?? null);

  useEffect(() => {
    if (session?.customUser?.classId) {
      setSelectedClassId(session.customUser.classId);
    }
  }, [session?.customUser?.classId]);


  const { data: classes, isLoading: isLoadingClasses } = useQuery<ClassMetadata[], Error>({
    queryKey: ['allClassesForLogs'],
    queryFn: getAllClasses,
    enabled: session?.appAdmin === true, // Only app admins need to fetch all classes
  });

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof navigator !== 'undefined') setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleQueryError = (error: unknown) => {
    console.error("Log Query Error:", error);
    const isOfflineError = (error as any)?.code === 'unavailable';
    setIsOffline(isOfflineError || !navigator.onLine);
  };

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['actionLogs', selectedClassId],
    queryFn: () => getLogs(selectedClassId!, 100),
    staleTime: 1000 * 60,
    refetchInterval: isOffline ? false : 1000 * 60 * 5,
    onError: handleQueryError,
    enabled: !isOffline && !!selectedClassId,
  });

  const userIdForLog = session?.customUser?.id ?? `app_developer_${session?.appAdmin?.uid ?? 'unknown'}`;

  const rollbackMutation = useMutation({
    mutationFn: (logId: string) => rollbackAction(selectedClassId!, logId, userIdForLog),
    onSuccess: (data, logId) => {
      toast({ title: "ロールバック/取り消し 成功", description: `ログID: ${logId} の操作を元に戻しました/取り消しました。` });
      queryClientHook.invalidateQueries({ queryKey: ['actionLogs', selectedClassId] });
      queryClientHook.invalidateQueries({ queryKey: ['timetableSettings', selectedClassId] });
      queryClientHook.invalidateQueries({ queryKey: ['fixedTimetable', selectedClassId] });
      queryClientHook.invalidateQueries({ queryKey: ['dailyAnnouncements', selectedClassId] });
      queryClientHook.invalidateQueries({ queryKey: ['dailyGeneralAnnouncement', selectedClassId] });
      queryClientHook.invalidateQueries({ queryKey: ['subjects', selectedClassId] });
      queryClientHook.invalidateQueries({ queryKey: ['schoolEvents', selectedClassId] });
    },
    onError: (error: Error, logId) => {
      toast({ title: "ロールバック/取り消し 失敗", description: `ログID: ${logId} の操作を元に戻せませんでした: ${error.message}`, variant: "destructive", duration: 7000 });
      if (!navigator.onLine) setIsOffline(true);
    },
    onSettled: () => setRollingBackId(null),
  });

  const handleRollback = (logId: string) => {
    if (isOffline || rollingBackId) return;
    setRollingBackId(logId);
    rollbackMutation.mutate(logId);
  };

  const isRollbackPossible = (action: string): boolean => {
    const nonReversibleActions = ['apply_fixed_timetable_future', 'reset_future_daily_announcements', 'initialize_settings', 'rollback_action_failed', 'rollback_rollback_action'];
    return !nonReversibleActions.includes(action);
  };

  const formatTimestamp = (timestamp: Date | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      const dateObject = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (isNaN(dateObject.getTime())) return 'Invalid Date';
      return format(dateObject, 'yyyy/MM/dd HH:mm:ss', { locale: ja });
    } catch (e) { return 'Invalid Date'; }
  };

  const getActionDescription = (action: string): string => {
    const descriptions: { [key: string]: string } = {
      'update_settings': '時間割設定変更', 'initialize_settings': '時間割設定初期化',
      'update_fixed_slot': '固定時間割更新', 'upsert_announcement': '連絡(特定日) 更新/作成',
      'delete_announcement': '連絡(特定日) 削除', 'add_event': '行事追加',
      'update_event': '行事更新', 'delete_event': '行事削除',
      'add_subject': '科目追加', 'update_subject': '科目更新', 'delete_subject': '科目削除',
      'batch_update_fixed_timetable': '固定時間割一括更新', 'apply_fixed_timetable_future': '固定時間割の将来適用',
      'apply_fixed_timetable_future_error': '固定時間割の将来適用エラー', 'reset_fixed_timetable': '固定時間割リセット',
      'reset_future_daily_announcements': '将来の連絡リセット', 'upsert_general_announcement': '全体連絡 更新/作成',
      'delete_general_announcement': '全体連絡 削除', 'rollback_action': '操作のロールバック',
      'rollback_action_failed': 'ロールバック失敗', 'rollback_rollback_action': 'ロールバックの取り消し(元操作再適用)',
      'batch_upsert_announcements': 'お知らせ一括更新',
      'dev_update_password': '（開発者）パスワード変更',
      'dev_set_user_disabled': '（開発者）アカウント状態変更',
    };
    return descriptions[action] || action;
  };

  const renderDetails = (details: any): React.ReactNode => {
    try {
      if (!details) return '詳細なし';
      if (details.originalLogId || details.originalRollbackLogId || details.reappliedOriginalLogId) {
        return (
          <div className="text-xs text-muted-foreground break-all">
            {details.originalLogId && <p>対象ログID: {details.originalLogId}</p>}
            {details.originalAction && <p>元アクション: {getActionDescription(details.originalAction)}</p>}
            {details.originalRollbackLogId && <p>取り消したロールバックID: {details.originalRollbackLogId}</p>}
            {details.reappliedOriginalLogId && <p>再適用した元ログID: {details.reappliedOriginalLogId}</p>}
            {details.reappliedAction && <p>再適用アクション: {getActionDescription(details.reappliedAction)}</p>}
            {details.restoredDocPath && <p>復元/更新パス: {details.restoredDocPath}</p>}
            {details.deletedDocPath && <p>削除パス: {details.deletedDocPath}</p>}
            {details.restoredSlotsCount !== undefined && <p>復元/更新スロット数: {details.restoredSlotsCount}</p>}
            {details.error && <p className="text-destructive">エラー: {details.error}</p>}
          </div>
        );
      }
      const detailString = JSON.stringify(details, null, 2);
      return <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground break-all max-h-24 overflow-y-auto">{detailString}</pre>;
    } catch { return '表示不可'; }
  };

  if (authLoading || isLoadingClasses) {
    return (
        <div className="space-y-4">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-64 w-full" />
        </div>
    );
  }

  const tableHeaders = ['日時', '操作', 'ユーザー', '詳細', '操作'];
  const headerWidths = ['w-[140px] sm:w-[180px]', 'w-[120px] sm:w-[180px]', 'w-[80px] sm:w-[100px]', '', 'w-[100px] text-right'];
  const showLoading = isLoading && !isOffline && !!selectedClassId;
  const showError = !!error && !isOffline && !!selectedClassId;

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-semibold">変更履歴</h1>
        {session?.appAdmin && (
             <Combobox
                options={classes?.map(c => ({ value: c.id, label: `${c.className} (${c.classCode})` })) || []}
                value={selectedClassId ?? ""}
                onValueChange={(val) => setSelectedClassId(val)}
                placeholder="クラスを選択..."
                notFoundText="クラスが見つかりません"
                searchText="クラスを検索..."
                disabled={isLoadingClasses}
                className="w-full sm:w-[280px]"
            />
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity />操作ログ</CardTitle>
          <CardDescription>最近の変更履歴を表示します。一部の操作は元に戻すことができます。</CardDescription>
          {isOffline && (<Alert variant="destructive" className="mt-4"><WifiOff className="h-4 w-4" /><AlertTitle>オフライン</AlertTitle><AlertDescription>現在オフラインです。ログの取得やロールバックはできません。</AlertDescription></Alert>)}
        </CardHeader>
        <CardContent>
          {!selectedClassId ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>クラスを選択してください</AlertTitle>
                <AlertDescription>
                   ログを表示するクラスを上のドロップダウンから選択してください。
                </AlertDescription>
            </Alert>
          ) : showLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : showError ? (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>エラー</AlertTitle><AlertDescription>ログの読み込みに失敗しました。</AlertDescription></Alert>
          ) : !logs || logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">このクラスのログはありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{tableHeaders.map((header, index) => <TableHead key={`${header}-${index}`} className={headerWidths[index]}>{header}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const canRollback = isRollbackPossible(log.action);
                    const isCurrentlyRollingBack = rollingBackId === log.id;
                    const isRollbackLog = log.action === 'rollback_action';
                    const buttonText = isRollbackLog ? '取り消し' : '元に戻す';
                    const dialogTitle = isRollbackLog ? 'ロールバックを取り消しますか？' : '操作を元に戻しますか？';
                    const dialogDescription = isRollbackLog ? `ログID: ${log.id} のロールバック操作を取り消します。元の操作 (${getActionDescription(log.details?.originalAction ?? '')}) が再適用されます。` : `ログID: ${log.id} (${getActionDescription(log.action)}) の操作を元に戻します。`;
                    
                    return (
                        <TableRow key={log.id}>
                            <TableCell className="text-xs sm:text-sm">{formatTimestamp(log.timestamp)}</TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{getActionDescription(log.action)}</TableCell>
                            <TableCell className="text-muted-foreground text-xs sm:text-sm">{log.userId}</TableCell>
                            <TableCell>{renderDetails(log.details)}</TableCell>
                            <TableCell className="text-right">
                            {canRollback && (
                                <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={isOffline || !!rollingBackId} className={`h-8 text-xs sm:text-sm ${isCurrentlyRollingBack ? 'animate-pulse' : ''}`}><RotateCcw className={`mr-1 h-3 w-3 ${isCurrentlyRollingBack ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">{isCurrentlyRollingBack ? '処理中' : buttonText}</span><span className="sm:hidden">{isCurrentlyRollingBack ? '...' : buttonText}</span></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>{dialogTitle}</AlertDialogTitle><AlertDialogDescription>{dialogDescription}<br />この操作は{isRollbackLog ? 'ロールバック取り消し' : 'ロールバック'}ログとして記録されます。<strong className="block mt-2 text-destructive">注意: 複雑な操作や依存関係のある変更は、予期せぬ結果を招く可能性があります。</strong></AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel disabled={isCurrentlyRollingBack}>キャンセル</AlertDialogCancel><AlertDialogAction onClick={() => handleRollback(log.id!)} disabled={isCurrentlyRollingBack}>{buttonText}</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                                </AlertDialog>
                            )}
                            </TableCell>
                        </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
