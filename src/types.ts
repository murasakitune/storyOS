export const WORK_STATUSES = [
  "構想",
  "プロット",
  "執筆中",
  "推敲中",
  "完成",
  "保留",
] as const;
export const SCENE_STATUSES = [
  "未着手",
  "執筆中",
  "初稿完了",
  "推敲済み",
] as const;
export const SCENE_TYPES = [
  "導入",
  "進展",
  "発見",
  "対立",
  "悪化",
  "失敗",
  "回復",
  "移動",
  "休息",
  "決着",
  "その他",
] as const;
export const FORESHADOW_STATUSES = [
  "未設置",
  "設置済み",
  "強調済み",
  "回収済み",
  "意図的に未回収",
  "廃止",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export type SceneStatus = (typeof SCENE_STATUSES)[number];
export type SceneType = (typeof SCENE_TYPES)[number];

export interface LongFormSettings {
  targetChapters: number;
  finalResolutionMinScene: number;
  finalResolutionMinProgress: number;
  minOpenThreads: number;
  maxChangesPerScene: number;
  maxConsecutiveSceneType: number;
  warnInstantSuccess: boolean;
  hardLock: boolean;
}
export interface Work {
  id: string;
  title: string;
  tagline: string;
  genre: string;
  status: WorkStatus;
  synopsis: string;
  theme: string;
  targetCharacters: number;
  targetScenes: number;
  longFormSupport: boolean;
  longFormSettings: LongFormSettings;
  createdAt: string;
  updatedAt: string;
  lastEditedAt: string;
}
export interface Chapter {
  id: string;
  workId: string;
  title: string;
  synopsis: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}
export interface SceneDesign {
  purpose: string;
  povCharacterId: string;
  characterIds: string[];
  locationId: string;
  openingSituation: string;
  obstacle: string;
  attempt: string;
  result: string;
  endingChange: string;
  sceneType: SceneType;
  timeline: string;
  hasFullResolution: boolean;
  createsNewProblem: boolean;
  revealsInformation: boolean;
  changesRelationship: boolean;
  changesItemOrState: boolean;
  multipleLocations: boolean;
  majorTimePassage: boolean;
  outcomeSuccessful: boolean;
}
export interface Scene {
  id: string;
  workId: string;
  chapterId: string;
  title: string;
  summary: string;
  body: string;
  notes: string;
  order: number;
  status: SceneStatus;
  design: SceneDesign;
  bodyUpdatedAt: string;
  designUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ReferenceCategory =
  "character" | "location" | "organization" | "item" | "term";
export interface ReferenceEntry {
  id: string;
  workId: string;
  category: ReferenceCategory;
  name: string;
  reading: string;
  aliases: string;
  role: string;
  age: string;
  gender: string;
  appearance: string;
  personality: string;
  objective: string;
  desire: string;
  fear: string;
  secret: string;
  history: string;
  speech: string;
  firstPerson: string;
  secondPerson: string;
  importance: "主要" | "準主要" | "その他";
  firstSceneId: string;
  relatedSceneIds: string[];
  kind: string;
  description: string;
  atmosphere: string;
  region: string;
  relatedCharacterIds: string[];
  memberCharacterIds: string[];
  relations: string;
  ownerCharacterId: string;
  foreshadowId: string;
  relatedEntryIds: string[];
  tags: string[];
  notes: string;
  characterProfile: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
export interface RelationshipChange {
  sceneId: string;
  description: string;
}
export interface Relationship {
  id: string;
  workId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  type: string;
  sourceFeeling: string;
  targetFeeling: string;
  publicRelation: string;
  actualRelation: string;
  startSceneId: string;
  changes: RelationshipChange[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface Foreshadow {
  id: string;
  workId: string;
  name: string;
  description: string;
  setupSceneId: string;
  emphasisSceneIds: string[];
  plannedPayoffSceneId: string;
  payoffSceneId: string;
  status: (typeof FORESHADOW_STATUSES)[number];
  characterIds: string[];
  itemIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface StoryQuestion {
  id: string;
  workId: string;
  question: string;
  occurrenceSceneId: string;
  readerKnows: boolean;
  protagonistKnows: boolean;
  characterIds: string[];
  plannedResolutionSceneId: string;
  resolutionSceneId: string;
  status: "未解決" | "一部解決" | "解決" | "意図的に未解決";
  importance: "高" | "中" | "低";
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface PromiseRecord {
  id: string;
  workId: string;
  content: string;
  speakerCharacterId: string;
  target: string;
  occurrenceSceneId: string;
  due: string;
  fulfillmentSceneId: string;
  status: "未処理" | "履行" | "破棄" | "失敗" | "意図的に未処理";
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface Subplot {
  id: string;
  workId: string;
  name: string;
  synopsis: string;
  characterIds: string[];
  startSceneId: string;
  progressSceneIds: string[];
  plannedResolutionSceneId: string;
  resolutionSceneId: string;
  status: "未開始" | "進行中" | "決着" | "保留";
  mainPlotConnection: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export type WarningDisposition = "active" | "ignored" | "later";
export interface WarningPreference {
  id: string;
  workId: string;
  warningKey: string;
  disposition: WarningDisposition;
  updatedAt: string;
}
export interface SpellingRule {
  id: string;
  workId: string;
  canonical: string;
  variants: string[];
  createdAt: string;
  updatedAt: string;
}
export interface InspectionSettings {
  longParagraph: number;
  shortParagraph: number;
  shortParagraphRun: number;
  longSentence: number;
  punctuationless: number;
  repetitionWindow: number;
  repetitionParagraphs: number;
  excludedWords: string[];
  trackedWords: string[];
}
export interface WorkPreference {
  id: string;
  workId: string;
  inspection: InspectionSettings;
  snapshotLimit: number;
  backupReminderDays: number;
  lastBackupAt: string;
  createdAt: string;
  updatedAt: string;
}
export interface TimelineEvent {
  id: string;
  workId: string;
  title: string;
  description: string;
  storyDate: string;
  order: number;
  sceneIds: string[];
  characterIds: string[];
  locationIds: string[];
  visibility: "公開情報" | "秘密情報";
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface KnowledgeState {
  characterId: string;
  status:
    | "未知"
    | "聞いたが信じていない"
    | "誤って理解している"
    | "知っている"
    | "忘れている"
    | "隠している";
  fromSceneId: string;
}
export interface KnowledgeItem {
  id: string;
  workId: string;
  content: string;
  truth: "真実" | "誤認" | "嘘";
  originSceneId: string;
  source: string;
  questionId: string;
  foreshadowId: string;
  states: KnowledgeState[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface BranchIdea {
  id: string;
  workId: string;
  title: string;
  originSceneId: string;
  content: string;
  merits: string;
  problems: string;
  status: "検討中" | "採用" | "保留" | "没";
  parentId: string;
  characterIds: string[];
  referenceIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface WritingLog {
  id: string;
  workId: string;
  sceneId: string;
  delta: number;
  totalCharacters: number;
  warningCount?: number;
  savedAt: string;
}
export interface Snapshot {
  id: string;
  workId: string;
  name: string;
  notes: string;
  scope: "作品全体" | "本文とプロット";
  createdAt: string;
  bundle: WorkBundle;
}
export interface InspectionFinding {
  id: string;
  type: string;
  sceneId: string;
  sceneTitle: string;
  context: string;
  reason: string;
  metric: string;
}
export interface IntegrityIssue {
  id: string;
  severity: "自動修復可能" | "要確認";
  type: string;
  message: string;
  targetId: string;
  repair?: "normalize-order" | "remove-orphan";
}
export interface CompletionCheck {
  label: string;
  count: number;
  detail: string;
}
export interface StoryWarning {
  key: string;
  rule: string;
  targetType:
    "work" | "scene" | "character" | "foreshadow" | "question" | "subplot";
  targetId: string;
  targetLabel: string;
  reason: string;
  metric: string;
  severity: "情報" | "注意";
}

export interface WorkBundle {
  work: Work;
  chapters: Chapter[];
  scenes: Scene[];
  references: ReferenceEntry[];
  relationships: Relationship[];
  foreshadows: Foreshadow[];
  questions: StoryQuestion[];
  promises: PromiseRecord[];
  subplots: Subplot[];
  warningPreferences: WarningPreference[];
  spellingRules: SpellingRule[];
  workPreferences: WorkPreference[];
  timelineEvents: TimelineEvent[];
  knowledgeItems: KnowledgeItem[];
  branchIdeas: BranchIdea[];
  writingLogs: WritingLog[];
}
export interface ExportEnvelope {
  appName: "Story OS";
  schemaVersion: number;
  exportedAt: string;
  kind: "work" | "all";
  data: WorkBundle | WorkBundle[];
  snapshots?: Snapshot[];
}
export interface SyncTombstone {
  collection: string;
  id: string;
  deletedAt: string;
}
export interface SyncMetaRecord {
  id: "google-drive";
  knownIds: Record<string, string[]>;
  tombstones: SyncTombstone[];
  lastSyncAt: string;
  driveFileId?: string;
}
export type SaveState = "編集中" | "保存中" | "保存済み" | "保存失敗";
