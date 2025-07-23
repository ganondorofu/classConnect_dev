
"use client";

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { InquiryType, inquiryTypeLabels, inquiryStatusLabels } from '@/models/inquiry';
import { createInquiry, getInquiriesForUser, queryFnGetTimetableSettings } from '@/controllers/inquiryController';
import { AlertCircle, Send, PlusCircle, Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, QueryClient, QueryClientProvider, useQueryClient as useQueryClientHook } from '@tanstack/react-query';
import type { Inquiry } from '@/models/inquiry';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import type { TimetableSettings } from '@/models/timetable';

const queryClient = new QueryClient();

const baseInquirySchema = z.object({
  title: z.string().min(5, { message: "件名は5文字以上で入力してください。" }).max(100, { message: "件名は100文字以内で入力してください。" }),
  initialMessage: z.string().min(10, { message: "最初のメッセージは10文字以上で入力してください。" }).max(2000, { message: "メッセージは2000文字以内で入力してください。" }),
});

const adminInquirySchema = baseInquirySchema.extend({
  type: z.nativeEnum(InquiryType, { required_error: "種別を選択してください。" }),
});

const studentInquirySchema = baseInquirySchema.extend({
  type: z.nativeEnum(InquiryType).optional(), // Optional for students as it's not in the form
});

type InquiryFormData = z.infer<typeof adminInquirySchema>;

function ContactPageContent() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { session, loading: authLoading } = useAuth();
  const classId = session?.customUser?.classId;
  const userId = session?.customUser?.id;
  const userDisplayName = session?.customUser?.displayName || session?.customUser?.username;
  const userRole = session?.customUser?.role;
  const router = useRouter();
  const queryClientHook = useQueryClientHook();

  const isClassAdmin = userRole === 'class_admin';

  const { data: settings } = useQuery<TimetableSettings, Error>({
    queryKey: ['timetableSettings', classId],
    queryFn: queryFnGetTimetableSettings(classId!),
    staleTime: Infinity,
    enabled: !!classId,
  });

  const canStudentSubmit = settings?.studentPermissions.canSubmitInquiries;
  const canPerformActions = isClassAdmin || canStudentSubmit;

  const { data: pastInquiries, isLoading: isLoadingInquiries } = useQuery<Inquiry[], Error>({
    queryKey: ['userInquiries', classId, userId],
    queryFn: () => getInquiriesForUser(classId!, userId!),
    enabled: !!classId && !!userId && canPerformActions,
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<InquiryFormData>({
    resolver: zodResolver(isClassAdmin ? adminInquirySchema : studentInquirySchema),
    defaultValues: {
      type: undefined,
      title: '',
      initialMessage: '',
    },
  });

  const onSubmit = async (data: InquiryFormData) => {
    if (!classId || !userId || !userDisplayName || !userRole) {
        toast({
            title: "エラー",
            description: "ログイン情報が見つかりません。再度ログインしてください。",
            variant: "destructive",
        });
        return;
    }
    
    const targetRole = userRole === 'class_admin' ? 'app_developer' : 'class_admin';
    
    // For students, default the type. For admins, use the selected value.
    const inquiryType = isClassAdmin ? data.type : InquiryType.OTHER;

    setIsSubmitting(true);
    try {
      await createInquiry(classId, userId, userDisplayName, inquiryType!, data.title, data.initialMessage, targetRole);
      toast({
        title: "お問い合わせ送信完了",
        description: "お問い合わせありがとうございます。返信をお待ちください。",
      });
      reset();
      setShowForm(false);
      queryClientHook.invalidateQueries({ queryKey: ['userInquiries', classId, userId] });
    } catch (error) {
      console.error("Inquiry submission error:", error);
      toast({
        title: "送信エラー",
        description: error instanceof Error ? error.message : "お問い合わせの送信に失敗しました。しばらくしてから再度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return <div>読み込み中...</div>
  }

  if (!session?.customUser) {
    return (
        <div className="container mx-auto py-8 px-4 md:px-0 max-w-2xl">
          <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>ログインが必要です</AlertTitle>
              <AlertDescription>
                お問い合わせ機能を利用するには、ログインしてください。
                <Button className="mt-4" onClick={() => router.push('/login')}>ログインページへ</Button>
              </AlertDescription>
          </Alert>
        </div>
    );
  }

  if (!canPerformActions) {
    return (
        <div className="container mx-auto py-8 px-4 md:px-0 max-w-2xl">
            <Alert>
                <Lock className="h-4 w-4" />
                <AlertTitle>アクセスが制限されています</AlertTitle>
                <AlertDescription>
                    現在、お問い合わせ機能はクラス管理者によって制限されています。
                </AlertDescription>
            </Alert>
        </div>
    );
  }


  const formDescription = isClassAdmin
    ? "アプリ開発者へ、ご意見、ご要望、不具合報告などを送信します。"
    : "クラス管理者へ、ご意見、ご要望などを送信します。";

  return (
      <div className="container mx-auto py-8 px-4 md:px-0 max-w-2xl">
        {showForm ? (
            <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="text-2xl font-bold">新規お問い合わせ作成</CardTitle>
                <CardDescription>{formDescription}</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                
                {isClassAdmin && (
                    <div>
                        <Label htmlFor="type">お問い合わせ種別 <span className="text-destructive">*</span></Label>
                        <Controller
                        name="type"
                        control={control}
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                            <SelectTrigger id="type" className={errors.type ? "border-destructive" : ""}>
                                <SelectValue placeholder="種別を選択してください" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(InquiryType).map((type) => (
                                <SelectItem key={type} value={type}>
                                    {inquiryTypeLabels[type]}
                                </SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                        )}
                        />
                        {errors.type && <p className="text-xs text-destructive mt-1">{errors.type.message}</p>}
                    </div>
                )}

                <div>
                    <Label htmlFor="title">件名 <span className="text-destructive">*</span></Label>
                    <Input id="title" {...register("title")} placeholder="例: ○○の機能について" className={errors.title ? "border-destructive" : ""} disabled={isSubmitting} />
                    {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
                </div>
                <div>
                    <Label htmlFor="initialMessage">メッセージ <span className="text-destructive">*</span></Label>
                    <Textarea
                    id="initialMessage"
                    {...register("initialMessage")}
                    placeholder="具体的な内容をご記入ください (例: 〇〇の機能が動作しません。△△のような機能を追加してほしいです。)"
                    className={`min-h-[150px] ${errors.initialMessage ? "border-destructive" : ""}`}
                    disabled={isSubmitting}
                    />
                    {errors.initialMessage && <p className="text-xs text-destructive mt-1">{errors.initialMessage.message}</p>}
                </div>
                
                </form>
            </CardContent>
             <CardFooter className="flex justify-between p-6">
                <Button variant="ghost" onClick={() => setShowForm(false)} disabled={isSubmitting}>キャンセル</Button>
                <Button type="submit" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
                    <Send className="mr-2 h-4 w-4" />
                    {isSubmitting ? '送信中...' : '送信する'}
                </Button>
            </CardFooter>
            </Card>
        ) : (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>過去のお問い合わせ</CardTitle>
                            <CardDescription>過去のやり取りを確認したり、新規作成ができます。</CardDescription>
                        </div>
                        <Button onClick={() => setShowForm(true)} size="sm">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            新規作成
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingInquiries ? (
                        <div>読み込み中...</div>
                    ) : (pastInquiries?.length ?? 0) === 0 ? (
                        <p className="text-muted-foreground text-center py-4">まだお問い合わせはありません。</p>
                    ) : (
                        <ul className="space-y-2">
                           {pastInquiries?.map(inquiry => (
                               <li key={inquiry.id}>
                                 <button
                                     onClick={() => {/* TODO: Navigate to inquiry detail page */}}
                                     className="w-full text-left p-3 border rounded-md hover:bg-muted transition-colors"
                                 >
                                    <div className="flex justify-between items-start">
                                        <p className="font-semibold">{inquiry.title}</p>
                                        <Badge variant={inquiry.status === 'resolved' ? 'outline' : 'default'}>
                                            {inquiryStatusLabels[inquiry.status]}
                                        </Badge>
                                    </div>
                                     <p className="text-sm text-muted-foreground truncate mt-1">{inquiry.lastMessageSnippet}</p>
                                 </button>
                               </li>
                           ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        )}
      </div>
  );
}

export default function ContactPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <ContactPageContent />
        </QueryClientProvider>
    );
}
