import Dexie, { type EntityTable } from "dexie";
import {
  defaultLongFormSettings,
  defaultWorkPreference,
  defaultSceneDesign,
  normalizeBundle,
  normalizeWork,
} from "./defaults";
import type {
  Chapter,
  Foreshadow,
  PromiseRecord,
  ReferenceEntry,
  Relationship,
  Scene,
  StoryQuestion,
  Subplot,
  WarningPreference,
  Work,
  WorkBundle,
  SpellingRule,
  WorkPreference,
  TimelineEvent,
  KnowledgeItem,
  BranchIdea,
  WritingLog,
  Snapshot,
  SyncMetaRecord,
} from "./types";

class StoryDatabase extends Dexie {
  works!: EntityTable<Work, "id">;
  chapters!: EntityTable<Chapter, "id">;
  scenes!: EntityTable<Scene, "id">;
  references!: EntityTable<ReferenceEntry, "id">;
  relationships!: EntityTable<Relationship, "id">;
  foreshadows!: EntityTable<Foreshadow, "id">;
  questions!: EntityTable<StoryQuestion, "id">;
  promises!: EntityTable<PromiseRecord, "id">;
  subplots!: EntityTable<Subplot, "id">;
  warningPreferences!: EntityTable<WarningPreference, "id">;
  spellingRules!: EntityTable<SpellingRule, "id">;
  workPreferences!: EntityTable<WorkPreference, "id">;
  timelineEvents!: EntityTable<TimelineEvent, "id">;
  knowledgeItems!: EntityTable<KnowledgeItem, "id">;
  branchIdeas!: EntityTable<BranchIdea, "id">;
  writingLogs!: EntityTable<WritingLog, "id">;
  snapshots!: EntityTable<Snapshot, "id">;
  syncMeta!: EntityTable<SyncMetaRecord, "id">;
  constructor() {
    super("StoryOS");
    this.version(1).stores({
      works: "id,title,createdAt,updatedAt,lastEditedAt",
      chapters: "id,workId,[workId+order]",
      scenes: "id,workId,chapterId,[chapterId+order],updatedAt",
    });
    this.version(2)
      .stores({
        works: "id,title,createdAt,updatedAt,lastEditedAt",
        chapters: "id,workId,[workId+order]",
        scenes: "id,workId,chapterId,[chapterId+order],updatedAt",
        references: "id,workId,category,name,*tags",
        relationships: "id,workId,sourceCharacterId,targetCharacterId",
        foreshadows: "id,workId,status",
        questions: "id,workId,status",
        promises: "id,workId,status",
        subplots: "id,workId,status",
        warningPreferences: "id,workId,warningKey",
      })
      .upgrade(async (tx) => {
        await tx
          .table("works")
          .toCollection()
          .modify((work) => {
            work.longFormSupport ??= false;
            work.targetCharacters ??= 80000;
            work.targetScenes ??= 40;
            work.longFormSettings = {
              ...defaultLongFormSettings(),
              ...(work.longFormSettings || {}),
            };
          });
        await tx
          .table("scenes")
          .toCollection()
          .modify((scene) => {
            scene.design = { ...defaultSceneDesign(), ...(scene.design || {}) };
          });
      });
    this.version(3)
      .stores({
        works: "id,title,createdAt,updatedAt,lastEditedAt",
        chapters: "id,workId,[workId+order]",
        scenes: "id,workId,chapterId,[chapterId+order],updatedAt",
        references: "id,workId,category,name,*tags",
        relationships: "id,workId,sourceCharacterId,targetCharacterId",
        foreshadows: "id,workId,status",
        questions: "id,workId,status",
        promises: "id,workId,status",
        subplots: "id,workId,status",
        warningPreferences: "id,workId,warningKey",
        spellingRules: "id,workId,canonical",
        workPreferences: "id,workId",
        timelineEvents: "id,workId,[workId+order],storyDate",
        knowledgeItems: "id,workId,truth",
        branchIdeas: "id,workId,parentId,status",
        writingLogs: "id,workId,sceneId,savedAt",
        snapshots: "id,workId,createdAt",
      })
      .upgrade(async (tx) => {
        const works = await tx.table("works").toArray();
        await tx
          .table("workPreferences")
          .bulkPut(works.map((w) => defaultWorkPreference(w.id)));
      });
    this.version(4).stores({
      works: "id,title,createdAt,updatedAt,lastEditedAt",
      chapters: "id,workId,[workId+order]",
      scenes: "id,workId,chapterId,[chapterId+order],updatedAt",
      references: "id,workId,category,name,*tags",
      relationships: "id,workId,sourceCharacterId,targetCharacterId",
      foreshadows: "id,workId,status",
      questions: "id,workId,status",
      promises: "id,workId,status",
      subplots: "id,workId,status",
      warningPreferences: "id,workId,warningKey",
      spellingRules: "id,workId,canonical",
      workPreferences: "id,workId",
      timelineEvents: "id,workId,[workId+order],storyDate",
      knowledgeItems: "id,workId,truth",
      branchIdeas: "id,workId,parentId,status",
      writingLogs: "id,workId,sceneId,savedAt",
      snapshots: "id,workId,createdAt",
      syncMeta: "id",
    });
  }
}
export const db = new StoryDatabase();
export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
const extendedTables = () =>
  [
    db.references,
    db.relationships,
    db.foreshadows,
    db.questions,
    db.promises,
    db.subplots,
    db.warningPreferences,
    db.spellingRules,
    db.workPreferences,
    db.timelineEvents,
    db.knowledgeItems,
    db.branchIdeas,
    db.writingLogs,
  ] as const;
export async function createWork(title = "無題の作品") {
  const time = now(),
    id = newId();
  const work: Work = {
    id,
    title,
    tagline: "",
    genre: "",
    status: "構想",
    synopsis: "",
    theme: "",
    targetCharacters: 80000,
    targetScenes: 40,
    longFormSupport: false,
    longFormSettings: defaultLongFormSettings(),
    createdAt: time,
    updatedAt: time,
    lastEditedAt: time,
  };
  const chapter: Chapter = {
    id: newId(),
    workId: id,
    title: "第1章",
    synopsis: "",
    order: 0,
    createdAt: time,
    updatedAt: time,
  };
  const scene: Scene = {
    id: newId(),
    workId: id,
    chapterId: chapter.id,
    title: "最初のシーン",
    summary: "",
    body: "",
    notes: "",
    order: 0,
    status: "未着手",
    design: defaultSceneDesign(),
    bodyUpdatedAt: time,
    designUpdatedAt: time,
    createdAt: time,
    updatedAt: time,
  };
  await db.transaction(
    "rw",
    [db.works, db.chapters, db.scenes, db.workPreferences],
    async () => {
      await db.works.add(work);
      await db.chapters.add(chapter);
      await db.scenes.add(scene);
      await db.workPreferences.add(defaultWorkPreference(id));
    },
  );
  return work;
}
export async function getBundle(workId: string): Promise<WorkBundle | null> {
  const raw = await db.works.get(workId);
  if (!raw) return null;
  const [
    chapters,
    scenes,
    references,
    relationships,
    foreshadows,
    questions,
    promises,
    subplots,
    warningPreferences,
    spellingRules,
    workPreferences,
    timelineEvents,
    knowledgeItems,
    branchIdeas,
    writingLogs,
  ] = await Promise.all([
    db.chapters.where("workId").equals(workId).sortBy("order"),
    db.scenes.where("workId").equals(workId).toArray(),
    db.references.where("workId").equals(workId).toArray(),
    db.relationships.where("workId").equals(workId).toArray(),
    db.foreshadows.where("workId").equals(workId).toArray(),
    db.questions.where("workId").equals(workId).toArray(),
    db.promises.where("workId").equals(workId).toArray(),
    db.subplots.where("workId").equals(workId).toArray(),
    db.warningPreferences.where("workId").equals(workId).toArray(),
    db.spellingRules.where("workId").equals(workId).toArray(),
    db.workPreferences.where("workId").equals(workId).toArray(),
    db.timelineEvents.where("workId").equals(workId).toArray(),
    db.knowledgeItems.where("workId").equals(workId).toArray(),
    db.branchIdeas.where("workId").equals(workId).toArray(),
    db.writingLogs.where("workId").equals(workId).toArray(),
  ]);
  return normalizeBundle({
    work: normalizeWork(raw),
    chapters,
    scenes,
    references,
    relationships,
    foreshadows,
    questions,
    promises,
    subplots,
    warningPreferences,
    spellingRules,
    workPreferences,
    timelineEvents,
    knowledgeItems,
    branchIdeas,
    writingLogs,
  });
}
export async function deleteWork(id: string) {
  await db.transaction(
    "rw",
    [db.works, db.chapters, db.scenes, ...extendedTables(), db.snapshots],
    async () => {
      await Promise.all([
        db.scenes.where("workId").equals(id).delete(),
        db.chapters.where("workId").equals(id).delete(),
        ...extendedTables().map((t) => t.where("workId").equals(id).delete()),
        db.snapshots.where("workId").equals(id).delete(),
      ]);
      await db.works.delete(id);
    },
  );
}
export async function putBundle(
  input: Partial<WorkBundle> & Pick<WorkBundle, "work" | "chapters" | "scenes">,
) {
  const b = normalizeBundle(input);
  await db.transaction(
    "rw",
    [db.works, db.chapters, db.scenes, ...extendedTables()],
    async () => {
      await Promise.all([
        db.scenes.where("workId").equals(b.work.id).delete(),
        db.chapters.where("workId").equals(b.work.id).delete(),
        ...extendedTables().map((t) =>
          t.where("workId").equals(b.work.id).delete(),
        ),
      ]);
      await db.works.put(b.work);
      await db.chapters.bulkPut(b.chapters);
      await db.scenes.bulkPut(b.scenes);
      await db.references.bulkPut(b.references);
      await db.relationships.bulkPut(b.relationships);
      await db.foreshadows.bulkPut(b.foreshadows);
      await db.questions.bulkPut(b.questions);
      await db.promises.bulkPut(b.promises);
      await db.subplots.bulkPut(b.subplots);
      await db.warningPreferences.bulkPut(b.warningPreferences);
      await db.spellingRules.bulkPut(b.spellingRules);
      await db.workPreferences.bulkPut(b.workPreferences);
      await db.timelineEvents.bulkPut(b.timelineEvents);
      await db.knowledgeItems.bulkPut(b.knowledgeItems);
      await db.branchIdeas.bulkPut(b.branchIdeas);
      await db.writingLogs.bulkPut(b.writingLogs);
    },
  );
}
