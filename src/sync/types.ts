export const SYNC_COLLECTIONS = [
  "works",
  "chapters",
  "scenes",
  "sceneBodies",
  "sceneDesigns",
  "references",
  "relationships",
  "foreshadows",
  "questions",
  "promises",
  "subplots",
  "warningPreferences",
  "spellingRules",
  "workPreferences",
  "timelineEvents",
  "knowledgeItems",
  "branchIdeas",
  "writingLogs",
  "snapshots",
] as const;

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];
export type SyncRecord = Record<string, unknown> & { id: string };
export type SyncCollections = Record<SyncCollection, SyncRecord[]>;

export interface DriveSyncEnvelope {
  appName: "Story OS";
  schemaVersion: 1;
  exportedAt: string;
  collections: SyncCollections;
  tombstones: Array<{
    collection: SyncCollection;
    id: string;
    deletedAt: string;
  }>;
}

export type SyncPhase =
  "未設定" | "未接続" | "同期中" | "同期完了" | "変更待ち" | "同期失敗";
