
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Assignment, GetAssignmentsFilters, GetAssignmentsSort, AssignmentDuePeriod } from '@/models/assignment';
import { AssignmentDuePeriods } from '@/models/assignment';
import type { Subject } from '@/models/subject';
import { queryFnGetSubjects } from '@/controllers/subjectController';
import { queryFnGetAssignments, deleteAssignment, onAssignmentsUpdate } from '@/controllers/assignmentController';
import { format, parseISO, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, Edit, Trash2, AlertCircle, WifiOff, ChevronUp, ChevronDown, CalendarIcon, Info, Eye, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AssignmentFormDialog from '@/components/assignments/AssignmentFormDialog';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { areArraysOfObjectsEqual } from '@/lib/utils';
import { queryFnGetTimetableSettings, TimetableSettings } from '@/controllers/timetableController';

const queryClient = new QueryClient();

const ALL_SUBJECTS_VALUE = "__ALL_SUBJECTS__";
const OTHER_SUBJECT_VALUE = "__OTHER__";
const ALL_PERIODS_VALUE = "__ALL_PERIODS__";

function AssignmentsPageContent() {
  const [isOffline, setIsOffline] = useState(false);
  const queryClientHook = useQueryClient();
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  const classId = session?.customUser?.classId;

  const [filters, setFilters] = useState<GetAssignmentsFilters>({ includePastDue: false });
  const [sort, setSort] = useState<GetAssignmentsSort>({ field: 'dueDate', direction: 'asc' });
  
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [selectedAssignmentForDetails, setSelectedAssignmentForDetails] = useState<Assignment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [liveAssignments, setLiveAssignments] = useState<Assignment[] | undefined>(undefined);

  const { data: settings } = useQuery<TimetableSettings, Error>({
    queryKey: ['timetableSettings', classId],
    queryFn: queryFnGetTimetableSettings(classId!),
    staleTime: Infinity,
    enabled: !!classId && !isOffline,
  });

  const canStudentEdit = settings?.studentPermissions?.canEditAssignments === true;
  const canPerformActions = session?.customUser?.role === 'class_admin' || (session?.customUser?.role === 'student' && canStudentEdit);


  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
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
  }, []);
  
  const handleQueryError = (queryKey: string) => (error: unknown) => {
    console.error(`Assignments Query Error (${queryKey}):`, error);
    const isFirestoreUnavailable = (error as any)?.code === 'unavailable';
    setIsOffline(isFirestoreUnavailable || (typeof navigator !== 'undefined' && !navigator.onLine));
  };

  const { data: initialAssignments, isLoading, error: queryError } = useQuery<Assignment[], Error>({
    queryKey: ['assignments', classId, filters, sort],
    queryFn: queryFnGetAssignments(classId!, filters, sort),
    staleTime: 1000 * 60 * 1, 
    enabled: !!classId && !isOffline,
    onError: handleQueryError('assignments'),
  });
  
  useEffect(() => {
    if (isOffline || !classId) return;
    const unsubscribe = onAssignmentsUpdate(
      classId,
      (newAssignments) => {
        setLiveAssignments(prev => areArraysOfObjectsEqual(prev, newAssignments) ? prev : newAssignments);
      },
      (err) => {
        console.error("Realtime assignments error:", err);
        handleQueryError('assignments-realtime')(err);
      },
      filters, 
      sort
    );
    return () => unsubscribe();
  }, [isOffline, classId, filters, sort]);

  const assignments = useMemo(() => liveAssignments !== undefined ? liveAssignments : initialAssignments ?? [], [liveAssignments, initialAssignments]);


  const { data: subjects } = useQuery<Subject[], Error>({
    queryKey: ['subjects', classId],
    queryFn: queryFnGetSubjects(classId!),
    staleTime: Infinity,
    enabled: !!classId && !isOffline,
    onError: handleQueryError('subjectsForAssignments'),
  });
  const subjectsMap = useMemo(() => new Map(subjects?.map(s => [s.id, s.name])), [subjects]);

  const userIdForLog = session?.customUser?.id ?? (session?.appAdmin ? session.appAdmin.uid : 'anonymous_assignment_op');

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) => deleteAssignment(classId!, assignmentId, userIdForLog),
    onSuccess: async () => {
      toast({ title: "成功", description: "課題を削除しました。" });
      await queryClientHook.invalidateQueries({ queryKey: ['assignments'] });
      await queryClientHook.invalidateQueries({ queryKey: ['calendarItems'] });
    },
    onError: (err: Error) => {
      toast({ title: "削除失敗", description: err.message, variant: "destructive" });
      if (err.message.includes("オフライン")) setIsOffline(true);
    },
  });
  
  const handleOpenFormModal = (assignment?: Assignment) => {
    setEditingAssignment(assignment || null);
    setIsFormModalOpen(true);
  };

  const handleViewDetails = (assignment: Assignment) => {
    setSelectedAssignmentForDetails(assignment);
    setIsDetailModalOpen(true);
  };
  
  const handleSort = (field: GetAssignmentsSort['field']) => {
    setSort(prevSort => ({
      field,
      direction: prevSort.field === field && prevSort.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIndicator = ({ field }: { field: GetAssignmentsSort['field'] }) => {
    if (sort.field !== field) return null;
    return sort.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  const renderTableHeaders = () => (
    <TableRow>
      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('title')}>
        <div className="flex items-center gap-1">課題名 <SortIndicator field="title" /></div>
      </TableHead>
      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('subjectId')}>
         <div className="flex items-center gap-1">科目 <SortIndicator field="subjectId" /></div>
      </TableHead>
      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('dueDate')}>
        <div className="flex items-center gap-1">提出期限 <SortIndicator field="dueDate" /></div>
      </TableHead>
      <TableHead>提出時限</TableHead>
      <TableHead>内容詳細</TableHead>
      <TableHead className="w-[100px] text-right">操作</TableHead>
    </TableRow>
  );

  const todayString = format(startOfDay(new Date()), 'yyyy-MM-dd');


  if (authLoading || (!session && !isOffline)) {
     return (
        <div className="space-y-4">
          <Skeleton className="h-12 w-1/2 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
    );
  }
  
  if (!classId && !session?.appAdmin) {
     return (
        <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>
                クラス情報が見つかりません。再度ログインしてください。
            </AlertDescription>
        </Alert>
     )
  }


  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-2">
        <h1 className="text-2xl font-semibold">課題一覧</h1>
        {canPerformActions && (
            <Button onClick={() => handleOpenFormModal()} size="sm" disabled={isOffline}>
            <PlusCircle className="mr-2 h-4 w-4" /> 新規課題を追加
            </Button>
        )}
      </div>
      {!canPerformActions && session?.customUser?.role === 'student' &&
        <Alert className="mb-4">
            <Lock className="h-4 w-4" />
            <AlertTitle>読み取り専用</AlertTitle>
            <AlertDescription>現在、課題の追加や編集はクラス管理者によって制限されています。</AlertDescription>
        </Alert>
      }

      {isOffline && (
        <Alert variant="destructive" className="mb-4">
          <WifiOff className="h-4 w-4" /><AlertTitle>オフライン</AlertTitle>
          <AlertDescription>現在オフラインです。課題の表示や操作が制限される場合があります。</AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">フィルタリングと検索</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-center">
          <Input
            placeholder="タイトル・内容で検索..."
            value={filters.searchTerm || ''}
            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
            disabled={isOffline}
          />
          <Select
            value={filters.subjectId === undefined ? ALL_SUBJECTS_VALUE : (filters.subjectId === null ? OTHER_SUBJECT_VALUE : filters.subjectId)}
            onValueChange={(value) => setFilters(prev => ({ 
              ...prev, 
              subjectId: value === ALL_SUBJECTS_VALUE 
                ? undefined 
                : (value === OTHER_SUBJECT_VALUE ? null : value) 
            }))}
            disabled={isOffline || !subjects}
          >
            <SelectTrigger><SelectValue placeholder="科目で絞り込み" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUBJECTS_VALUE}>全ての科目</SelectItem>
              <SelectItem value={OTHER_SUBJECT_VALUE}>その他 (学校提出など)</SelectItem>
              {subjects?.map(s => <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn("w-full justify-start text-left font-normal", !filters.dueDateStart && "text-muted-foreground")}
                disabled={isOffline}
              > <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dueDateStart ? format(parseISO(filters.dueDateStart), "yyyy/MM/dd") : <span>開始日で絞り込み</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.dueDateStart ? parseISO(filters.dueDateStart) : undefined} onSelect={(date) => setFilters(prev => ({ ...prev, dueDateStart: date ? format(date, 'yyyy-MM-dd') : null }))} /></PopoverContent>
          </Popover>
           <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn("w-full justify-start text-left font-normal", !filters.dueDateEnd && "text-muted-foreground")}
                disabled={isOffline}
              > <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dueDateEnd ? format(parseISO(filters.dueDateEnd), "yyyy/MM/dd") : <span>終了日で絞り込み</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.dueDateEnd ? parseISO(filters.dueDateEnd) : undefined} onSelect={(date) => setFilters(prev => ({ ...prev, dueDateEnd: date ? format(date, 'yyyy-MM-dd') : null }))} /></PopoverContent>
          </Popover>
           <Select
            value={filters.duePeriod === null || filters.duePeriod === undefined ? ALL_PERIODS_VALUE : filters.duePeriod}
            onValueChange={(value) => setFilters(prev => ({ ...prev, duePeriod: value === ALL_PERIODS_VALUE ? null : (value as AssignmentDuePeriod) }))}
            disabled={isOffline}
          >
            <SelectTrigger><SelectValue placeholder="提出時限で絞り込み" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PERIODS_VALUE}>全ての時限</SelectItem>
              {AssignmentDuePeriods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center space-x-2 col-span-1 sm:col-span-2 md:col-span-1">
            <Checkbox
              id="includePastDueFilter"
              checked={filters.includePastDue === true}
              onCheckedChange={(checked) => setFilters(prev => ({ ...prev, includePastDue: checked === true ? true : false }))} 
              disabled={isOffline}
            />
            <label htmlFor="includePastDueFilter" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              期限切れの課題を含める
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>登録されている課題</CardTitle>
          <CardDescription>提出期限や内容を確認できます。</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !isOffline ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : queryError && !isOffline ? (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>エラー</AlertTitle><AlertDescription>課題一覧の読み込みに失敗しました。</AlertDescription></Alert>
          ) : !assignments || assignments.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">該当する課題はありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>{renderTableHeaders()}</TableHeader>
                <TableBody>
                  {assignments.map((assignment) => {
                    const isPastDue = assignment.dueDate < todayString;
                    return (
                    <TableRow key={assignment.id} className={isPastDue ? "bg-muted/30 dark:bg-muted/20 opacity-70" : ""}>
                      <TableCell 
                        className={cn("font-medium cursor-pointer hover:underline", isPastDue ? "text-muted-foreground" : "")}
                        onClick={() => handleViewDetails(assignment)}
                        title={assignment.title}
                      >
                        {assignment.title}
                      </TableCell>
                      <TableCell className={isPastDue ? "text-muted-foreground" : ""}>{assignment.subjectId ? subjectsMap.get(assignment.subjectId) : (assignment.customSubjectName || 'その他')}</TableCell>
                      <TableCell className={isPastDue ? "text-muted-foreground" : ""}>{format(parseISO(assignment.dueDate), 'yyyy/MM/dd (E)', { locale: ja })}</TableCell>
                      <TableCell className={isPastDue ? "text-muted-foreground" : ""}>{assignment.duePeriod || <span className="text-xs text-muted-foreground italic">指定なし</span>}</TableCell>
                      <TableCell 
                        className={cn("max-w-xs truncate text-sm cursor-pointer hover:underline", isPastDue ? "text-muted-foreground/80" : "text-muted-foreground")} 
                        title={assignment.description}
                        onClick={() => handleViewDetails(assignment)}
                      >
                        {assignment.description && assignment.description.length > 50 ? assignment.description.substring(0,50) + "..." : assignment.description}
                      </TableCell>
                      <TableCell className="text-right">
                        {canPerformActions && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenFormModal(assignment)} className="mr-1 h-8 w-8" disabled={isOffline}>
                              <Edit className="h-4 w-4" /><span className="sr-only">編集</span>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" disabled={isOffline || deleteMutation.isPending}>
                                  <Trash2 className="h-4 w-4" /><span className="sr-only">削除</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>本当に課題「{assignment.title}」を削除しますか？</AlertDialogTitle><AlertDialogDescription>この操作は元に戻せません。</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel disabled={deleteMutation.isPending}>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(assignment.id!)} disabled={deleteMutation.isPending}>削除</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isFormModalOpen && canPerformActions && (
        <AssignmentFormDialog
          isOpen={isFormModalOpen}
          onOpenChange={setIsFormModalOpen}
          subjects={subjects || []}
          editingAssignment={editingAssignment}
          onFormSubmitSuccess={async () => {
             setIsFormModalOpen(false);
             await queryClientHook.invalidateQueries({ queryKey: ['assignments'] });
             await queryClientHook.invalidateQueries({ queryKey: ['calendarItems'] });
          }}
        />
      )}

      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-md md:max-w-lg">
          <DialogHeader>
            <DialogTitle>課題詳細</DialogTitle>
            {selectedAssignmentForDetails && (
                 <DialogDescription>
                    課題名: {selectedAssignmentForDetails.title}
                 </DialogDescription>
            )}
          </DialogHeader>
          {selectedAssignmentForDetails && (
            <ScrollArea className="h-[400px] w-full my-4 pr-3">
                <div className="space-y-3 text-sm">
                    <div>
                        <h4 className="font-semibold mb-0.5">科目:</h4>
                        <p className="text-muted-foreground">{selectedAssignmentForDetails.subjectId ? subjectsMap.get(selectedAssignmentForDetails.subjectId) : (selectedAssignmentForDetails.customSubjectName || 'その他')}</p>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-0.5">提出期限:</h4>
                        <p className="text-muted-foreground">{format(parseISO(selectedAssignmentForDetails.dueDate), 'yyyy年M月d日 (E)', { locale: ja })}</p>
                    </div>
                    {selectedAssignmentForDetails.duePeriod && (
                        <div>
                            <h4 className="font-semibold mb-0.5">提出時限:</h4>
                            <p className="text-muted-foreground">{selectedAssignmentForDetails.duePeriod}</p>
                        </div>
                    )}
                    <div>
                        <h4 className="font-semibold mb-0.5">内容:</h4>
                        <p className="text-muted-foreground whitespace-pre-wrap bg-muted/50 p-2 rounded-md">{selectedAssignmentForDetails.description}</p>
                    </div>
                    {selectedAssignmentForDetails.submissionMethod && (
                        <div>
                            <h4 className="font-semibold mb-0.5">提出方法:</h4>
                            <p className="text-muted-foreground">{selectedAssignmentForDetails.submissionMethod}</p>
                        </div>
                    )}
                    {selectedAssignmentForDetails.targetAudience && (
                        <div>
                            <h4 className="font-semibold mb-0.5">対象者:</h4>
                            <p className="text-muted-foreground">{selectedAssignmentForDetails.targetAudience}</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

export default function AssignmentsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AssignmentsPageContent />
    </QueryClientProvider>
  );
}
