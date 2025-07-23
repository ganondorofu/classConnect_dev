
export type UserRole = 'class_admin' | 'student';

export interface CustomUser {
  id: string;
  classId: string;
  classCode: string;
  username: string;
  // In a real app, this would be a hashed password.
  // For this prototype, we'll store it in plaintext, which is NOT secure.
  password?: string; 
  role: UserRole;
  displayName?: string; // e.g., "山田 太郎"
  disabled?: boolean;
}
