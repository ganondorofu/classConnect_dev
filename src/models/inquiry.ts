
import type { Timestamp } from 'firebase/firestore';

export enum InquiryType {
  BUG = "bug",
  FEATURE_REQUEST = "feature_request",
  QUESTION = "question",
  OTHER = "other",
}

export const inquiryTypeLabels: Record<InquiryType, string> = {
  [InquiryType.BUG]: "バグ報告",
  [InquiryType.FEATURE_REQUEST]: "機能要望",
  [InquiryType.QUESTION]: "ご質問",
  [InquiryType.OTHER]: "その他",
};

export enum InquiryStatus {
  NEW = "new",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
  WONT_FIX = "wont_fix",
}

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  [InquiryStatus.NEW]: "新規",
  [InquiryStatus.IN_PROGRESS]: "対応中",
  [InquiryStatus.RESOLVED]: "解決済み",
  [InquiryStatus.WONT_FIX]: "対応しない",
};

export type MessageSenderRole = 'user' | 'admin' | 'developer';

export interface InquiryMessage {
  id?: string;
  senderId: string; // userId or 'system'
  senderRole: MessageSenderRole;
  senderName: string; // displayName or username
  content: string;
  createdAt: Date | Timestamp;
}


export interface Inquiry {
  id?: string;
  classId: string;
  userId: string; // The user (student/class_admin) who created it
  userDisplayName: string;
  type: InquiryType;
  title: string; // New: Title for the inquiry thread
  status: InquiryStatus;
  targetRole: 'class_admin' | 'app_developer'; // Who is this inquiry for?
  createdAt: Date | Timestamp;
  updatedAt?: Date | Timestamp;
  lastMessageAt?: Date | Timestamp;
  lastMessageSnippet?: string;
}
