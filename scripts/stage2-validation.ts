import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { defaultSceneDesign } from "../src/defaults";
import { analyzeStory } from "../src/analysis";
import { migrateExport } from "../src/migrations";

await Dexie.delete("StoryOS");
const legacy = new Dexie("StoryOS");
legacy.version(1).stores({
  works: "id,title,createdAt,updatedAt,lastEditedAt",
  chapters: "id,workId,[workId+order]",
  scenes: "id,workId,chapterId,[chapterId+order],updatedAt",
});
await legacy.open();
const time = new Date().toISOString();
await legacy.table("works").add({
  id: "legacy-work",
  title: "第1段階作品",
  tagline: "",
  genre: "",
  status: "執筆中",
  synopsis: "",
  theme: "",
  targetCharacters: 80000,
  targetScenes: 40,
  longFormSupport: true,
  createdAt: time,
  updatedAt: time,
  lastEditedAt: time,
});
await legacy.table("chapters").add({
  id: "legacy-chapter",
  workId: "legacy-work",
  title: "第1章",
  synopsis: "",
  order: 0,
  createdAt: time,
  updatedAt: time,
});
await legacy.table("scenes").add({
  id: "legacy-scene",
  workId: "legacy-work",
  chapterId: "legacy-chapter",
  title: "既存本文",
  summary: "",
  body: "保存済みの本文",
  notes: "",
  order: 0,
  status: "執筆中",
  createdAt: time,
  updatedAt: time,
});
legacy.close();

const { db, getBundle, putBundle } = await import("../src/db");
await db.open();
const migrated = await getBundle("legacy-work");
assert(migrated, "旧作品を開ける");
assert.equal(migrated.scenes[0].body, "保存済みの本文", "既存本文が維持される");
assert.equal(
  migrated.scenes[0].design.sceneType,
  "その他",
  "旧シーンに設計既定値が入る",
);
assert.equal(
  migrated.work.longFormSettings.targetChapters,
  12,
  "旧作品に長編設定が入る",
);

await db.references.add({
  id: "hero",
  workId: "legacy-work",
  category: "character",
  name: "主人公",
  reading: "",
  aliases: "",
  role: "主人公",
  age: "",
  gender: "",
  appearance: "",
  personality: "",
  objective: "",
  desire: "",
  fear: "",
  secret: "",
  history: "",
  speech: "",
  firstPerson: "",
  secondPerson: "",
  importance: "主要",
  firstSceneId: "legacy-scene",
  relatedSceneIds: ["legacy-scene"],
  kind: "",
  description: "",
  atmosphere: "",
  region: "",
  relatedCharacterIds: [],
  memberCharacterIds: [],
  relations: "",
  ownerCharacterId: "",
  foreshadowId: "",
  relatedEntryIds: [],
  tags: ["主要"],
  notes: "",
  createdAt: time,
  updatedAt: time,
});
await db.foreshadows.add({
  id: "fs",
  workId: "legacy-work",
  name: "鍵",
  description: "",
  setupSceneId: "",
  emphasisSceneIds: [],
  plannedPayoffSceneId: "legacy-scene",
  payoffSceneId: "legacy-scene",
  status: "設置済み",
  characterIds: ["hero"],
  itemIds: [],
  notes: "",
  createdAt: time,
  updatedAt: time,
});
await db.questions.add({
  id: "q",
  workId: "legacy-work",
  question: "犯人は誰か",
  occurrenceSceneId: "legacy-scene",
  readerKnows: false,
  protagonistKnows: false,
  characterIds: ["hero"],
  plannedResolutionSceneId: "",
  resolutionSceneId: "",
  status: "未解決",
  importance: "高",
  notes: "",
  createdAt: time,
  updatedAt: time,
});
await db.promises.add({
  id: "p",
  workId: "legacy-work",
  content: "必ず戻る",
  speakerCharacterId: "hero",
  target: "仲間",
  occurrenceSceneId: "legacy-scene",
  due: "終盤",
  fulfillmentSceneId: "",
  status: "未処理",
  notes: "",
  createdAt: time,
  updatedAt: time,
});
await db.subplots.add({
  id: "sub",
  workId: "legacy-work",
  name: "友情",
  synopsis: "",
  characterIds: ["hero"],
  startSceneId: "legacy-scene",
  progressSceneIds: [],
  plannedResolutionSceneId: "",
  resolutionSceneId: "",
  status: "進行中",
  mainPlotConnection: "",
  notes: "",
  createdAt: time,
  updatedAt: time,
});
const scene = {
  ...migrated.scenes[0],
  body: "更新後の本文",
  design: { ...defaultSceneDesign(), purpose: "脱出", hasFullResolution: true },
};
await db.scenes.put(scene);
const structured = await getBundle("legacy-work");
assert(structured);
assert.equal(
  structured.scenes[0].body,
  "更新後の本文",
  "本文更新が再読込できる",
);
assert.equal(structured.questions.length, 1);
assert.equal(structured.promises.length, 1);
assert.equal(structured.subplots.length, 1);
assert(
  analyzeStory(structured).some((w) => w.rule === "序盤の完全解決"),
  "構造変更で長編化警告が更新される",
);

const v1 = migrateExport({
  appName: "Story OS",
  schemaVersion: 1,
  exportedAt: time,
  kind: "work",
  data: {
    work: { ...structured.work, longFormSettings: undefined },
    chapters: structured.chapters,
    scenes: structured.scenes.map((s) => ({
      id: s.id,
      workId: s.workId,
      chapterId: s.chapterId,
      title: s.title,
      summary: s.summary,
      body: s.body,
      notes: s.notes,
      order: s.order,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  },
});
const v1bundle = Array.isArray(v1.data) ? v1.data[0] : v1.data;
assert.equal(v1.schemaVersion, 4);
assert.equal(v1bundle.scenes[0].design.sceneType, "その他");
assert.equal(v1bundle.references.length, 0, "第1段階JSONに新規配列を補完");
const copy = {
  ...structured,
  work: { ...structured.work, id: "roundtrip-work", title: "再インポート" },
  chapters: structured.chapters.map((c) => ({
    ...c,
    id: `copy-${c.id}`,
    workId: "roundtrip-work",
  })),
  scenes: structured.scenes.map((s) => ({
    ...s,
    id: `copy-${s.id}`,
    workId: "roundtrip-work",
    chapterId: `copy-${s.chapterId}`,
  })),
  references: [],
  relationships: [],
  foreshadows: [],
  questions: [],
  promises: [],
  subplots: [],
  warningPreferences: [],
};
await putBundle(copy);
assert.equal(
  (await getBundle("roundtrip-work"))?.scenes[0].body,
  "更新後の本文",
  "エクスポート相当データを再投入できる",
);
await db.delete();
console.log(
  "Stage 2 validation passed: migration, structured records, warnings, body persistence, JSON v1 migration, round-trip.",
);
