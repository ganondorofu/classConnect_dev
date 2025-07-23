
"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { queryFnGetInquiriesForAdmin, updateInquiryStatus, getInquiryMessages, onInquiryMessagesUpdate, addInquiryMessage } from '@/controllers/inquiryController';
import type { Inquiry, InquiryMessage } from '@/models/inquiry';
import { InquiryStatus, inquiryTypeLabels, inquiryStatusLabels } from '@/models/inquiry';
import { format, formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, WifiOff, MessageSquareWarning, Info, Send, CornerDownLeft, CircleUser, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getAllClasses } from '@/controllers/userController';
import type { ClassMetadata } from '@/models/class';
import { Combobox } from '@/components/ui/combobox';


export default function InquiriesPage() {
  const [isOffline, setIsOffline] = useState(false);
  const queryClientHook = useQueryClient();
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  
  const [selectedClassId, setSelectedClassId] = useState<string | null>(session?.customUser?.classId ?? null);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  
  const [messages, setMessages] = useState<InquiryMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);


  const { data: classes, isLoading: isLoadingClasses } = useQuery<ClassMetadata[], Error>({
      queryKey: ['allClassesForInquiries'],
      queryFn: getAllClasses,
      enabled: session?.appAdmin === true, // Only app admins need to fetch all classes
  });

  useEffect(() => {
    // If user is a class admin, their class is pre-selected.
    // If user is an app admin and there are classes, pre-select the first one.
    if (session?.customUser?.classId) {
      setSelectedClassId(session.customUser.classId);
    } else if (session?.appAdmin && classes && classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [session, classes, selectedClassId]);

  const { data: allInquiries, isLoading: isLoadingInquiries, error: errorInquiries, refetch: refetchInquiries } = useQuery<Inquiry[], Error>({
    queryKey: ['inquiriesForAdmin', selectedClassId],
    queryFn: queryFnGetInquiriesForAdmin(selectedClassId!),
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: isOffline ? false : 1000 * 60 * 5, // 5 minutes
    enabled: !!selectedClassId && !isOffline,
  });

  // Filter inquiries based on the logged-in user's role
  const inquiries = useMemo(() => {
    if (!allInquiries) return [];
    if (session?.appAdmin) {
      return allInquiries.filter(i => i.targetRole === 'app_developer');
    }
    if (session?.customUser?.role === 'class_admin') {
      return allInquiries.filter(i => i.targetRole === 'class_admin');
    }
    return [];
  }, [allInquiries, session]);


  const { data: initialMessages, isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery<InquiryMessage[], Error>({
    queryKey: ['inquiryMessages', selectedClassId, selectedInquiry?.id],
    queryFn: () => getInquiryMessages(selectedClassId!, selectedInquiry!.id!),
    enabled: !!selectedInquiry && !!selectedClassId,
  });

  useEffect(() => {
      setMessages(initialMessages ?? []);
  },[initialMessages])

  // Real-time listener for messages
  useEffect(() => {
    if (!selectedInquiry || !selectedClassId) {
        setMessages([]);
        return;
    };
    
    const unsubscribe = onInquiryMessagesUpdate(
      selectedClassId,
      selectedInquiry.id!,
      (newMessages) => {
        setMessages(newMessages);
      },
      (error) => {
        console.error("Messages snapshot error:", error);
        toast({ title: "エラー", description: "メッセージのリアルタイム更新に失敗しました。", variant: "destructive" });
      }
    );

    return () => unsubscribe();
  }, [selectedInquiry, selectedClassId, toast]);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaViewportRef.current) {
        setTimeout(() => {
             if (scrollAreaViewportRef.current) {
                scrollAreaViewportRef.current.scrollTo({
                    top: scrollAreaViewportRef.current.scrollHeight,
                    behavior: 'smooth'
                });
             }
        }, 100);
    }
  }, [messages, selectedInquiry]);


  const updateStatusMutation = useMutation({
    mutationFn: ({ inquiryId, status }: { inquiryId: string; status: InquiryStatus }) => 
      updateInquiryStatus(selectedClassId!, inquiryId, status, session?.customUser?.id ?? session?.appAdmin?.uid ?? 'system_admin_inquiry'),
    onSuccess: (data, variables) => {
      toast({ title: "ステータス更新成功", description: "ステータスを更新しました。" });
      refetchInquiries();
    },
    onError: (error: Error, variables) => {
      toast({ title: "ステータス更新失敗", description: `ステータス更新に失敗: ${error.message}`, variant: "destructive" });
    },
  });

  const handleStatusChange = (inquiryId: string, newStatus: InquiryStatus) => {
    if (isOffline || updateStatusMutation.isPending) return;
    updateStatusMutation.mutate({ inquiryId, status: newStatus });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedInquiry || !selectedClassId || isSending) return;

    setIsSending(true);
    const senderId = session?.appAdmin?.uid ?? session?.customUser?.id ?? 'unknown_admin';
    const senderName = session?.appAdmin?.name ?? session?.customUser?.displayName ?? '管理者';
    const senderRole = session?.appAdmin ? 'developer' : 'admin';

    try {
        await addInquiryMessage(selectedClassId, selectedInquiry.id!, senderId, senderRole, senderName, newMessage);
        setNewMessage('');
        refetchInquiries(); // To update lastMessageSnippet etc.
    } catch(e) {
        toast({ title: "送信失敗", description: `メッセージの送信に失敗しました: ${e instanceof Error ? e.message : String(e)}`, variant: "destructive"});
    } finally {
        setIsSending(false);
    }
  };


  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    try {
      const dateObject = timestamp instanceof Date ? timestamp : timestamp.toDate();
      if (isNaN(dateObject.getTime())) return 'Invalid Date';
      return formatDistanceToNow(dateObject, { addSuffix: true, locale: ja });
    } catch (e) { return 'Invalid Date'; }
  };
  
  const getStatusBadgeVariant = (status: InquiryStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case InquiryStatus.NEW: return "default"; 
      case InquiryStatus.IN_PROGRESS: return "secondary"; 
      case InquiryStatus.RESOLVED: return "outline"; 
      case InquiryStatus.WONT_FIX: return "destructive"; 
      default: return "outline";
    }
  };

  const isLoading = isLoadingInquiries || authLoading || isLoadingClasses;
  const hasError = !!errorInquiries;

  if (authLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
            <Skeleton className="h-12 w-1/2 mb-4" />
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-8 w-3/4" />
        </div>
    );
  }
  
  if (!selectedClassId && !session?.appAdmin) {
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">お問い合わせ管理</h1>
        {session?.appAdmin && (
            <Combobox
                options={classes?.map(c => ({ value: c.id, label: `${c.className} (${c.classCode})` })) || []}
                value={selectedClassId ?? ""}
                onValueChange={(val) => {
                    setSelectedClassId(val); 
                    setSelectedInquiry(null);
                }}
                placeholder="クラスを選択..."
                notFoundText="クラスが見つかりません"
                searchText="クラスを検索..."
                disabled={isLoadingClasses}
                className="w-[280px]"
            />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 h-[calc(100vh-12rem)]">
        {/* Inquiry List */}
        <Card className="md:col-span-1 lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>受信箱</CardTitle>
            <CardDescription>問い合わせを選択して返信します。</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow overflow-y-auto p-0">
            {isLoading ? (
                <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : hasError ? (
                <Alert variant="destructive" className="m-4"><AlertCircle className="h-4 w-4" /><AlertTitle>エラー</AlertTitle><AlertDescription>問い合わせ一覧の読み込みに失敗しました。</AlertDescription></Alert>
            ) : !inquiries || inquiries.length === 0 ? (
                <div className="text-center py-10 px-4">
                    <MessageSquareWarning className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-2 text-sm font-semibold text-muted-foreground">問い合わせはありません</h3>
                </div>
            ) : (
                <Table>
                    <TableBody>
                        {inquiries.map(inquiry => (
                            <TableRow 
                                key={inquiry.id} 
                                onClick={() => setSelectedInquiry(inquiry)}
                                className={`cursor-pointer ${selectedInquiry?.id === inquiry.id ? 'bg-muted hover:bg-muted' : ''}`}
                            >
                                <TableCell className="p-3">
                                    <div className="font-semibold text-sm truncate">{inquiry.title}</div>
                                    <div className="text-xs text-muted-foreground truncate">{inquiry.userDisplayName}</div>
                                    <p className="text-xs text-muted-foreground truncate mt-1">{inquiry.lastMessageSnippet}</p>
                                    <div className="flex justify-between items-center mt-2">
                                        <Badge variant={getStatusBadgeVariant(inquiry.status)} className="text-[10px] px-1.5 py-0.5">{inquiryStatusLabels[inquiry.status]}</Badge>
                                        <div className="text-xs text-muted-foreground">{formatTimestamp(inquiry.lastMessageAt)}</div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
          </CardContent>
        </Card>

        {/* Chat View */}
        <Card className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
            {!selectedInquiry ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <CornerDownLeft className="h-10 w-10 mb-2"/>
                    <p>問い合わせを選択して詳細を表示</p>
                </div>
            ) : (
                <>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                           <div>
                            <CardTitle className="truncate leading-snug">{selectedInquiry.title}</CardTitle>
                            <CardDescription className="mt-1">
                                {inquiryTypeLabels[selectedInquiry.type]} by {selectedInquiry.userDisplayName}
                            </CardDescription>
                           </div>
                           <div className="flex-shrink-0">
                               <Select
                                value={selectedInquiry.status}
                                onValueChange={(value) => handleStatusChange(selectedInquiry.id!, value as InquiryStatus)}
                                disabled={isOffline || updateStatusMutation.isPending}
                                >
                                <SelectTrigger className="h-9 text-xs w-[140px]">
                                    <SelectValue placeholder="ステータス選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(InquiryStatus).map((s) => (
                                    <SelectItem key={s} value={s} className="text-xs">
                                        <Badge variant={getStatusBadgeVariant(s)} className="mr-2 w-16 justify-center text-[10px] px-1.5 py-0.5">
                                        {inquiryStatusLabels[s]}
                                        </Badge>
                                    </SelectItem>
                                    ))}
                                </SelectContent>
                                </Select>
                           </div>
                        </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="flex-grow p-0 overflow-hidden">
                        <ScrollArea className="h-full" viewportRef={scrollAreaViewportRef}>
                           <div className="p-4 space-y-4">
                            {isLoadingMessages ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-16 w-3/4 self-start rounded-lg"/>
                                    <Skeleton className="h-20 w-3/4 self-end rounded-lg"/>
                                    <Skeleton className="h-12 w-1/2 self-start rounded-lg"/>
                                </div>
                            ) : messages.map((msg) => {
                                const isAdminOrDev = msg.senderRole === 'admin' || msg.senderRole === 'developer';
                                return (
                                <div key={msg.id} className={`flex items-end gap-2 ${isAdminOrDev ? 'justify-end' : 'justify-start'}`}>
                                    {!isAdminOrDev && <CircleUser className="h-8 w-8 text-muted-foreground mb-4"/>}
                                    <div className={`flex flex-col space-y-1 text-sm max-w-xs mx-2 ${isAdminOrDev ? 'items-end' : 'items-start'}`}>
                                        <div className={`px-4 py-2 rounded-lg inline-block ${isAdminOrDev ? 'rounded-br-none bg-primary text-primary-foreground' : 'rounded-bl-none bg-muted'}`}>
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {msg.senderName} - {formatTimestamp(msg.createdAt)}
                                        </span>
                                    </div>
                                    {isAdminOrDev && <ShieldCheck className="h-8 w-8 text-muted-foreground mb-4"/>}
                                </div>
                                );
                            })}
                           </div>
                        </ScrollArea>
                    </CardContent>
                    <div className="p-4 border-t">
                        <div className="relative">
                            <Input
                                placeholder="メッセージを入力..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                                disabled={isSending}
                                className="pr-12"
                            />
                            <Button size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={handleSendMessage} disabled={isSending || !newMessage.trim()}>
                                {isSending ? <Skeleton className="h-4 w-4 rounded-full" /> : <Send className="h-4 w-4"/>}
                                <span className="sr-only">送信</span>
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </Card>
      </div>
    </>
  );
}
