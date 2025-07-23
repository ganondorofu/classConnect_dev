
// lib/core/providers/firebase_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_functions/cloud_functions.dart';

final firebaseFunctionsProvider = Provider<FirebaseFunctions>((ref) {
  // TODO: デプロイするFirebase Functionsのリージョンに合わせてください (例: 'asia-northeast1')
  // Vercelのデフォルトリージョンやプロジェクト設定に依存する場合もあります。
  // 一般的なFirebase Functionsのデフォルトは 'us-central1' です。
  // GenkitをVercelにデプロイしている場合、そのリージョン設定を確認してください。
  return FirebaseFunctions.instanceFor(region: 'asia-northeast1');
});
