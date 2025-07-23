
// Firebase Functionsの環境では、パスの解決方法がNext.jsと異なる場合があるため注意
import { genkit, type GenkitPlugin } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import * as functions from "firebase-functions"; // Firebase Functionsの環境変数利用のため

// This function will be called to get the plugins for Genkit.
// It reads the environment variable when called.
const initializeActivePlugins = (): GenkitPlugin[] => {
  // Firebase Functionsの環境変数は functions.config() 経由で取得するか、
  // .envファイル（dotenvパッケージ利用）やGoogle Cloud Secret Managerを利用します。
  // ここでは、functions.config() を使う例と、process.env のフォールバックを示します。
  const apiKey = functions.config().google?.genai_api_key || process.env.GOOGLE_GENAI_API_KEY;

  if (!apiKey) {
    const errorMessage = "CRITICAL: GOOGLE_GENAI_API_KEY is not set in Firebase Functions environment variables. AI features will be disabled.";
    console.error(errorMessage);
    // Functions環境では、エラーを投げて関数の実行を中止させるか、空のプラグインリストを返す
    // throw new functions.https.HttpsError('failed-precondition', errorMessage);
    return [];
  }
  console.log("[Genkit Init in Firebase Function] GOOGLE_GENAI_API_KEY is set. Initializing GoogleAI plugin.");
  return [googleAI({ apiKey })];
};

// promptDir は、Firebase Functions のデプロイ構造に合わせて調整が必要です。
// 通常、functions/src/ai/prompts のような構造を想定します。
// デプロイ後の関数の実行ディレクトリからの相対パスになります。
const resolvedPromptDir = './ai/prompts'; // functions/lib/ai/prompts を参照するように調整が必要な場合あり

export const ai = genkit({
  promptDir: resolvedPromptDir, // Functionsのデプロイ構造に合わせて調整
  plugins: initializeActivePlugins(),
  // model: 'googleai/gemini-2.0-flash', // Model is defined per prompt, if not globally here
});

/**
 * Checks if the AI features are configured (i.e., API key is set).
 * This function reads the environment variable directly when called.
 * @returns {boolean} True if AI is configured, false otherwise.
 */
export const isAiConfigured = (): boolean => {
  const apiKey = functions.config().google?.genai_api_key || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.warn("[isAiConfigured in Firebase Function] Check: GOOGLE_GENAI_API_KEY is not set.");
  }
  return !!apiKey;
};
