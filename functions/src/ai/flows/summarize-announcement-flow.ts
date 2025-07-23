
//'use server'; // Firebase Functionsでは 'use server' は不要
/**
 * @fileOverview A Genkit flow for summarizing announcement text.
 *
 * - summarizeAnnouncement - A function that handles the announcement summarization.
 * - SummarizeAnnouncementInput - The input type for the summarizeAnnouncement function.
 * - SummarizeAnnouncementOutput - The return type for the summarizeAnnouncement function.
 */

// Firebase Functionsの環境では、パスの解決方法が異なる場合があるため、
// 既存のNext.jsプロジェクトの構造を前提とした相対パスは調整が必要になることがあります。
// ここでは、Firebase Functionsのルートディレクトリから見たパスを想定します。
// もし 'src' がfunctionsディレクトリの直下にあれば、'./ai-instance' などになります。
import { ai, isAiConfigured } from '../ai-instance'; // パスを調整
import { z } from 'genkit';

const SummarizeAnnouncementInputSchema = z.object({
  announcementText: z.string().describe('The full text of the announcement to be summarized.'),
});
export type SummarizeAnnouncementInput = z.infer<typeof SummarizeAnnouncementInputSchema>;

const SummarizeAnnouncementOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the announcement, formatted as Markdown bullet points.'),
});
export type SummarizeAnnouncementOutput = z.infer<typeof SummarizeAnnouncementOutputSchema>;

export async function summarizeAnnouncement(input: SummarizeAnnouncementInput): Promise<SummarizeAnnouncementOutput> {
  console.log('[AI Flow Entry] summarizeAnnouncement called for Firebase Function.');
  if (!isAiConfigured()) { // isAiConfigured() がFunctions環境で正しく動作するか確認
    console.warn("[AI Flow Entry] AI is not configured (isAiConfigured() returned false). Skipping summary generation.");
    // Firebase Functionsからは HttpsError を投げるのが一般的
    // throw new functions.https.HttpsError('failed-precondition', 'AI機能は設定されていません。管理者に連絡してください。');
    // または、呼び出し元でハンドリングしやすいようにカスタムエラーを投げる
    const error = new Error("AI機能は設定されていません。管理者に連絡してください。");
    (error as any).code = "AI_NOT_CONFIGURED";
    throw error;
  }
  console.log('[AI Flow Entry] AI is configured. Proceeding to call summarizeAnnouncementFlow.');
  return summarizeAnnouncementFlow(input);
}

const summarizePrompt = ai.definePrompt({
  name: 'summarizeAnnouncementPrompt',
  model: 'googleai/gemini-2.0-flash', 
  input: { schema: SummarizeAnnouncementInputSchema },
  output: { schema: SummarizeAnnouncementOutputSchema },
  prompt: `以下の連絡事項を、Markdown形式の簡潔な箇条書きで要約してください。

連絡事項:
{{{announcementText}}}

要約 (Markdown形式の箇条書き):
`,
// Gemini APIの安全性設定の例（必要に応じて調整）
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
});

const summarizeAnnouncementFlow = ai.defineFlow(
  {
    name: 'summarizeAnnouncementFlow',
    inputSchema: SummarizeAnnouncementInputSchema,
    outputSchema: SummarizeAnnouncementOutputSchema,
  },
  async (input) => {
    try {
      console.log(`[Genkit Flow summarizeAnnouncementFlow] Starting for text: ${input.announcementText.substring(0, 70)}...`);
      const { output } = await summarizePrompt(input);
      if (!output) {
        console.error('[Genkit Flow summarizeAnnouncementFlow] summarizePrompt returned no output.');
        throw new Error('Failed to generate summary from AI.');
      }
      console.log(`[Genkit Flow summarizeAnnouncementFlow] Summary generated successfully. Length: ${output.summary.length}`);
      return output;
    } catch (flowError: any) {
      console.error(
        `[Genkit Flow summarizeAnnouncementFlow] Error: ${flowError.message}`,
        flowError.stack,
        // flowErrorがErrorオブジェクトの場合、詳細なプロパティもログに出力
        flowError instanceof Error ? JSON.stringify(flowError, Object.getOwnPropertyNames(flowError)) : ''
      );
      // Firebase Functionsの場合、エラーの再スロー方法を検討
      // throw new functions.https.HttpsError('internal', `AI要約フローでエラー: ${flowError.message || '不明なエラー'}`);
      // または、より詳細な情報を含むカスタムエラー
      const customError = new Error(`AI要約フローでエラーが発生しました。 (Original: ${flowError.message || 'Unknown AI flow error'})`);
      (customError as any).originalError = flowError; // 元のエラーを保持
      throw customError;
    }
  }
);
