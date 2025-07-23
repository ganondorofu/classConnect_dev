
'use server';

import { 
    generateAndStoreAnnouncementSummary as generateSummaryInController,
    deleteAiSummary as deleteSummaryInController 
} from '@/controllers/timetableController';
import type { FirebaseError } from 'firebase/app';

export async function requestSummaryGeneration(classId: string, date: string, userId: string): Promise<string | null> {
  if (!classId || !date) {
    console.error("requestSummaryGeneration called with missing classId or date.");
    return null;
  }
  try {
    const summary = await generateSummaryInController(classId, date, userId);
    return summary;
  } catch (error: any) { // Catch 'any' to inspect message
    console.error(`Error requesting summary generation for class ${classId}, date ${date}:`, error);
    if (error.message && error.message.includes("AI機能は設定されていません")) {
        throw error; // Re-throw the specific error for the client to handle
    }
    if ((error as FirebaseError).code === 'unavailable') {
        throw new Error("オフラインのため要約を生成できませんでした。");
    }
    // For other errors, re-throw them as generic errors or specific ones if identifiable
    throw new Error("要約の生成中に予期せぬエラーが発生しました。");
  }
}

export async function requestSummaryDeletion(classId: string, date: string, userId: string): Promise<void> {
  if (!classId || !date) {
    console.error("requestSummaryDeletion called with missing classId or date.");
    return;
  }
  try {
    await deleteSummaryInController(classId, date, userId);
  } catch (error) {
    console.error(`Error requesting summary deletion for class ${classId}, date ${date}:`, error);
    if ((error as FirebaseError).code === 'unavailable') {
       throw new Error("オフラインのため要約を削除できませんでした。");
    }
    throw error;
  }
}
