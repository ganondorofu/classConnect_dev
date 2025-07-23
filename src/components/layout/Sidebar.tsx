

"use client";

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  LayoutDashboard,
  Settings,
  History,
  BookMarked,
  HelpCircle,
  CalendarDays,
  MessageSquarePlus,
  ShieldQuestion,
  ScrollText,
  ClipboardList,
  X,
  Users,
  Activity,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { queryFnGetTimetableSettings } from '@/controllers/timetableController';
import { TimetableSettings } from '@/models/timetable';


interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const baseCommonLinks = [
  { href: '/', label: '時間割表', icon: LayoutDashboard },
  { href: '/calendar', label: 'カレンダー', icon: CalendarDays },
];

const conditionalLinks = {
  assignments: { href: '/assignments', label: '課題一覧', icon: ClipboardList, permissionKey: 'canEditAssignments' as keyof TimetableSettings['studentPermissions'] }, // Even if false, students can view
  contact: { href: '/contact', label: 'お問い合わせ', icon: MessageSquarePlus, permissionKey: 'canSubmitInquiries' as keyof TimetableSettings['studentPermissions'] },
}


const classAdminLinks = [
  { href: '/admin/subjects', label: '科目管理', icon: BookMarked },
  { href: '/admin/settings', label: '時間割設定', icon: Settings },
  { href: '/admin/inquiries', label: '生徒からの問い合わせ', icon: ShieldQuestion },
  { href: '/admin/logs', label: '変更履歴', icon: History },
];

const appAdminLinks = [
    { href: '/dev', label: 'クラス管理', icon: Users },
    { href: '/admin/inquiries', label: '問い合わせ管理', icon: ShieldQuestion },
    { href: '/admin/logs', label: '変更履歴', icon: Activity },
]

const helpLink = { href: '/help', label: 'ヘルプ', icon: HelpCircle };
const updateLogLink = { href: '/updates', label: '更新ログ', icon: ScrollText };


export function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const { session } = useAuth();
  const pathname = usePathname();
  const classId = session?.customUser?.classId;

  const { data: settings } = useQuery<TimetableSettings, Error>({
    queryKey: ['timetableSettings', classId],
    queryFn: queryFnGetTimetableSettings(classId!),
    staleTime: Infinity,
    enabled: !!classId && !!session?.customUser,
  });

  let linksToDisplay: { href: string; label: string; icon: React.ElementType }[] = [];

  if (session?.appAdmin) {
    linksToDisplay = [...appAdminLinks, helpLink, updateLogLink];
  } else if (session?.customUser?.role === 'class_admin') {
    linksToDisplay = [...baseCommonLinks, conditionalLinks.assignments, conditionalLinks.contact, ...classAdminLinks, helpLink, updateLogLink];
  } else if (session?.customUser?.role === 'student') {
    linksToDisplay = [...baseCommonLinks];
    // Conditionally add links for students based on permissions
    if (settings?.studentPermissions) {
        linksToDisplay.push(conditionalLinks.assignments); // Always show assignments for viewing
        if (settings.studentPermissions.canSubmitInquiries) {
            linksToDisplay.push(conditionalLinks.contact);
        }
    }
    linksToDisplay.push(helpLink, updateLogLink);
  } else {
    // Not logged in or loading, show minimal links
    linksToDisplay = [
      { href: '/', label: '時間割表', icon: LayoutDashboard },
      helpLink
    ];
  }


  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[49] bg-black/30 backdrop-blur-sm md:hidden print:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar itself acts as overlay on mobile, fixed on desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 transform flex-col border-r bg-card text-card-foreground shadow-lg transition-transform duration-300 ease-in-out print:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-end border-b p-4 h-14">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
            <X className="h-5 w-5" />
            <span className="sr-only">サイドバーを閉じる</span>
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {linksToDisplay.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={isOpen ? toggleSidebar : undefined}
                  className={cn(
                    buttonVariants({ variant: 'ghost' }),
                    "w-full justify-start",
                    pathname === href ? "bg-primary/10 text-primary dark:bg-primary/20" : "hover:bg-muted"
                  )}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
