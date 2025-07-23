
// lib/features/announcement/models/announcement_model.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart'; // For ValueGetter

class AnnouncementModel {
  final String id; // YYYY-MM-DD
  final String date;
  String content;
  String? aiSummary;
  DateTime? aiSummaryLastGeneratedAt;
  DateTime updatedAt;

  bool get contentHasChangedSinceSummary {
    if (aiSummary == null || aiSummaryLastGeneratedAt == null) {
      return true;
    }
    return updatedAt.isAfter(aiSummaryLastGeneratedAt!);
  }

  AnnouncementModel({
    required this.id,
    required this.date,
    required this.content,
    this.aiSummary,
    this.aiSummaryLastGeneratedAt,
    required this.updatedAt,
  });

  factory AnnouncementModel.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;
    return AnnouncementModel(
      id: doc.id,
      date: data['date'] ?? doc.id,
      content: data['content'] ?? '',
      aiSummary: data['aiSummary'] as String?,
      aiSummaryLastGeneratedAt: (data['aiSummaryLastGeneratedAt'] as Timestamp?)?.toDate(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'date': date,
      'content': content,
      'aiSummary': aiSummary,
      'aiSummaryLastGeneratedAt': aiSummaryLastGeneratedAt != null
          ? Timestamp.fromDate(aiSummaryLastGeneratedAt!)
          : null,
      'updatedAt': Timestamp.fromDate(updatedAt),
    };
  }

  AnnouncementModel copyWith({
    String? id,
    String? date,
    String? content,
    ValueGetter<String?>? aiSummary, // Use ValueGetter for nullable fields
    ValueGetter<DateTime?>? aiSummaryLastGeneratedAt,
    DateTime? updatedAt,
  }) {
    return AnnouncementModel(
      id: id ?? this.id,
      date: date ?? this.date,
      content: content ?? this.content,
      aiSummary: aiSummary != null ? aiSummary() : this.aiSummary,
      aiSummaryLastGeneratedAt: aiSummaryLastGeneratedAt != null ? aiSummaryLastGeneratedAt() : this.aiSummaryLastGeneratedAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
