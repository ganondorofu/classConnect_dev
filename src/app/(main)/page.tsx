
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { DailyAnnouncementDisplay } from '@/components/announcements/DailyAnnouncementDisplay';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react';
import { format, addDays, subDays, addWeeks, subWeeks, startOfDay, parseISO, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { DailyGeneralAnnouncement } from '@/models/announcement';
import { queryFnGetDailyGeneralAnnouncement } from '@/controllers/timetableController';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

const queryClient = new QueryClient();

function HomePageContent() {
  const searchParams = useSearchParams();
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const { session, loading: authLoading } = useAuth();
  const [isClientMounted, setIsClientMounted] = useState(false);
  const router = useRouter();


  const classId = session?.customUser?.classId;
  const todayStr = currentDate ? format(currentDate, 'yyyy-MM-dd') : '';

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    const dateParam = searchParams.get('date');
    let initialDate = startOfDay(new Date()); 
    if (dateParam) {
      try {
        const parsedDate = parseISO(dateParam);
        if (isValid(parsedDate)) {
          initialDate = startOfDay(parsedDate);
        }
      } catch (e) {
        console.error("Error parsing date parameter:", e);
      }
    }
    setCurrentDate(initialDate);
  }, [searchParams]);

  useEffect(() => {
    // If done loading and there's no session, redirect to login
    if (!authLoading && !session) {
      router.push('/login');
    }
  }, [authLoading, session, router]);


  const { data: dailyGeneralAnnouncement, isLoading: isLoadingGeneral } = useQuery({
    queryKey: ['dailyGeneralAnnouncement', classId, todayStr],
    queryFn: queryFnGetDailyGeneralAnnouncement(classId!, todayStr),
    enabled: !!classId && !!todayStr && !!session,
  });

  const updateCurrentDate = (newDate: Date | null) => {
    if (newDate) {
      const newDateStr = format(startOfDay(newDate), 'yyyy-MM-dd');
      setCurrentDate(startOfDay(newDate));
      router.push(`/?date=${newDateStr}`);
    }
  };

  const handlePreviousDay = () => updateCurrentDate(currentDate ? subDays(currentDate, 1) : null);
  const handleNextDay = () => updateCurrentDate(currentDate ? addDays(currentDate, 1) : null);
  const handleToday = () => updateCurrentDate(new Date());
  const handleDateSelect = (date: Date | undefined) => {
    if (date) updateCurrentDate(date);
  };
  const handlePreviousWeek = () => updateCurrentDate(currentDate ? subWeeks(currentDate, 1) : null);
  const handleNextWeek = () => updateCurrentDate(currentDate ? addWeeks(currentDate, 1) : null);


  if (!isClientMounted || authLoading || !session) {
    return (
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
            <Skeleton className="h-8 w-32 sm:w-48" />
            <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                <Skeleton className="h-9 w-16" />
                <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                <Skeleton className="h-9 w-24 sm:w-28" />
                 <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
            </div>
        </div>
    );
  }
  
  // App Admin doesn't have a class context
  if (session?.appAdmin) {
     return (
             <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>アプリ開発者モード</AlertTitle>
                <AlertDescription>
                   サイドバーから「クラス管理」を選択して、クラスやユーザーを作成してください。
                </AlertDescription>
            </Alert>
     )
  }
  
  // Custom user (student/teacher) must have a classId
  if (!classId && session?.customUser) {
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
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
            <h1 className="text-xl md:text-2xl font-semibold">クラス時間割・連絡</h1>
            <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
              <Button variant="outline" size="sm" onClick={handleToday}>
                <RotateCcw className="mr-1 h-4 w-4" /> 今日
              </Button>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant="ghost" size="icon" onClick={handlePreviousDay} aria-label="前の日" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"ghost"}
                      className={cn("w-[100px] md:w-[130px] justify-center text-center font-normal h-8 px-1 text-xs sm:text-sm", !currentDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                      {currentDate ? format(currentDate, "M月d日 (E)", { locale: ja }) : <span>日付選択</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={currentDate ?? undefined} onSelect={handleDateSelect} initialFocus locale={ja} />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon" onClick={handleNextDay} aria-label="次の日" className="h-8 w-8">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant="ghost" size="icon" onClick={handlePreviousWeek} aria-label="前の週" className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" /> <span className="sr-only">前の週</span>
                </Button>
                <span className="text-xs px-1 text-muted-foreground">週</span>
                <Button variant="ghost" size="icon" onClick={handleNextWeek} aria-label="次の週" className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" /> <span className="sr-only">次の週</span>
                </Button>
              </div>
            </div>
          </div>

          <DailyAnnouncementDisplay
            classId={classId!}
            date={currentDate}
            announcement={dailyGeneralAnnouncement}
            isLoading={isLoadingGeneral || authLoading}
          />

          <div className="mt-6">
            {currentDate && classId && <TimetableGrid classId={classId} currentDate={currentDate} />}
          </div>
        </>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
        <Suspense fallback={
             <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-y-2">
                 <Skeleton className="h-8 w-32 sm:w-48" />
                 <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-center md:justify-end">
                     <Skeleton className="h-9 w-16" />
                     <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                     <Skeleton className="h-9 w-24 sm:w-28" />
                      <div className="flex gap-1"><Skeleton className="h-9 w-9" /><Skeleton className="h-9 w-9" /></div>
                 </div>
             </div>
        }>
          <HomePageContent />
        </Suspense>
    </QueryClientProvider>
  );
}
