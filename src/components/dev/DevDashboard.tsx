"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClass, createUsersInBulk, getAllClasses, getUsersForClass, updateUserPassword, setUserDisabledStatus } from '@/controllers/userController';
import type { ClassMetadata } from '@/models/class';
import type { CustomUser } from '@/models/user';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, UserPlus, Table as TableIcon, AlertCircle, Wand2, RefreshCw, FileText, Download, KeyRound, UserCog, UserCheck, UserX, ArrowUpDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';


interface UserRowData {
  key: number;
  role: 'class_admin' | 'student';
  username: string;
  password?: string;
  displayName: string;
  error?: string;
}

type SortKey = keyof CustomUser | null;
type SortDirection = 'asc' | 'desc';

const generateRandomString = (length: number): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const sampleCsvData = `role,username,password,displayName
class_admin,teacher01,securePass1,山田先生
student,student01,sPass001,出席番号1番
student,student02,sPass002,出席番号2番
`;

function UserManagementPanel() {
    const { toast } = useToast();
    const [selectedClassIdForMgmt, setSelectedClassIdForMgmt] = useState<string>('');
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [selectedUserForPassword, setSelectedUserForPassword] = useState<CustomUser | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('displayName');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const { data: classes, isLoading: isLoadingClasses } = useQuery<ClassMetadata[], Error>({
        queryKey: ['allClassesForMgmt'],
        queryFn: getAllClasses,
    });

    const { data: users, isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery<CustomUser[], Error>({
        queryKey: ['usersForClass', selectedClassIdForMgmt],
        queryFn: () => getUsersForClass(selectedClassIdForMgmt),
        enabled: !!selectedClassIdForMgmt,
    });

    const sortedUsers = useMemo(() => {
        if (!users || !sortKey) return users;
        return [...users].sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];
            if (valA === undefined || valB === undefined) return 0;
            const comparison = String(valA).localeCompare(String(valB), 'ja');
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [users, sortKey, sortDirection]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };
    
    const passwordMutation = useMutation({
        mutationFn: ({ userId, password }: { userId: string, password: string }) => updateUserPassword(userId, password),
        onSuccess: () => {
            toast({ title: '成功', description: 'パスワードを更新しました。' });
            setIsPasswordModalOpen(false);
            setNewPassword('');
            setSelectedUserForPassword(null);
        },
        onError: (error: Error) => {
            toast({ title: 'エラー', description: `パスワードの更新に失敗: ${error.message}`, variant: 'destructive' });
        }
    });

    const disableUserMutation = useMutation({
        mutationFn: ({ userId, disabled }: { userId: string, disabled: boolean }) => setUserDisabledStatus(userId, disabled),
        onSuccess: (_, { disabled }) => {
            toast({ title: '成功', description: `ユーザーアカウントを${disabled ? '無効化' : '有効化'}しました。` });
            refetchUsers();
        },
        onError: (error: Error) => {
            toast({ title: 'エラー', description: `アカウント状態の変更に失敗: ${error.message}`, variant: 'destructive' });
        }
    });

    const handleOpenPasswordModal = (user: CustomUser) => {
        setSelectedUserForPassword(user);
        setNewPassword('');
        setIsPasswordModalOpen(true);
    };

    const handlePasswordChange = () => {
        if (!selectedUserForPassword || !newPassword.trim() || newPassword.length < 6) {
            toast({ title: '入力エラー', description: '新しいパスワードは6文字以上で入力してください。', variant: 'destructive' });
            return;
        }
        passwordMutation.mutate({ userId: selectedUserForPassword.id, password: newPassword });
    };
    
    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
        return sortDirection === 'asc' ? <ArrowUpDown className="ml-2 h-4 w-4" /> : <ArrowUpDown className="ml-2 h-4 w-4" />;
    };

    return (
        <div className="space-y-4 pt-4">
             <div className="space-y-2">
                <Label htmlFor="class-select-mgmt">クラスを選択してユーザーを管理</Label>
                <Combobox
                    options={classes?.map(c => ({ value: c.id, label: `${c.className} (${c.classCode})` })) || []}
                    value={selectedClassIdForMgmt}
                    onValueChange={setSelectedClassIdForMgmt}
                    placeholder="クラスを選択..."
                    notFoundText="クラスが見つかりません"
                    searchText="クラスを検索..."
                    disabled={isLoadingClasses}
                />
            </div>
            {selectedClassIdForMgmt && (
                 <div className="rounded-md border max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted/50 z-10">
                            <TableRow>
                                <TableHead className="cursor-pointer" onClick={() => handleSort('displayName')}>
                                    <div className="flex items-center">表示名 {renderSortIcon('displayName')}</div>
                                </TableHead>
                                <TableHead className="cursor-pointer" onClick={() => handleSort('username')}>
                                    <div className="flex items-center">ユーザー名 {renderSortIcon('username')}</div>
                                </TableHead>
                                <TableHead className="cursor-pointer" onClick={() => handleSort('role')}>
                                    <div className="flex items-center">役割 {renderSortIcon('role')}</div>
                                </TableHead>
                                <TableHead className="text-center">アクセス</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoadingUsers ? (
                                <TableRow><TableCell colSpan={5} className="text-center">ユーザーを読み込み中...</TableCell></TableRow>
                            ) : sortedUsers && sortedUsers.length > 0 ? (
                                sortedUsers.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.displayName}</TableCell>
                                        <TableCell className="font-mono text-xs">{user.username}</TableCell>
                                        <TableCell>{user.role === 'class_admin' ? '管理者' : '学生'}</TableCell>
                                        <TableCell className="text-center">
                                            <Switch
                                                checked={!user.disabled}
                                                onCheckedChange={(checked) => disableUserMutation.mutate({ userId: user.id, disabled: !checked })}
                                                aria-label="Account enabled"
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenPasswordModal(user)}>
                                                <KeyRound className="mr-2 h-4 w-4"/>
                                                パスワード変更
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={5} className="text-center">このクラスにはユーザーがいません。</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}
            <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>パスワード変更</DialogTitle>
                        <DialogDescription>
                           ユーザー「{selectedUserForPassword?.displayName}」の新しいパスワードを設定します。この操作は元に戻せません。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label htmlFor="new-password">新しいパスワード (6文字以上)</Label>
                        <Input 
                            id="new-password"
                            type="text"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            disabled={passwordMutation.isPending}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsPasswordModalOpen(false)}>キャンセル</Button>
                        <Button onClick={handlePasswordChange} disabled={passwordMutation.isPending}>
                            {passwordMutation.isPending ? '更新中...' : 'パスワードを更新'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


export function DevDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  // --- States for user generation UI ---
  const [adminCount, setAdminCount] = useState<number>(1);
  const [studentCount, setStudentCount] = useState<number>(30);
  const [adminUsernameTemplate, setAdminUsernameTemplate] = useState('teacher{i}');
  const [studentUsernameTemplate, setStudentUsernameTemplate] = useState('student{i:2}');
  const [adminPasswordTemplate, setAdminPasswordTemplate] = useState('{rand:8}');
  const [studentPasswordTemplate, setStudentPasswordTemplate] = useState('{rand:8}');
  const [userRows, setUserRows] = useState<UserRowData[]>([]);
  const [csvInput, setCsvInput] = useState('');


  const { data: classes, isLoading: isLoadingClasses } = useQuery<ClassMetadata[], Error>({
    queryKey: ['allClasses'],
    queryFn: getAllClasses,
  });

  const createClassMutation = useMutation({
    mutationFn: () => createClass(newClassName, newClassCode),
    onSuccess: () => {
      toast({ title: '成功', description: '新しいクラスを作成しました。' });
      queryClient.invalidateQueries({ queryKey: ['allClasses'] });
      setNewClassName('');
      setNewClassCode('');
    },
    onError: (error: Error) => {
      toast({ title: 'エラー', description: error.message, variant: 'destructive' });
    },
  });

  const downloadCSV = (data: UserRowData[]) => {
    const csvRows = [];
    const headers = ['role', 'username', 'password', 'displayName'];
    csvRows.push(headers.join(','));

    for (const row of data) {
      if (row.error) continue; // Skip rows with errors
      const values = headers.map(header => {
        const escaped = ('' + (row as any)[header]).replace(/"/g, '""'); // Escape double quotes
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const selectedClassName = classes?.find(c => c.id === selectedClassId)?.className || 'users';
    link.setAttribute('download', `classconnect-users-${selectedClassName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const createUsersMutation = useMutation({
    mutationFn: (users: UserRowData[]) => createUsersInBulk(selectedClassId, users.map(({key, error, ...rest}) => ({...rest, password: rest.password || ''})) ),
    onSuccess: (_, variables) => { // variables contains the users passed to mutate
        toast({ 
          title: '成功', 
          description: `${variables.length}人のユーザーを一括作成しました。`,
          action: (
            <Button variant="outline" size="sm" onClick={() => downloadCSV(variables)}>
              <Download className="mr-2 h-4 w-4"/>
              CSVダウンロード
            </Button>
          )
        });
        downloadCSV(variables); // Automatically trigger download
        setUserRows([]); // Clear preview after successful creation
    },
    onError: (error: Error) => {
        toast({ title: 'エラー', description: `ユーザー作成に失敗しました: ${error.message}`, variant: 'destructive' });
    }
  });


  const handleCreateClass = () => {
    if (!newClassName.trim() || !newClassCode.trim()) {
      toast({ title: '入力エラー', description: 'クラス名とクラスコードは必須です。', variant: 'destructive' });
      return;
    }
    createClassMutation.mutate();
  };
  
  const handleGeneratePreview = () => {
    const newUsers: UserRowData[] = [];
    let keyCounter = 0;

    const processTemplate = (template: string, index: number): string => {
        return template
            .replace(/{i}/g, String(index))
            .replace(/{i:2}/g, String(index).padStart(2, '0'))
            .replace(/{rand:(\d+)}/g, (_, len) => generateRandomString(parseInt(len, 10)));
    };

    // Admins
    for (let i = 1; i <= adminCount; i++) {
        const username = processTemplate(adminUsernameTemplate, i);
        const password = processTemplate(adminPasswordTemplate, i);
        newUsers.push({ key: keyCounter++, role: 'class_admin', username, password, displayName: username });
    }
    // Students
    for (let i = 1; i <= studentCount; i++) {
        const username = processTemplate(studentUsernameTemplate, i);
        const password = processTemplate(studentPasswordTemplate, i);
        newUsers.push({ key: keyCounter++, role: 'student', username, password, displayName: username });
    }

    setUserRows(newUsers);
  };

  const handleCsvPreview = () => {
    const lines = csvInput.trim().split('\n');
    if (lines.length <= 1) {
        toast({ title: 'CSVエラー', description: 'ヘッダー行と少なくとも1つのデータ行が必要です。', variant: 'destructive' });
        return;
    }
    const header = lines[0].split(',').map(h => h.trim());
    const newUsers: UserRowData[] = [];
    let keyCounter = 0;

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const rowData: any = {};
        header.forEach((h, index) => {
            rowData[h] = values[index]?.trim();
        });

        const role = rowData.role;
        if (role !== 'class_admin' && role !== 'student') {
             newUsers.push({ key: keyCounter++, role: 'student', username: '', password: '', displayName: '', error: `行 ${i + 1}: 無効な役割'${role}'`});
             continue;
        }
        if (!rowData.username || !rowData.password || !rowData.displayName) {
            newUsers.push({ key: keyCounter++, role, username: '', password: '', displayName: '', error: `行 ${i + 1}: データが不足しています。`});
             continue;
        }

        newUsers.push({
            key: keyCounter++,
            role,
            username: rowData.username,
            password: rowData.password,
            displayName: rowData.displayName
        });
    }
    setUserRows(newUsers);
  };

  const handleCreateUsers = () => {
    if (!selectedClassId) {
        toast({ title: '入力エラー', description: 'ユーザーを追加するクラスを選択してください。', variant: 'destructive' });
        return;
    }
    if(userRows.length === 0) {
        toast({ title: '入力エラー', description: 'プレビューを生成してください。', variant: 'destructive' });
        return;
    }
    if (userRows.some(u => u.error)) {
        toast({ title: '入力エラー', description: 'プレビューにエラーがあります。修正してください。', variant: 'destructive' });
        return;
    }
    createUsersMutation.mutate(userRows);
  };

  const handleUserRowChange = (key: number, field: keyof UserRowData, value: string) => {
    setUserRows(prev => prev.map(row => row.key === key ? { ...row, [field]: value } : row));
  };


  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">アプリ開発者ダッシュボード</h1>
      
      {/* Create New Class */}
      <Card>
        <CardHeader>
          <CardTitle>新規クラス作成</CardTitle>
          <CardDescription>新しいクラスを作成し、クラスコードを設定します。このクラスコードは学生や管理者がログインする際に使用します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="className">クラス名</Label>
            <Input id="className" placeholder="例: 1年A組" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} disabled={createClassMutation.isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="classCode">クラスコード (ログイン用)</Label>
            <Input id="classCode" placeholder="例: 1A-2024" value={newClassCode} onChange={(e) => setNewClassCode(e.target.value)} disabled={createClassMutation.isPending}/>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleCreateClass} disabled={createClassMutation.isPending}>
            {createClassMutation.isPending ? '作成中...' : 'クラスを作成'}
          </Button>
        </CardFooter>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader>
            <CardTitle>ユーザー管理</CardTitle>
            <CardDescription>既存のユーザーのパスワード変更やアカウントの有効化/無効化を行います。</CardDescription>
        </CardHeader>
        <CardContent>
           <Tabs defaultValue="manage">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="manage"><UserCog className="mr-2 h-4 w-4"/>既存ユーザー管理</TabsTrigger>
                    <TabsTrigger value="create"><UserPlus className="mr-2 h-4 w-4"/>ユーザー一括作成</TabsTrigger>
                </TabsList>
                <TabsContent value="manage">
                    <UserManagementPanel />
                </TabsContent>
                <TabsContent value="create" className="space-y-6 pt-4">
                     <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>重要: パスワードの取り扱い</AlertTitle>
                        <AlertDescription>
                            ここで入力されたパスワードは、データベースに保存される前にハッシュ化されます。元のパスワードを復元することはできません。
                            <strong className="block mt-1">パスワードは6文字以上で設定してください。</strong>
                        </AlertDescription>
                    </Alert>
                    <div className="space-y-2">
                        <Label htmlFor="class-select">対象クラス</Label>
                         <Combobox
                            options={classes?.map(c => ({ value: c.id, label: `${c.className} (${c.classCode})` })) || []}
                            value={selectedClassId}
                            onValueChange={setSelectedClassId}
                            placeholder="クラスを選択..."
                            notFoundText="クラスが見つかりません"
                            searchText="クラスを検索..."
                            disabled={isLoadingClasses || createUsersMutation.isPending}
                        />
                    </div>
                    
                    <Separator />

                    <Tabs defaultValue="template">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="template">テンプレートから生成</TabsTrigger>
                            <TabsTrigger value="csv">CSVからインポート</TabsTrigger>
                        </TabsList>
                        <TabsContent value="template" className="space-y-4 pt-4">
                            <h3 className="font-semibold text-base">ユーザー生成テンプレート</h3>
                            <p className="text-sm text-muted-foreground">
                                テンプレート内の `{'i'}` は連番、`{'i:2'}` は2桁の連番、`{'rand:N'}` はN文字のランダムな英数字に置き換えられます。
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-2 p-4 border rounded-lg">
                                    <Label className="font-medium">管理者アカウント</Label>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="admin-count" className="text-sm">人数</Label>
                                        <Input id="admin-count" type="number" value={adminCount} onChange={(e) => setAdminCount(parseInt(e.target.value, 10))} className="col-span-2 h-8" />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="admin-username" className="text-sm">ユーザー名</Label>
                                        <Input id="admin-username" value={adminUsernameTemplate} onChange={(e) => setAdminUsernameTemplate(e.target.value)} className="col-span-2 h-8" />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="admin-password" className="text-sm">パスワード</Label>
                                        <Input id="admin-password" value={adminPasswordTemplate} onChange={(e) => setAdminPasswordTemplate(e.target.value)} className="col-span-2 h-8" />
                                    </div>
                                </div>
                                <div className="space-y-2 p-4 border rounded-lg">
                                    <Label className="font-medium">学生アカウント</Label>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="student-count" className="text-sm">人数</Label>
                                        <Input id="student-count" type="number" value={studentCount} onChange={(e) => setStudentCount(parseInt(e.target.value, 10))} className="col-span-2 h-8" />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="student-username" className="text-sm">ユーザー名</Label>
                                        <Input id="student-username" value={studentUsernameTemplate} onChange={(e) => setStudentUsernameTemplate(e.target.value)} className="col-span-2 h-8" />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-2">
                                        <Label htmlFor="student-password" className="text-sm">パスワード</Label>
                                        <Input id="student-password" value={studentPasswordTemplate} onChange={(e) => setStudentPasswordTemplate(e.target.value)} className="col-span-2 h-8" />
                                    </div>
                                </div>
                            </div>
                            <div className="text-center pt-2">
                                <Button onClick={handleGeneratePreview} variant="outline" disabled={createUsersMutation.isPending}>
                                    <Wand2 className="mr-2 h-4 w-4"/>
                                    プレビューを生成
                                </Button>
                            </div>
                        </TabsContent>
                        <TabsContent value="csv" className="space-y-4 pt-4">
                            <h3 className="font-semibold text-base">CSVデータ入力</h3>
                            <p className="text-sm text-muted-foreground">
                                以下のテキストエリアにCSV形式でユーザーデータを貼り付けてください。ヘッダー行 (`role,username,password,displayName`) が必要です。
                                役割(role)は `class_admin` または `student` を指定してください。
                            </p>
                            <Textarea 
                                value={csvInput}
                                onChange={(e) => setCsvInput(e.target.value)}
                                placeholder="role,username,password,displayName..."
                                className="min-h-[150px] font-mono text-xs"
                            />
                            <div className="flex justify-center gap-4">
                                <Button onClick={() => setCsvInput(sampleCsvData)} variant="secondary" size="sm">
                                サンプルCSVを入力
                                </Button>
                                <Button onClick={handleCsvPreview} variant="outline">
                                    <FileText className="mr-2 h-4 w-4"/>
                                    CSVをプレビュー
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>


                    {userRows.length > 0 && (
                        <div className="space-y-2 pt-6">
                            <div className="flex justify-between items-center">
                                <Label><TableIcon className="inline-block mr-2 h-4 w-4" />ユーザー作成プレビュー ({userRows.length}件)</Label>
                                <Button variant="ghost" size="sm" onClick={() => setUserRows([])} disabled={createUsersMutation.isPending}>
                                    クリア
                                </Button>
                            </div>
                            <div className="rounded-md border max-h-80 overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted/50 z-10">
                                        <TableRow>
                                            <TableHead className="w-[120px]">役割</TableHead>
                                            <TableHead>ユーザー名</TableHead>
                                            <TableHead>パスワード</TableHead>
                                            <TableHead>表示名</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {userRows.map((user) => (
                                            <TableRow key={user.key} className={user.error ? 'bg-destructive/10' : ''}>
                                                {user.error ? (
                                                    <TableCell colSpan={4} className="text-destructive-foreground">
                                                        <p className="font-semibold text-destructive">{user.error}</p>
                                                    </TableCell>
                                                ) : (
                                                <>
                                                    <TableCell>
                                                        <Select value={user.role} onValueChange={(value) => handleUserRowChange(user.key, 'role', value)}>
                                                            <SelectTrigger className="h-8">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="class_admin">管理者</SelectItem>
                                                                <SelectItem value="student">学生</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input value={user.username} onChange={(e) => handleUserRowChange(user.key, 'username', e.target.value)} className="h-8 font-mono text-xs"/>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input value={user.password} onChange={(e) => handleUserRowChange(user.key, 'password', e.target.value)} className="h-8 font-mono text-xs" />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input value={user.displayName} onChange={(e) => handleUserRowChange(user.key, 'displayName', e.target.value)} className="h-8" />
                                                    </TableCell>
                                                </>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                     <div className="pt-4">
                        <Button onClick={handleCreateUsers} disabled={createUsersMutation.isPending || !selectedClassId || userRows.length === 0 || userRows.some(u => u.error)}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            {createUsersMutation.isPending ? '作成中...' : `${userRows.length}人のユーザーを作成`}
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>

    </div>
  );
}
