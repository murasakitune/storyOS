import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookCheck,
  Brain,
  GitBranch,
  History,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { InspectionPage } from "./Stage2";
import { db, getBundle, newId, now } from "./db";
import {
  completionChecks,
  dialogueStats,
  diagnoseIntegrity,
  inspectManuscript,
  timelineCandidates,
  wordFrequency,
} from "./inspection";
import {
  createSnapshot,
  restoreSnapshot,
  snapshotDiff,
} from "./services/snapshots";
import { diagnoseDatabaseReferences } from "./services/integrity";
import type {
  BranchIdea,
  KnowledgeItem,
  Snapshot,
  TimelineEvent,
  Work,
  WorkBundle,
  WorkPreference,
} from "./types";
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
function useBundle(id: string) {
  const [b, setB] = useState<WorkBundle | null>(null);
  const load = useCallback(() => getBundle(id).then(setB), [id]);
  useEffect(() => {
    void load();
  }, [load]);
  return { b, load };
}
const SelectScene = ({
  b,
  value,
  onChange,
}: {
  b: WorkBundle;
  value: string;
  onChange: (v: string) => void;
}) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">未設定</option>
    {b.scenes.map((s) => (
      <option key={s.id} value={s.id}>
        {s.title}
      </option>
    ))}
  </select>
);
export function CommandPalette({
  work,
  onClose,
}: {
  work: Work;
  onClose: () => void;
}) {
  const { b } = useBundle(work.id),
    [q, setQ] = useState(""),
    nav = useNavigate();
  if (!b) return null;
  const needle = q.toLowerCase(),
    results = q
      ? [
          ...b.scenes.map((s) => ({
            type: "シーン",
            title: s.title,
            text: s.body,
            path: `/works/${work.id}/write?scene=${s.id}`,
          })),
          ...b.references.map((r) => ({
            type: "設定資料",
            title: r.name,
            text: [r.description, r.notes, r.aliases].join(" "),
            path: `/works/${work.id}/reference`,
          })),
          ...b.foreshadows.map((f) => ({
            type: "伏線",
            title: f.name,
            text: f.description,
            path: `/works/${work.id}/plot`,
          })),
          ...b.questions.map((x) => ({
            type: "問い",
            title: x.question,
            text: x.notes,
            path: `/works/${work.id}/plot`,
          })),
          ...b.promises.map((x) => ({
            type: "約束",
            title: x.content,
            text: x.notes,
            path: `/works/${work.id}/plot`,
          })),
        ]
          .filter((x) =>
            (x.title + " " + x.text).toLowerCase().includes(needle),
          )
          .slice(0, 40)
      : [];
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="command-palette">
        <header>
          <Search />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="本文、シーン、人物、設定資料、伏線、問い、約束を検索"
          />
        </header>
        <div>
          {results.map((r, i) => (
            <button
              key={`${r.type}-${i}`}
              onClick={() => {
                nav(r.path);
                onClose();
              }}
            >
              <span>{r.type}</span>
              <b>{r.title}</b>
              <small>{r.text.slice(0, 90)}</small>
            </button>
          ))}
          {q && !results.length && <p>該当する項目がありません。</p>}
        </div>
        <footer>Ctrl/⌘ + K で開く · Esc で閉じる</footer>
      </section>
    </div>
  );
}

export function QualityHub({
  work,
  onChange,
}: {
  work: Work;
  onChange: (w: Work) => void;
}) {
  const [tab, setTab] = useState("inspection");
  const tabs = [
    ["inspection", "本文点検", <BookCheck />],
    ["timeline", "タイムライン", <History />],
    ["knowledge", "知識管理", <Brain />],
    ["branches", "分岐案", <GitBranch />],
    ["stats", "統計", <BarChart3 />],
    ["snapshots", "スナップショット", <History />],
    ["integrity", "整合性診断", <ShieldCheck />],
    ["longform", "長編化支援", <AlertTriangle />],
  ];
  return (
    <main className="quality-hub">
      <nav className="quality-nav">
        {tabs.map(([id, label, icon]) => (
          <button
            className={tab === id ? "active" : ""}
            onClick={() => setTab(String(id))}
            key={String(id)}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
      {tab === "inspection" && <InspectionTools work={work} />}{" "}
      {tab === "timeline" && <Timeline work={work} />}{" "}
      {tab === "knowledge" && <Knowledge work={work} />}{" "}
      {tab === "branches" && <Branches work={work} />}{" "}
      {tab === "stats" && <Statistics work={work} />}{" "}
      {tab === "snapshots" && <Snapshots work={work} />}{" "}
      {tab === "integrity" && <Integrity work={work} />}{" "}
      {tab === "longform" && <InspectionPage work={work} onChange={onChange} />}
    </main>
  );
}
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="tool-section panel">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
function InspectionTools({ work }: { work: Work }) {
  const { b, load } = useBundle(work.id),
    [canonical, setCanonical] = useState(""),
    [variants, setVariants] = useState(""),
    [term, setTerm] = useState(""),
    [scope, setScope] = useState<"work" | "chapter" | "scene">("work");
  if (!b) return <div className="loading">点検データを準備中…</div>;
  const pref = b.workPreferences[0],
    settings = pref?.inspection,
    findings = inspectManuscript(b, settings),
    freq = wordFrequency(
      b,
      term
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      scope,
    ),
    dialogue = dialogueStats(b);
  async function addRule() {
    if (!canonical || !variants) return;
    await db.spellingRules.add({
      id: newId(),
      workId: work.id,
      canonical,
      variants: variants
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      createdAt: now(),
      updatedAt: now(),
    });
    setCanonical("");
    setVariants("");
    await load();
  }
  async function saveSettings(next: WorkPreference) {
    await db.workPreferences.put({ ...next, updatedAt: now() });
    await load();
  }
  return (
    <div className="content stage3-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Text inspection</p>
          <h1>本文点検</h1>
        </div>
        <span className="muted">文字列一致と簡易集計による概算です</span>
      </div>
      <Section
        title="表記揺れ辞書"
        action={
          <button className="button" onClick={addRule}>
            <Plus />
            登録
          </button>
        }
      >
        <div className="inline-form">
          <input
            placeholder="正規表記"
            value={canonical}
            onChange={(e) => setCanonical(e.target.value)}
          />
          <input
            placeholder="別表記（カンマ区切り）"
            value={variants}
            onChange={(e) => setVariants(e.target.value)}
          />
        </div>
        <div className="chips">
          {b.spellingRules.map((r) => (
            <span key={r.id}>
              <b>{r.canonical}</b> ← {r.variants.join(" / ")}
              <button
                onClick={async () => {
                  await db.spellingRules.delete(r.id);
                  await load();
                }}
              >
                <Trash2 />
              </button>
            </span>
          ))}
        </div>
      </Section>
      {settings && (
        <Section title="点検しきい値">
          <div className="threshold-grid">
            {(
              [
                ["longParagraph", "長い段落"],
                ["shortParagraph", "短い段落"],
                ["shortParagraphRun", "短段落の連続数"],
                ["longSentence", "長い文"],
                ["punctuationless", "句読点なし長文"],
                ["repetitionWindow", "連続使用の文字範囲"],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={l}>
                <input
                  type="number"
                  value={settings[k]}
                  onChange={(e) =>
                    void saveSettings({
                      ...pref,
                      inspection: { ...settings, [k]: Number(e.target.value) },
                    })
                  }
                />
              </Field>
            ))}
            <Field label="追跡語（カンマ区切り）">
              <input
                value={settings.trackedWords.join(",")}
                onChange={(e) =>
                  void saveSettings({
                    ...pref,
                    inspection: {
                      ...settings,
                      trackedWords: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </Field>
            <Field label="除外語">
              <input
                value={settings.excludedWords.join(",")}
                onChange={(e) =>
                  void saveSettings({
                    ...pref,
                    inspection: {
                      ...settings,
                      excludedWords: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </Field>
          </div>
        </Section>
      )}
      <Section title={`検出結果（${findings.length}件）`}>
        <div className="finding-list">
          {findings.map((f) => (
            <article key={f.id}>
              <b>{f.type}</b>
              <span>{f.sceneTitle}</span>
              <p>…{f.context}…</p>
              <small>
                {f.reason} · {f.metric}
              </small>
            </article>
          ))}
          {!findings.length && (
            <p className="muted">現在の設定では候補がありません。</p>
          )}
        </div>
      </Section>
      <Section title="単語・文字列の使用頻度">
        <div className="inline-form">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="検索語（カンマ区切り、空欄で簡易抽出）"
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="work">作品全体</option>
            <option value="chapter">章単位</option>
            <option value="scene">シーン単位</option>
          </select>
        </div>
        <div className="frequency-grid">
          {freq.map((g) => (
            <article key={g.label}>
              <b>{g.label}</b>
              {g.counts.slice(0, 15).map((x) => (
                <span key={x.term}>
                  {x.term}
                  <strong>{x.count}</strong>
                </span>
              ))}
            </article>
          ))}
        </div>
      </Section>
      <Section title="会話文比率（「」内を会話として概算）">
        <div className="table-list">
          {dialogue.map((d) => (
            <div key={d.chapter}>
              <b>{d.chapter}</b>
              <span>会話 {d.dialogue}字</span>
              <span>地の文 {d.narrative}字</span>
              <strong>{d.ratio}%</strong>
            </div>
          ))}
        </div>
      </Section>
      <Section title="登場人物名の出現（単純な文字列一致による概算）">
        <div className="table-list">
          {b.references
            .filter((r) => r.category === "character")
            .map((character) => {
              const names = [
                character.name,
                ...character.aliases
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              ];
              const hits = b.scenes
                .map((scene) => ({
                  scene: scene.title,
                  count: names.reduce(
                    (n, name) => n + scene.body.split(name).length - 1,
                    0,
                  ),
                }))
                .filter((x) => x.count);
              return (
                <div key={character.id}>
                  <b>{character.name}</b>
                  <span>{hits.reduce((n, x) => n + x.count, 0)}回</span>
                  <span>
                    {hits.map((x) => `${x.scene} ${x.count}`).join(" / ") ||
                      "本文中の出現なし"}
                  </span>
                </div>
              );
            })}
        </div>
      </Section>
      <FinalReview b={b} />
    </div>
  );
}
function FinalReview({ b }: { b: WorkBundle }) {
  const broken = (id: string) => id && !b.scenes.some((s) => s.id === id);
  const rows = [
    ...b.foreshadows
      .filter((f) => !["回収済み", "廃止", "意図的に未回収"].includes(f.status))
      .map((f) => ["未回収伏線", f.name]),
    ...b.questions
      .filter((q) => ["未解決", "一部解決"].includes(q.status))
      .map((q) => ["未解決の問い", q.question]),
    ...b.promises
      .filter((p) => p.status === "未処理")
      .map((p) => ["未処理の約束", p.content]),
    ...b.subplots
      .filter((s) => s.status !== "決着")
      .map((s) => ["未決着サブプロット", s.name]),
    ...b.timelineEvents
      .filter((e) => e.sceneIds.some(broken))
      .map((e) => ["削除済みシーン参照", e.title]),
  ];
  return (
    <Section title="伏線・問い・約束の最終確認">
      <div className="table-list">
        {rows.map((r, i) => (
          <div key={i}>
            <b>{r[0]}</b>
            <span>{r[1]}</span>
          </div>
        ))}
        {!rows.length && (
          <p className="muted">確認が必要な項目はありません。</p>
        )}
      </div>
    </Section>
  );
}
function Timeline({ work }: { work: Work }) {
  const { b, load } = useBundle(work.id),
    [edit, setEdit] = useState<TimelineEvent | null>(null);
  if (!b) return <div className="loading">読み込み中…</div>;
  const issues = timelineCandidates(b.timelineEvents, b);
  function fresh(): TimelineEvent {
    return {
      id: newId(),
      workId: work.id,
      title: "",
      description: "",
      storyDate: "",
      order: b!.timelineEvents.length,
      sceneIds: [],
      characterIds: [],
      locationIds: [],
      visibility: "公開情報",
      notes: "",
      createdAt: now(),
      updatedAt: now(),
    };
  }
  async function save() {
    if (!edit?.title) return;
    await db.timelineEvents.put({ ...edit, updatedAt: now() });
    setEdit(null);
    await load();
  }
  return (
    <div className="content stage3-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Chronology</p>
          <h1>タイムライン</h1>
        </div>
        <button className="button primary" onClick={() => setEdit(fresh())}>
          <Plus />
          出来事
        </button>
      </div>
      {issues.length > 0 && (
        <div className="candidate-box">
          <b>矛盾候補</b>
          {issues.map((x) => (
            <p key={x}>{x}</p>
          ))}
        </div>
      )}
      <div className="vertical-timeline">
        {[...b.timelineEvents]
          .sort((a, z) => a.order - z.order)
          .map((e) => (
            <article key={e.id} onClick={() => setEdit(e)}>
              <time>{e.storyDate || "日時不明"}</time>
              <div>
                <h2>{e.title}</h2>
                <p>{e.description}</p>
                <small>
                  {e.visibility} · 関連シーン {e.sceneIds.length}
                </small>
              </div>
              <button
                className="icon"
                onClick={async (ev) => {
                  ev.stopPropagation();
                  if (confirm("削除しますか？")) {
                    await db.timelineEvents.delete(e.id);
                    await load();
                  }
                }}
              >
                <Trash2 />
              </button>
            </article>
          ))}
      </div>
      {edit && (
        <div className="inline-editor panel">
          <h2>タイムライン項目</h2>
          <div className="form-grid">
            <Field label="タイトル">
              <input
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="作品内日時（曖昧な記述可）">
              <input
                value={edit.storyDate}
                onChange={(e) =>
                  setEdit({ ...edit, storyDate: e.target.value })
                }
                placeholder="2026-04-01 / 春頃"
              />
            </Field>
            <Field label="説明">
              <textarea
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <Field label="並び順">
              <input
                type="number"
                value={edit.order}
                onChange={(e) =>
                  setEdit({ ...edit, order: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="関連シーン">
              <select
                multiple
                value={edit.sceneIds}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    sceneIds: [...e.target.selectedOptions].map((x) => x.value),
                  })
                }
              >
                {b.scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="関連人物">
              <select
                multiple
                value={edit.characterIds}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    characterIds: [...e.target.selectedOptions].map(
                      (x) => x.value,
                    ),
                  })
                }
              >
                {b.references
                  .filter((r) => r.category === "character")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="関連場所">
              <select
                multiple
                value={edit.locationIds}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    locationIds: [...e.target.selectedOptions].map(
                      (x) => x.value,
                    ),
                  })
                }
              >
                {b.references
                  .filter((r) => r.category === "location")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="公開区分">
              <select
                value={edit.visibility}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    visibility: e.target.value as TimelineEvent["visibility"],
                  })
                }
              >
                <option>公開情報</option>
                <option>秘密情報</option>
              </select>
            </Field>
            <Field label="メモ">
              <textarea
                value={edit.notes}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              />
            </Field>
          </div>
          <div className="editor-actions">
            <button className="button" onClick={() => setEdit(null)}>
              閉じる
            </button>
            <button className="button primary" onClick={save}>
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Knowledge({ work }: { work: Work }) {
  const { b, load } = useBundle(work.id),
    [scene, setScene] = useState(""),
    [edit, setEdit] = useState<KnowledgeItem | null>(null);
  if (!b) return <div className="loading">読み込み中…</div>;
  const chars = b.references.filter((r) => r.category === "character"),
    sceneIndex = new Map(b.scenes.map((s, i) => [s.id, i]));
  const effective = (item: KnowledgeItem, cid: string) =>
    item.states
      .filter(
        (s) =>
          s.characterId === cid &&
          (sceneIndex.get(s.fromSceneId) ?? -1) <=
            (sceneIndex.get(scene) ?? Infinity),
      )
      .at(-1)?.status || "未知";
  function fresh(): KnowledgeItem {
    return {
      id: newId(),
      workId: work.id,
      content: "",
      truth: "真実",
      originSceneId: "",
      source: "",
      questionId: "",
      foreshadowId: "",
      states: [],
      notes: "",
      createdAt: now(),
      updatedAt: now(),
    };
  }
  async function save() {
    if (!edit?.content) return;
    await db.knowledgeItems.put({ ...edit, updatedAt: now() });
    setEdit(null);
    await load();
  }
  return (
    <div className="content stage3-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Who knows what</p>
          <h1>キャラクター知識</h1>
        </div>
        <button className="button primary" onClick={() => setEdit(fresh())}>
          <Plus />
          知識項目
        </button>
      </div>
      <div className="toolbar">
        <Field label="このシーン時点">
          <SelectScene b={b} value={scene} onChange={setScene} />
        </Field>
      </div>
      <div className="knowledge-grid">
        {b.knowledgeItems.map((k) => (
          <article className="panel" key={k.id} onClick={() => setEdit(k)}>
            <header>
              <b>{k.content}</b>
              <span>{k.truth}</span>
            </header>
            <small>情報源: {k.source || "未設定"}</small>
            {chars.map((c) => (
              <p key={c.id}>
                <b>{c.name}</b>
                <span>{effective(k, c.id)}</span>
              </p>
            ))}
          </article>
        ))}
      </div>
      {edit && (
        <div className="inline-editor panel">
          <h2>知識項目</h2>
          <div className="form-grid">
            <Field label="内容">
              <textarea
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
            </Field>
            <Field label="真偽">
              <select
                value={edit.truth}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    truth: e.target.value as KnowledgeItem["truth"],
                  })
                }
              >
                <option>真実</option>
                <option>誤認</option>
                <option>嘘</option>
              </select>
            </Field>
            <Field label="情報の発生シーン">
              <SelectScene
                b={b}
                value={edit.originSceneId}
                onChange={(v) => setEdit({ ...edit, originSceneId: v })}
              />
            </Field>
            <Field label="情報源">
              <input
                value={edit.source}
                onChange={(e) => setEdit({ ...edit, source: e.target.value })}
              />
            </Field>
            <Field label="関連する問い">
              <select
                value={edit.questionId}
                onChange={(e) =>
                  setEdit({ ...edit, questionId: e.target.value })
                }
              >
                <option value="">なし</option>
                {b.questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.question}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="関連する伏線">
              <select
                value={edit.foreshadowId}
                onChange={(e) =>
                  setEdit({ ...edit, foreshadowId: e.target.value })
                }
              >
                <option value="">なし</option>
                {b.foreshadows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <h3>人物ごとの状態</h3>
          {chars.map((c) => {
            const state = edit.states.find((s) => s.characterId === c.id) || {
              characterId: c.id,
              status: "未知" as const,
              fromSceneId: "",
            };
            return (
              <div className="knowledge-state" key={c.id}>
                <b>{c.name}</b>
                <select
                  value={state.status}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      states: [
                        ...edit.states.filter((s) => s.characterId !== c.id),
                        {
                          ...state,
                          status: e.target.value as typeof state.status,
                        },
                      ],
                    })
                  }
                >
                  {[
                    "未知",
                    "聞いたが信じていない",
                    "誤って理解している",
                    "知っている",
                    "忘れている",
                    "隠している",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <SelectScene
                  b={b}
                  value={state.fromSceneId}
                  onChange={(v) =>
                    setEdit({
                      ...edit,
                      states: [
                        ...edit.states.filter((s) => s.characterId !== c.id),
                        { ...state, fromSceneId: v },
                      ],
                    })
                  }
                />
              </div>
            );
          })}
          <div className="editor-actions">
            <button className="button" onClick={() => setEdit(null)}>
              閉じる
            </button>
            <button className="button primary" onClick={save}>
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Branches({ work }: { work: Work }) {
  const { b, load } = useBundle(work.id),
    [edit, setEdit] = useState<BranchIdea | null>(null);
  if (!b) return <div className="loading">読み込み中…</div>;
  function fresh(): BranchIdea {
    return {
      id: newId(),
      workId: work.id,
      title: "",
      originSceneId: "",
      content: "",
      merits: "",
      problems: "",
      status: "検討中",
      parentId: "",
      characterIds: [],
      referenceIds: [],
      notes: "",
      createdAt: now(),
      updatedAt: now(),
    };
  }
  async function save() {
    if (!edit?.title) return;
    await db.branchIdeas.put({ ...edit, updatedAt: now() });
    setEdit(null);
    await load();
  }
  return (
    <div className="content stage3-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Alternatives</p>
          <h1>分岐案・没案</h1>
        </div>
        <button className="button primary" onClick={() => setEdit(fresh())}>
          <Plus />
          展開案
        </button>
      </div>
      <div className="branch-tree">
        {b.branchIdeas.map((x) => (
          <article
            className="panel"
            key={x.id}
            style={{ marginLeft: x.parentId ? 30 : 0 }}
            onClick={() => setEdit(x)}
          >
            <header>
              <b>{x.title}</b>
              <span>{x.status}</span>
            </header>
            <p>{x.content}</p>
            <small>
              {x.parentId &&
                `親案: ${b.branchIdeas.find((p) => p.id === x.parentId)?.title || "不明"}`}
            </small>
          </article>
        ))}
      </div>
      {edit && (
        <div className="inline-editor panel">
          <h2>展開案</h2>
          <div className="form-grid">
            {(
              [
                ["title", "案のタイトル"],
                ["content", "内容"],
                ["merits", "長所"],
                ["problems", "問題点"],
                ["notes", "メモ"],
              ] as const
            ).map(([k, l]) => (
              <Field label={l} key={k}>
                {k === "title" ? (
                  <input
                    value={edit[k]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                ) : (
                  <textarea
                    value={edit[k]}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                )}
              </Field>
            ))}
            <Field label="起点シーン">
              <SelectScene
                b={b}
                value={edit.originSceneId}
                onChange={(v) => setEdit({ ...edit, originSceneId: v })}
              />
            </Field>
            <Field label="状態">
              <select
                value={edit.status}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    status: e.target.value as BranchIdea["status"],
                  })
                }
              >
                {["検討中", "採用", "保留", "没"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="親案">
              <select
                value={edit.parentId}
                onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}
              >
                <option value="">なし</option>
                {b.branchIdeas
                  .filter((x) => x.id !== edit.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="関連人物・設定">
              <select
                multiple
                value={[...edit.characterIds, ...edit.referenceIds]}
                onChange={(e) => {
                  const ids = [...e.target.selectedOptions].map((x) => x.value);
                  setEdit({
                    ...edit,
                    characterIds: ids.filter(
                      (id) =>
                        b.references.find((r) => r.id === id)?.category ===
                        "character",
                    ),
                    referenceIds: ids.filter(
                      (id) =>
                        b.references.find((r) => r.id === id)?.category !==
                        "character",
                    ),
                  });
                }}
              >
                {b.references.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="editor-actions">
            <button className="button" onClick={() => setEdit(null)}>
              閉じる
            </button>
            <button className="button primary" onClick={save}>
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Statistics({ work }: { work: Work }) {
  const { b } = useBundle(work.id);
  if (!b) return <div className="loading">集計中…</div>;
  const chapter = b.chapters.map((c) => ({
      name: c.title,
      value: b.scenes
        .filter((s) => s.chapterId === c.id)
        .reduce((n, s) => n + [...s.body.replace(/\s/g, "")].length, 0),
    })),
    max = Math.max(1, ...chapter.map((x) => x.value));
  const byDay = new Map<string, number>();
  b.writingLogs.forEach((l) =>
    byDay.set(
      l.savedAt.slice(0, 10),
      (byDay.get(l.savedAt.slice(0, 10)) || 0) + l.delta,
    ),
  );
  const days = [...byDay.entries()].sort(),
    last = (n: number) => days.slice(-n).reduce((a, [, v]) => a + v, 0);
  const tally = (values: string[]) =>
    Object.entries(
      values.reduce<Record<string, number>>((m, v) => {
        m[v || "未設定"] = (m[v || "未設定"] || 0) + 1;
        return m;
      }, {}),
    );
  const characterName = (id: string) =>
      b.references.find((r) => r.id === id)?.name || "未設定",
    locationName = (id: string) =>
      b.references.find((r) => r.id === id)?.name || "未設定";
  return (
    <div className="content stage3-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Writing data</p>
          <h1>執筆統計</h1>
        </div>
      </div>
      <div className="stat-grid">
        <div>
          <span>累計文字数</span>
          <b>
            {b.scenes
              .reduce((n, s) => n + [...s.body.replace(/\s/g, "")].length, 0)
              .toLocaleString()}
          </b>
          <small>字</small>
        </div>
        <div>
          <span>直近7日</span>
          <b>{last(7).toLocaleString()}</b>
          <small>字</small>
        </div>
        <div>
          <span>直近30日</span>
          <b>{last(30).toLocaleString()}</b>
          <small>字</small>
        </div>
        <div>
          <span>記録日数</span>
          <b>{days.length}</b>
          <small>日</small>
        </div>
      </div>
      <Section title="章ごとの文字数">
        <div className="bar-chart">
          {chapter.map((x) => (
            <div key={x.name}>
              <span>{x.name}</span>
              <i style={{ width: `${(x.value / max) * 100}%` }} />
              <b>{x.value.toLocaleString()}</b>
            </div>
          ))}
        </div>
      </Section>
      <Section title="日別執筆文字数">
        <div className="table-list">
          {days
            .slice(-30)
            .reverse()
            .map(([d, v]) => (
              <div key={d}>
                <b>{d}</b>
                <span>
                  {v >= 0 ? "+" : ""}
                  {v.toLocaleString()}字
                </span>
              </div>
            ))}
        </div>
      </Section>
      <Section title="シーン統計">
        <div className="table-list">
          {b.scenes.map((s) => (
            <div key={s.id}>
              <b>{s.title}</b>
              <span>{[...s.body.replace(/\s/g, "")].length}字</span>
              <span>{s.design.sceneType}</span>
              <span>{s.status}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="構成分布">
        <div className="distribution-grid">
          <div>
            <b>シーン種別</b>
            {tally(b.scenes.map((s) => s.design.sceneType)).map(([k, v]) => (
              <span key={k}>
                {k}
                <strong>{v}</strong>
              </span>
            ))}
          </div>
          <div>
            <b>視点人物</b>
            {tally(
              b.scenes.map((s) => characterName(s.design.povCharacterId)),
            ).map(([k, v]) => (
              <span key={k}>
                {k}
                <strong>{v}</strong>
              </span>
            ))}
          </div>
          <div>
            <b>登場人物</b>
            {tally(
              b.scenes.flatMap((s) => s.design.characterIds.map(characterName)),
            ).map(([k, v]) => (
              <span key={k}>
                {k}
                <strong>{v}</strong>
              </span>
            ))}
          </div>
          <div>
            <b>場所</b>
            {tally(b.scenes.map((s) => locationName(s.design.locationId))).map(
              ([k, v]) => (
                <span key={k}>
                  {k}
                  <strong>{v}</strong>
                </span>
              ),
            )}
          </div>
          <div>
            <b>ステータス</b>
            {tally(b.scenes.map((s) => s.status)).map(([k, v]) => (
              <span key={k}>
                {k}
                <strong>{v}</strong>
              </span>
            ))}
          </div>
          <div>
            <b>長編化警告の推移</b>
            {b.writingLogs
              .filter((l) => l.warningCount !== undefined)
              .slice(-10)
              .map((l) => (
                <span key={l.id}>
                  {l.savedAt.slice(0, 10)}
                  <strong>{l.warningCount}</strong>
                </span>
              ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
function Snapshots({ work }: { work: Work }) {
  const { b } = useBundle(work.id),
    [rows, setRows] = useState<Snapshot[]>([]),
    load = useCallback(
      () =>
        db.snapshots
          .where("workId")
          .equals(work.id)
          .reverse()
          .sortBy("createdAt")
          .then(setRows),
      [work.id],
    );
  useEffect(() => {
    void load();
  }, [load]);
  if (!b) return <div className="loading">読み込み中…</div>;
  const chars = b.scenes.reduce(
    (n, s) => n + [...s.body.replace(/\s/g, "")].length,
    0,
  );
  async function add() {
    const name = prompt("スナップショット名", "手動スナップショット");
    if (name) {
      await createSnapshot(work.id, name);
      await load();
    }
  }
  return (
    <div className="content stage3-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Version safety</p>
          <h1>スナップショット</h1>
        </div>
        <button className="button primary" onClick={add}>
          <Plus />
          作成
        </button>
      </div>
      {b.workPreferences[0] && (
        <label className="field snapshot-limit">
          <span>保存数上限</span>
          <input
            type="number"
            min="1"
            max="100"
            value={b.workPreferences[0].snapshotLimit}
            onChange={(e) =>
              void db.workPreferences.put({
                ...b.workPreferences[0],
                snapshotLimit: Number(e.target.value),
                updatedAt: now(),
              })
            }
          />
        </label>
      )}
      <div className="snapshot-list">
        {rows.map((s) => {
          const d = snapshotDiff(s, chars, b.scenes.length);
          return (
            <article className="panel" key={s.id}>
              <div>
                <b>{s.name}</b>
                <small>{new Date(s.createdAt).toLocaleString("ja-JP")}</small>
                <p>{s.notes || s.scope}</p>
              </div>
              <span>
                現在との差: {d.characters >= 0 ? "+" : ""}
                {d.characters}字 / {d.scenes >= 0 ? "+" : ""}
                {d.scenes}シーン
              </span>
              <button
                className="button"
                onClick={async () => {
                  if (
                    confirm(
                      `「${s.name}」へ復元しますか？復元直前の状態は自動保存されます。`,
                    )
                  ) {
                    await restoreSnapshot(s.id);
                    location.reload();
                  }
                }}
              >
                復元
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
function Integrity({ work }: { work: Work }) {
  const { b, load } = useBundle(work.id);
  const [external, setExternal] = useState<import("./types").IntegrityIssue[]>(
    [],
  );
  useEffect(() => {
    void diagnoseDatabaseReferences().then(setExternal);
  }, []);
  if (!b) return <div className="loading">診断中…</div>;
  const issues = [
    ...diagnoseIntegrity(b),
    ...external,
    ...(db.verno !== 4
      ? [
          {
            id: "schema-version",
            severity: "要確認" as const,
            type: "schemaVersion不整合",
            message: `IndexedDBはv${db.verno}です`,
            targetId: "",
          },
        ]
      : []),
  ];
  async function repair() {
    if (!issues.some((i) => i.repair)) return;
    await createSnapshot(work.id, "整合性修復前（自動）");
    for (const c of b!.chapters) {
      const scenes = b!.scenes
        .filter((s) => s.chapterId === c.id)
        .sort((a, z) => a.order - z.order);
      const stamp = now();
      await db.scenes.bulkPut(
        scenes.map((s, i) => ({ ...s, order: i, updatedAt: stamp })),
      );
    }
    await load();
  }
  return (
    <div className="content stage3-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Data health</p>
          <h1>データ整合性診断</h1>
        </div>
        <button className="button" onClick={repair}>
          自動修復可能な項目を修復
        </button>
      </div>
      <div className="notice">
        <b>{issues.length}件の診断結果</b>
        <p>
          自動修復の前にスナップショットを作成します。要確認の項目は自動変更しません。
        </p>
      </div>
      <div className="finding-list">
        {issues.map((i) => (
          <article key={i.id}>
            <b>{i.type}</b>
            <span>{i.severity}</span>
            <p>{i.message}</p>
          </article>
        ))}
        {!issues.length && (
          <p className="muted-box">データの問題は見つかりませんでした。</p>
        )}
      </div>
    </div>
  );
}
export function CompletionDialog({
  b,
  onCancel,
  onComplete,
}: {
  b: WorkBundle;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const checks = completionChecks(b);
  return (
    <div className="modal-backdrop">
      <section className="modal completion-modal">
        <header>
          <h2>完結前チェック</h2>
        </header>
        <div className="modal-body">
          <p>警告は助言です。残っていても意図した状態として完成にできます。</p>
          <div className="table-list">
            {checks.map((c) => (
              <div key={c.label}>
                <b>{c.label}</b>
                <strong>{c.count.toLocaleString()}</strong>
                <span>{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
        <footer>
          <button className="button" onClick={onCancel}>
            戻る
          </button>
          <button className="button primary" onClick={onComplete}>
            意図した状態として完成にする
          </button>
        </footer>
      </section>
    </div>
  );
}
