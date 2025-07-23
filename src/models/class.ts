
export interface ClassMetadata {
    id: string; // Document ID in Firestore, the actual classId
    className: string; // e.g., "1年A組"
    classCode: string; // The code used for login, e.g., "1A-2024"
}
