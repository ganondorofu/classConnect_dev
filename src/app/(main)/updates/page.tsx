
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Save, Trash2 } from 'lucide-react';

interface UpdateEntry {
  version: string;
  date: string;
  title: string;
  type: 'new' | 'fix' | 'improvement';
  details: string[];
}

const initialUpdateLog: UpdateEntry[] = [
    {
    version: "1.2.0",
    date: "2024-05-24",
    title: "管理者機能の強化とUI改善",
    type: 'improvement',
    details: [
      "【管理者向け】開発者ダッシュボードにユーザー管理機能を追加しました。クラスに所属するユーザーのパスワード変更や、アカウントの有効化/無効化が可能です。",
      "【管理者向け】開発者ダッシュボードのクラス選択やユーザー管理画面で、項目を検索・ソートできるようになり、管理効率が向上しました。",
      "【管理者向け】開発者も各クラスの変更履歴を確認し、ロールバック操作を行えるようになりました。",
      "【UI改善】アプリケーション全体で用語（例：「生徒」→「学生」）を統一し、より分かりやすくなりました。",
      "【修正】一部のページでヘッダーが二重に表示されたり、表示されない問題を修正しました。",
    ],
  },
  {
    version: "1.1.0",
    date: "2024-05-20",
    title: "権限管理の強化とコミュニケーション機能の刷新",
    type: 'improvement',
    details: [
      "【改善】クラス管理者が、学生の各機能（課題の追加・編集、お知らせ編集など）へのアクセス権を個別に設定できるようになりました。",
      "【新機能】お問い合わせ機能が対話形式（チャット）に刷新されました。学生やクラス管理者の方が、よりスムーズに連絡を取り合えるようになりました。",
      "【改善】ログイン時のセキュリティが向上し、より安全にご利用いただけるようになりました。",
      "【修正】特定の条件下で、ログイン後にページが正しく表示されない問題を修正しました。",
    ],
  },
  {
    version: "1.0.0",
    date: "2024-05-15",
    title: "初回リリース＆大型アップデート！",
    type: 'new',
    details: [
      "ClassConnectへようこそ！最初のバージョンがリリースされました。",
      "サイドバーメニューを導入し、各機能へのアクセスが簡単になりました。",
      "新機能「課題管理」を実装しました。課題の登録、一覧表示、編集、削除が可能です。",
      "新機能「カレンダー」を実装し、行事や課題の締め切りを月単位で確認できるようになりました。",
      "「お問い合わせ管理」機能を追加し、クラス管理者への連絡がアプリ内から行えるようになりました。",
      "全体的なデザインを改善し、より使いやすくなりました。",
    ],
  },
];

const typeLabel: Record<UpdateEntry['type'], string> = {
  new: '新機能',
  fix: 'バグ修正',
  improvement: '改善',
};

const typeColor: Record<UpdateEntry['type'], string> = {
  new: 'bg-green-500 hover:bg-green-600',
  fix: 'bg-red-500 hover:bg-red-600',
  improvement: 'bg-blue-500 hover:bg-blue-600',
};

export default function UpdatesPage() {
  const { session } = useAuth();
  const isAdmin = !!session?.appAdmin;
  const [isEditing, setIsEditing] = useState(false);
  const [updateLog, setUpdateLog] = useState<UpdateEntry[]>(initialUpdateLog);

  const handleInputChange = (index: number, field: keyof UpdateEntry, value: string | string[]) => {
    const newLog = [...updateLog];
    (newLog[index] as any)[field] = value;
    setUpdateLog(newLog);
  };
  
  const handleDetailChange = (logIndex: number, detailIndex: number, value: string) => {
      const newLog = [...updateLog];
      newLog[logIndex].details[detailIndex] = value;
      setUpdateLog(newLog);
  };

  const addDetail = (logIndex: number) => {
      const newLog = [...updateLog];
      newLog[logIndex].details.push('');
      setUpdateLog(newLog);
  }

  const removeDetail = (logIndex: number, detailIndex: number) => {
      const newLog = [...updateLog];
      newLog[logIndex].details.splice(detailIndex, 1);
      setUpdateLog(newLog);
  }

  const addLogEntry = () => {
      setUpdateLog([{
          version: '0.0.0',
          date: new Date().toISOString().split('T')[0],
          title: '',
          type: 'new',
          details: ['']
      }, ...updateLog]);
  }

  const removeLogEntry = (index: number) => {
      const newLog = [...updateLog];
      newLog.splice(index, 1);
      setUpdateLog(newLog);
  }

  const handleSave = () => {
    // In a real app, this would send the `updateLog` state to a backend API.
    // For this prototype, we'll just log it and exit editing mode.
    console.log("Saving updated log:", JSON.stringify(updateLog, null, 2));
    alert("コンソールに保存内容を出力しました。実際のアプリケーションでは、ここでサーバーにデータを保存します。");
    setIsEditing(false);
  };

  return (
      <div className="container mx-auto py-8 px-4 md:px-0">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
            <h1 className="text-3xl font-bold text-primary text-center">
            ClassConnect 更新ログ
            </h1>
            {isAdmin && (
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                           <Button onClick={() => { setUpdateLog(initialUpdateLog); setIsEditing(false); }}>キャンセル</Button>
                           <Button onClick={handleSave}><Save className="mr-2 h-4 w-4"/>変更を保存</Button>
                        </>
                    ) : (
                        <Button onClick={() => setIsEditing(true)}>編集モード</Button>
                    )}
                </div>
            )}
        </div>
        <div className="space-y-8">
          {isEditing && (
              <div className="text-center mb-4">
                  <Button variant="outline" onClick={addLogEntry}><PlusCircle className="mr-2 h-4 w-4"/>新しいログエントリーを追加</Button>
              </div>
          )}
          {updateLog.map((entry, index) => (
            <Card key={entry.version + index} className="shadow-lg">
                {isEditing ? (
                  <>
                    <CardHeader>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor={`title-${index}`}>タイトル</Label>
                                <Input id={`title-${index}`} value={entry.title} onChange={(e) => handleInputChange(index, 'title', e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`version-${index}`}>バージョン</Label>
                                <Input id={`version-${index}`} value={entry.version} onChange={(e) => handleInputChange(index, 'version', e.target.value)} />
                            </div>
                             <div className="space-y-1">
                                <Label htmlFor={`date-${index}`}>リリース日</Label>
                                <Input type="date" id={`date-${index}`} value={entry.date} onChange={(e) => handleInputChange(index, 'date', e.target.value)} />
                            </div>
                            <div className="space-y-1">
                               <Label htmlFor={`type-${index}`}>種別</Label>
                               <Select value={entry.type} onValueChange={(value) => handleInputChange(index, 'type', value as UpdateEntry['type'])}>
                                   <SelectTrigger id={`type-${index}`}>
                                       <SelectValue/>
                                   </SelectTrigger>
                                   <SelectContent>
                                       {Object.keys(typeLabel).map(key => (
                                           <SelectItem key={key} value={key}>{typeLabel[key as UpdateEntry['type']]}</SelectItem>
                                       ))}
                                   </SelectContent>
                               </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Label>詳細</Label>
                        {entry.details.map((detail, detailIndex) => (
                           <div key={detailIndex} className="flex items-center gap-2">
                             <Textarea value={detail} onChange={(e) => handleDetailChange(index, detailIndex, e.target.value)} className="flex-grow"/>
                             <Button variant="ghost" size="icon" onClick={() => removeDetail(index, detailIndex)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                           </div>
                        ))}
                         <Button variant="outline" size="sm" onClick={() => addDetail(index)}><PlusCircle className="mr-1 h-3 w-3"/>詳細を追加</Button>
                    </CardContent>
                    <CardFooter>
                         <Button variant="destructive" onClick={() => removeLogEntry(index)}>このエントリーを削除</Button>
                    </CardFooter>
                  </>
                ) : (
                  <>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <CardTitle className="text-2xl font-semibold">
                            {entry.title}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge className={`${typeColor[entry.type]} text-white`}>
                            {typeLabel[entry.type]}
                            </Badge>
                            <Badge variant="outline">v{entry.version}</Badge>
                        </div>
                        </div>
                        <CardDescription className="text-sm text-muted-foreground pt-1">
                        リリース日: {entry.date}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                        {entry.details.map((detail, index) => (
                            <li key={index}>{detail}</li>
                        ))}
                        </ul>
                    </CardContent>
                  </>
                )}
            </Card>
          ))}
        </div>
        {updateLog.length === 0 && (
          <p className="text-center text-muted-foreground mt-10">
            更新履歴はまだありません。
          </p>
        )}
      </div>
  );
}
