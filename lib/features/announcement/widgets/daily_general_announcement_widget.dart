
// lib/features/announcement/widgets/daily_general_announcement_widget.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:intl/intl.dart';

// --- Предположительные импорты ---
import '../models/announcement_model.dart';
import '../providers/announcement_providers.dart';
// import '../../../core/providers/auth_provider.dart'; // Пример

// --- Заглушка для authStateProvider ---
final authStateProvider = StateProvider<({bool isLoggedIn, bool isAdmin, String? userId})>(
  (ref) => (isLoggedIn: true, isAdmin: true, userId: "admin_user_flutter")
);
// ---------------------------------


class DailyGeneralAnnouncementWidget extends ConsumerWidget {
  final DateTime date;

  const DailyGeneralAnnouncementWidget({Key? key, required this.date}) : super(key: key);

  String get dateStr => DateFormat('yyyy-MM-dd').format(date);

  void _showEditDialog(BuildContext context, WidgetRef ref, AnnouncementModel? currentAnnouncement) {
    final TextEditingController controller = TextEditingController(text: currentAnnouncement?.content ?? '');
    showDialog(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text("${DateFormat('M月d日', 'ja_JP').format(date)}のお知らせ編集"),
          content: TextField(
            controller: controller,
            maxLines: 5,
            decoration: const InputDecoration(
              hintText: "Markdown形式で入力...",
              border: OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text("キャンセル"),
            ),
            ElevatedButton(
              onPressed: () async {
                final newContent = controller.text;
                Navigator.of(dialogContext).pop(); // ダイアログを閉じる
                try {
                  await ref.read(aiSummaryControllerProvider(dateStr).notifier).updateAnnouncementContent(newContent);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('お知らせを保存しました。')),
                  );
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('お知らせの保存に失敗: ${e.toString()}')),
                  );
                }
              },
              child: const Text("保存"),
            ),
          ],
        );
      },
    );
  }


  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final isAdmin = authState.isAdmin;

    final announcementAsyncValue = ref.watch(aiSummaryControllerProvider(dateStr));
    
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 12.0),
      elevation: 2.0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12.0)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  "${DateFormat('M月d日 (E)', 'ja_JP').format(date)} のお知らせ",
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                ),
                if (isAdmin || authState.isLoggedIn)
                  IconButton(
                    icon: const Icon(Icons.edit_outlined),
                    tooltip: "お知らせを編集",
                    onPressed: () => _showEditDialog(context, ref, announcementAsyncValue.valueOrNull),
                  )
              ],
            ),
            const SizedBox(height: 12),

            announcementAsyncValue.when(
              data: (announcement) {
                final announcementContent = announcement?.content ?? "";
                final aiSummary = announcement?.aiSummary;
                final contentHasChanged = announcement?.contentHasChangedSinceSummary ?? true;

                bool canGenerateNewSummary = announcementContent.isNotEmpty && (aiSummary == null || aiSummary.isEmpty || contentHasChanged);
                bool canRegenerateSummary = announcementContent.isNotEmpty && (aiSummary != null && aiSummary.isNotEmpty) && isAdmin && !contentHasChanged;
                bool isSummarizing = announcementAsyncValue.isRefreshing || announcementAsyncValue.isReloading; // Approximation for loading
                
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (announcementContent.isEmpty && !isAdmin && !authState.isLoggedIn)
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 20.0),
                          child: Text(
                            "ログインまたは「ログインなしで利用」を選択すると、お知らせが表示されます。",
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[600]),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    else if (announcementContent.isEmpty)
                       Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 20.0),
                          child: Column(
                            children: [
                              Text("今日のお知らせはありません。", style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[700])),
                              if (isAdmin || authState.isLoggedIn)
                                TextButton.icon(
                                  icon: const Icon(Icons.add_circle_outline, size: 18),
                                  label: const Text("お知らせを作成する"),
                                  onPressed: () => _showEditDialog(context, ref, announcement),
                                )
                            ],
                          ),
                        ),
                      )
                    else
                      MarkdownBody(
                        data: announcementContent,
                        styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                          p: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 15),
                          // 必要に応じて他のMarkdownスタイルも調整
                        ),
                      ),
                    
                    const SizedBox(height: 16),

                    if (announcementContent.isNotEmpty && (canGenerateNewSummary || canRegenerateSummary))
                      Align(
                        alignment: Alignment.centerRight,
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          ),
                          icon: isSummarizing
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                              : const Icon(Icons.auto_awesome, size: 18),
                          label: Text(
                            isSummarizing
                                ? "要約中..."
                                : (canRegenerateSummary ? "AI要約を再生成" : "AI要約"),
                            style: const TextStyle(fontSize: 13),
                          ),
                          onPressed: isSummarizing ? null : () async {
                            final bool shouldProceed = await showDialog<bool>(
                              context: context,
                              builder: (BuildContext dialogContext) {
                                return AlertDialog(
                                  title: Text(canRegenerateSummary ? "AI要約を再生成しますか？" : "お知らせをAIで要約しますか？"),
                                  content: const Text(
                                      "このお知らせの内容をAIが解析し、簡潔な箇条書きに要約します。\n"
                                      "この処理には数秒かかる場合があります。\n\n"
                                      "注意: AIによる要約は必ずしも完璧ではありません。重要な情報は必ず原文を確認してください。"
                                  ),
                                  actions: <Widget>[
                                    TextButton(
                                      child: const Text("キャンセル"),
                                      onPressed: () => Navigator.of(dialogContext).pop(false),
                                    ),
                                    ElevatedButton( // Changed to ElevatedButton for better visual
                                      child: Text(isSummarizing ? "処理中..." : (canRegenerateSummary ? "再生成する" : "要約する")),
                                      onPressed: isSummarizing ? null : () => Navigator.of(dialogContext).pop(true),
                                    ),
                                  ],
                                );
                              },
                            ) ?? false;

                            if (shouldProceed) {
                              try {
                                await ref.read(aiSummaryControllerProvider(dateStr).notifier).generateOrUpdateSummary();
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('AI要約をリクエストしました。')),
                                );
                              } catch (e) {
                                 ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('AI要約の処理に失敗しました: ${e.toString()}')),
                                );
                              }
                            }
                          },
                        ),
                      ),

                    if (aiSummary != null && aiSummary.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Card(
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8.0),
                          side: BorderSide(color: Theme.of(context).colorScheme.primary.withOpacity(0.5), width: 1)
                        ),
                        color: Theme.of(context).colorScheme.primaryContainer.withOpacity(0.05), // 背景を少し薄く
                        child: Padding(
                          padding: const EdgeInsets.all(12.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Row(
                                    children: [
                                      Icon(Icons.auto_awesome_outlined, size: 20, color: Theme.of(context).colorScheme.primary),
                                      const SizedBox(width: 8),
                                      Text(
                                        "AIによる要約",
                                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                          color: Theme.of(context).colorScheme.primary,
                                          fontWeight: FontWeight.w600
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (isAdmin)
                                    IconButton(
                                      icon: (announcementAsyncValue.isRefreshing || announcementAsyncValue.isReloading) // 削除中もローディング表示
                                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                          : Icon(Icons.delete_outline, size: 22, color: Theme.of(context).colorScheme.error.withOpacity(0.8)),
                                      tooltip: "AI要約を削除",
                                      onPressed: (announcementAsyncValue.isRefreshing || announcementAsyncValue.isReloading) ? null : () async {
                                        final bool shouldDelete = await showDialog<bool>(
                                          context: context,
                                          builder: (BuildContext dialogContext) {
                                            return AlertDialog(
                                              title: const Text("AI要約を削除しますか？"),
                                              content: const Text("この操作は元に戻せません。AIによる要約が削除されます。"),
                                              actions: <Widget>[
                                                TextButton(
                                                  child: const Text("キャンセル"),
                                                  onPressed: () => Navigator.of(dialogContext).pop(false),
                                                ),
                                                ElevatedButton( // Changed to ElevatedButton
                                                  style: ElevatedButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
                                                  child: Text((announcementAsyncValue.isRefreshing || announcementAsyncValue.isReloading) ? "削除中..." : "削除する", style: TextStyle(color: Theme.of(context).colorScheme.onError)),
                                                  onPressed: (announcementAsyncValue.isRefreshing || announcementAsyncValue.isReload_model)
                                      state = AsyncValue.data(currentModel).copyWithPrevious(AsyncError(e, s));
                                      rethrow;
                                    }
                                  },
                                ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.warning_amber_rounded, size: 18, color: Colors.orange.shade700),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  "注意: AIによる要約は必ずしも完璧ではありません。重要な情報は必ず原文を確認してください。",
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.orange.shade800, fontSize: 12.5),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          MarkdownBody(
                            data: aiSummary,
                            styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                              p: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 14),
                              listBullet: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 14),
                              // 他のMarkdownスタイルも必要に応じて調整
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                if (aiSummary == null && announcementContent.isNotEmpty && (announcementAsyncValue.isRefreshing || announcementAsyncValue.isReloading))
                  const Center(child: Padding(padding: EdgeInsets.all(8.0), child: Text("AI要約を処理中...")))
              ],
            );
          },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stackTrace) {
                print("Error in announcementAsyncValue.when: $error");
                print(stackTrace);
                return Center(
                    child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text(
                        "お知らせの読み込みに失敗しました。\n${error.toString()}",
                        style: TextStyle(color: Theme.of(context).colorScheme.error),
                        textAlign: TextAlign.center,
                    ),
                    ),
                );
            },
          ),
        ],
      ),
    ),
  );
  }
}
