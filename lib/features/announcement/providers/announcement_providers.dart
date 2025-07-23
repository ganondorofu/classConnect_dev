
// lib/features/announcement/providers/announcement_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart'; // For FieldValue, SetOptions
import '../models/announcement_model.dart';
import '../services/announcement_service.dart';

// --- Предположительные провайдеры (замените на реальные) ---
// final authStateProvider = StateProvider<({bool isLoggedIn, bool isAdmin})>((ref) => (isLoggedIn: true, isAdmin: true));
// final currentUserIdProvider = Provider<String?>((ref) {
//   // Здесь логика получения ID текущего пользователя
//   return ref.watch(authStateProvider).isLoggedIn ? "flutter_user_placeholder" : null;
// });
// ------------------------------------------------------------


// 特定の日付の全体お知らせをStreamで提供 (状態管理のためコントローラー経由に変更も検討)
final dailyGeneralAnnouncementStreamProvider =
    StreamProvider.family<AnnouncementModel?, String>((ref, date) {
  final service = ref.watch(announcementServiceProvider);
  return service.getDailyGeneralAnnouncementStream(date);
});

// UI操作のためのStateNotifier (AI要約機能に特化)
final aiSummaryControllerProvider = StateNotifierProvider.family<
    AiSummaryController, AsyncValue<AnnouncementModel?>, String>((ref, date) {
  final service = ref.watch(announcementServiceProvider);
  // final userId = ref.watch(currentUserIdProvider);
  final userId = "flutter_user_placeholder"; // 仮
  return AiSummaryController(service, date, userId, ref);
});

class AiSummaryController extends StateNotifier<AsyncValue<AnnouncementModel?>> {
  final AnnouncementService _service;
  final String _date;
  final String? _userId;
  final Ref _ref; // 他のプロバイダを読み取るため

  AiSummaryController(this._service, this._date, this._userId, this._ref) : super(const AsyncLoading()) {
    _initialize();
  }

  Future<void> _initialize() async {
    state = const AsyncLoading();
    try {
      final announcement = await _service.getDailyGeneralAnnouncement(_date);
      state = AsyncData(announcement);
    } catch (e, s) {
      state = AsyncError(e, s);
    }
  }

  Future<void> refreshData() async {
     _initialize();
  }

  // お知らせ内容の更新 (AI要約とは別だが、関連するのでここに置くことも検討)
  // このメソッドは DailyGeneralAnnouncementWidget から呼び出される想定
  Future<void> updateAnnouncementContent(String newContent) async {
    final currentModel = state.valueOrNull;
    if (currentModel == null && newContent.trim().isEmpty) return; // 何もしない

    state = const AsyncLoading(); // ローディング状態に
    try {
      // Firestoreに保存
      await _service.upsertDailyGeneralAnnouncement(
          _date, 
          newContent, 
          currentUserId: _userId,
          // 内容変更時は既存のAI要約情報を渡してService側でクリア判断させる
          existingAiSummary: currentModel?.aiSummary,
          existingAiSummaryLastGeneratedAt: currentModel?.aiSummaryLastGeneratedAt
      );
      await refreshData(); // Firestoreから最新データを再読み込みしてstateを更新
    } catch (e, s) {
      state = AsyncError(e, s);
      rethrow; // UI側でエラーをキャッチして表示するため
    }
  }


  Future<String?> generateOrUpdateSummary() async {
    final currentModel = state.valueOrNull;
    if (currentModel == null || currentModel.content.isEmpty) {
      throw Exception("要約するお知らせの内容がありません。");
    }

    final originalState = state;
    state = AsyncValue.data(currentModel).copyWithPrevious(const AsyncLoading()); // データは維持しつつローディング状態に

    try {
      final summary = await _service.generateSummary(_date, currentModel.content, userId: _userId);
      
      // Firestoreに直接保存
      await _service.updateFirestoreAiSummary(_date, summary, DateTime.now());
      
      // 状態を更新
      final updatedModel = await _service.getDailyGeneralAnnouncement(_date);
      state = AsyncData(updatedModel);
      return summary;

    } catch (e, s) {
      state = originalState.copyWithPrevious(AsyncError(e, s)); // エラー状態に移行しつつ以前のデータを保持
      rethrow;
    }
  }

  Future<void> deleteSummary() async {
    final currentModel = state.valueOrNull;
    if (currentModel == null || currentModel.aiSummary == null) return;

    final originalState = state;
    state = AsyncValue.data(currentModel).copyWithPrevious(const AsyncLoading());

    try {
      // Firebase Functionsを呼び出す (オプション: サーバーサイドで追加処理が必要な場合)
      // await _service.deleteAiSummaryOnServer(_date, userId: _userId);
      
      // FirestoreのAI要約フィールドを直接クリア
      await _service.clearFirestoreAiSummary(_date);

      // 状態を更新
      final updatedModel = await _service.getDailyGeneralAnnouncement(_date);
      state = AsyncData(updatedModel);

    } catch (e, s) {
      state = originalState.copyWithPrevious(AsyncError(e, s));
      rethrow;
    }
  }
}
