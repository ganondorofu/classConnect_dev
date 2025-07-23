
import * as functions from "firebase-functions";
// import * as admin from "firebase-admin"; // FirestoreをAdmin SDK経由で操作する場合に必要

// Firebase Admin SDKの初期化 (プロジェクトでまだ初期化されていない場合)
// if (admin.apps.length === 0) {
//   admin.initializeApp();
// }

// Genkitフローと設定ファイルをインポート
// 注意: TypeScriptでビルド後、JavaScriptファイルが `lib` ディレクトリなどに出力されるため、
// その構造に合わせたパスでインポートする必要があります。
// 例: functions/lib/src/ai/flows/summarize-announcement-flow.js
import { summarizeAnnouncement } from "./lib/ai/flows/summarize-announcement-flow"; // コンパイル後のパスを想定
import { isAiConfigured } from "./lib/ai/ai-instance"; // コンパイル後のパスを想定

// 日本リージョン (asia-northeast1) で関数をデプロイする場合の推奨
const region = "asia-northeast1";

export const generateAnnouncementSummary = functions
  .region(region)
  .runWith({
    // 必要に応じてメモリやタイムアウトを設定
    // memory: '256MB',
    // timeoutSeconds: 60,
    secrets: ["GOOGLE_GENAI_API_KEY"], // Secret Managerを使用する場合
  })
  .https.onCall(async (data, context) => {
    // 認証チェック (オプション)
    // const userId = context.auth?.uid;
    // if (!userId) {
    //   throw new functions.https.HttpsError('unauthenticated', '関数は認証された状態で呼び出す必要があります。');
    // }

    const announcementText = data.announcementText as string;
    const date = data.date as string; // ログやコンテキスト用

    if (!announcementText || announcementText.trim() === "") {
      console.error(`[generateSummary] Invalid argument: announcementText is empty for date: ${date}`);
      throw new functions.https.HttpsError(
        "invalid-argument",
        "要約するお知らせのテキストが必要です。"
      );
    }

    if (!isAiConfigured()) {
      console.warn(
        `[generateSummary] AI is not configured. Skipping summary generation for date: ${date}.`
      );
      throw new functions.https.HttpsError(
        "failed-precondition",
        "AI機能がサーバー側で設定されていません。管理者に連絡してください。",
        { "reason": "AI_NOT_CONFIGURED" }
      );
    }

    console.log(
      `[generateSummary] Received request for date: ${date}, text length: ${announcementText.length}`
    );

    try {
      const result = await summarizeAnnouncement({ announcementText });
      console.log(
        `[generateSummary] Successfully generated summary for date: ${date}, summary length: ${result.summary.length}`
      );
      return { summary: result.summary };
    } catch (error: any) {
      console.error(
        `[generateSummary] Error in summarizeAnnouncement flow for date: ${date}:`,
        error.message,
        error.stack,
        error.originalError // カスタムエラーで設定した場合
      );
      // クライアントに返すエラーメッセージを汎用的に
      let clientErrorMessage = "AI要約の生成中にサーバーでエラーが発生しました。";
      if (error.code === "AI_NOT_CONFIGURED" || (error.message && error.message.includes("AI機能は設定されていません"))) {
        clientErrorMessage = "AI機能は設定されていません。管理者に連絡してください。";
      } else if (error.message && error.message.includes("Failed to generate summary from AI")) {
        clientErrorMessage = "AIが要約を生成できませんでした。原文が短すぎるか、内容が不適切である可能性があります。";
      }
      
      throw new functions.https.HttpsError(
        "internal",
        clientErrorMessage,
        { // デバッグ用に詳細情報を含める（本番では注意）
          originalError: error.message || 'Unknown flow error',
          details: error.originalError ? JSON.stringify(error.originalError, Object.getOwnPropertyNames(error.originalError)) : null
        }
      );
    }
  });

export const deleteAnnouncementSummary = functions
  .region(region)
  .runWith({
    secrets: ["GOOGLE_GENAI_API_KEY"], // もしこの関数もAPIキーが必要なら
  })
  .https.onCall(async (data, context) => {
    const date = data.date as string;
    // const userId = context.auth?.uid; // ログや権限確認用

    if (!date) {
      console.error(`[deleteSummary] Invalid argument: date is missing.`);
      throw new functions.https.HttpsError(
        "invalid-argument",
        "削除対象の日付が必要です。"
      );
    }

    console.log(
      `[deleteSummary] Received request to delete AI Summary for date: ${date}`
    );

    // Firestoreの更新は通常クライアントサイドで行い、Functionsは追加ロジック（監査ログなど）
    // またはAdmin SDKを使った直接操作のために使用されます。
    // この例では、クライアントがFirestoreを更新したと仮定し、成功応答を返します。
    // もしこの関数でFirestoreを更新する必要がある場合は、admin.firestore()... を使用します。
    // (例: admin.firestore().collection('classes').doc('defaultClass').collection('generalAnnouncements').doc(date).update({...}))

    try {
      // ここでは実際の削除処理はクライアント側に任せていると仮定
      // 必要ならAdmin SDKで削除処理を実装
      return {
        success: true,
        message: `AI summary deletion for ${date} acknowledged by server.`,
      };
    } catch (error: any) {
      console.error(
        `[deleteSummary] Error processing deletion for date: ${date}:`,
        error
      );
      throw new functions.https.HttpsError(
        "internal",
        error.message || "AI要約の削除処理中にサーバーエラーが発生しました。",
        error
      );
    }
  });
