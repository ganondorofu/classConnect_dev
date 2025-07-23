
// lib/features/announcement/services/announcement_service.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/announcement_model.dart';
import '../../../core/providers/firebase_providers.dart';

final announcementServiceProvider = Provider<AnnouncementService>((ref) {
  return AnnouncementService(
    FirebaseFirestore.instance,
    ref.watch(firebaseFunctionsProvider), // `read` から `watch` に変更 (推奨)
  );
});

class AnnouncementService {
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;
  final String _currentClassId = 'defaultClass'; // 将来的には動的に

  AnnouncementService(this._firestore, this._functions);

  DocumentReference _generalAnnouncementDocRef(String date) => _firestore
      .collection('classes')
      .doc(_currentClassId)
      .collection('generalAnnouncements')
      .doc(date);

  Stream<AnnouncementModel?> getDailyGeneralAnnouncementStream(String date) {
    return _generalAnnouncementDocRef(date).snapshots().map((snapshot) {
      if (snapshot.exists) {
        return AnnouncementModel.fromFirestore(snapshot);
      }
      return null;
    });
  }

  Future<AnnouncementModel?> getDailyGeneralAnnouncement(String date) async {
    final snapshot = await _generalAnnouncementDocRef(date).get();
    if (snapshot.exists) {
      return AnnouncementModel.fromFirestore(snapshot);
    }
    return null;
  }
  
  Future<void> upsertDailyGeneralAnnouncement(String date, String content, {String? currentUserId, String? existingAiSummary, DateTime? existingAiSummaryLastGeneratedAt}) async {
    final docRef = _generalAnnouncementDocRef(date);
    final String newContent = content.trim();
    
    final Map<String, dynamic> dataToSet = {
      'date': date,
      'content': newContent,
      'updatedAt': FieldValue.serverTimestamp(),
      'itemType': 'general',
    };

    final docSnapshot = await docRef.get();
    if (docSnapshot.exists) {
        final currentData = docSnapshot.data() as Map<String, dynamic>?;
        // 内容が変更された場合のみAI要約関連をクリア
        if (currentData != null && currentData['content'] != newContent) {
            dataToSet['aiSummary'] = null;
            dataToSet['aiSummaryLastGeneratedAt'] = null;
        } else {
            // 内容が変更されていない場合は既存のAI要約情報を維持
            dataToSet['aiSummary'] = existingAiSummary;
            dataToSet['aiSummaryLastGeneratedAt'] = existingAiSummaryLastGeneratedAt != null
                ? Timestamp.fromDate(existingAiSummaryLastGeneratedAt)
                : null;
        }
    }


    if (newContent.isEmpty && docSnapshot.exists) {
        await docRef.delete();
        // TODO: Log deletion action (if needed from client, or rely on function log)
    } else if (newContent.isNotEmpty) {
        await docRef.set(dataToSet, SetOptions(merge: true));
        // TODO: Log upsert action
    }
  }


  Future<String?> generateSummary(String date, String announcementText, {String? userId}) async {
    if (announcementText.trim().isEmpty) {
      throw Exception("要約するお知らせの内容がありません。");
    }
    // Firebase Functionsの関数名を指定 (Next.js版の 'generateAnnouncementSummary' を想定)
    final HttpsCallable callable = _functions.httpsCallable('generateAnnouncementSummary');
    try {
      final result = await callable.call<Map<String, dynamic>>({
        'date': date, // Next.js版APIがdateを必要とする場合
        'announcementText': announcementText,
        'userId': userId, // 必要であればユーザーIDを渡す
      });
      // Firebase Functionからの戻り値の構造に合わせて 'summary' を取得
      if (result.data != null && result.data['summary'] != null) {
        return result.data['summary'] as String?;
      } else {
        throw Exception("AI要約の生成結果が不正です。");
      }
    } on FirebaseFunctionsException catch (e) {
      print("FirebaseFunctionsException generating summary: ${e.code} - ${e.message} - ${e.details}");
      if (e.code == 'failed-precondition' && e.message != null && e.message!.contains("AI機能がサーバー側で設定されていません")) {
          throw Exception("AI機能は設定されていません。管理者に連絡してください。");
      }
      // サーバー側で独自のエラーメッセージを設定している場合、それを優先
      String errorMessage = e.details?['message'] ?? e.message ?? "AI要約の生成中にサーバーエラーが発生しました。";
      if (e.details is Map && e.details['originalError'] != null) {
          errorMessage += " (詳細: ${e.details['originalError']})";
      }
      throw Exception(errorMessage);
    } catch (e) {
      print("Error calling generateSummary function: $e");
      throw Exception("AI要約の生成中に予期せぬエラーが発生しました。");
    }
  }

  Future<void> deleteAiSummaryOnServer(String date, {String? userId}) async {
    // Firebase Functionsの関数名を指定 (Next.js版の 'deleteAnnouncementSummary' を想定)
    final HttpsCallable callable = _functions.httpsCallable('deleteAnnouncementSummary');
     try {
      await callable.call<Map<String, dynamic>>({
        'date': date,
        'userId': userId, // 必要であればユーザーIDを渡す
      });
    } on FirebaseFunctionsException catch (e) {
      print("FirebaseFunctionsException deleting summary: ${e.code} - ${e.message}");
      throw Exception(e.message ?? "AI要約の削除中にサーバーエラーが発生しました。");
    } catch (e) {
      print("Error calling deleteAiSummary function: $e");
      throw Exception("AI要約の削除中に予期せぬエラーが発生しました。");
    }
  }

  // FirestoreのaiSummaryフィールドを直接更新するメソッド (オプション)
  Future<void> updateFirestoreAiSummary(String date, String? summary, DateTime? generatedAt) async {
    await _generalAnnouncementDocRef(date).set({
      'aiSummary': summary,
      'aiSummaryLastGeneratedAt': generatedAt != null ? Timestamp.fromDate(generatedAt) : null,
    }, SetOptions(merge: true));
  }

  Future<void> clearFirestoreAiSummary(String date) async {
    await _generalAnnouncementDocRef(date).update({
      'aiSummary': FieldValue.delete(),
      'aiSummaryLastGeneratedAt': FieldValue.delete(),
    });
  }
}
