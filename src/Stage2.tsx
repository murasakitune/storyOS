import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { analyzeStory, foreshadowIssues, orderedScenes } from "./analysis";
import {
  applySheetToCharacter,
  CHARACTER_SHEET_SECTIONS,
  characterSheetFilename,
  characterToSheet,
} from "./character-sheet";
import { emptyReference } from "./defaults";
import { db, getBundle, newId, now } from "./db";
import { environment, filePort } from "./services/platform";
import {
  FORESHADOW_STATUSES,
  SCENE_TYPES,
  type Foreshadow,
  type PromiseRecord,
  type ReferenceCategory,
  type ReferenceEntry,
  type Relationship,
  type Scene,
  type StoryQuestion,
  type Subplot,
  type WarningDisposition,
  type Work,
  type WorkBundle,
} from "./types";

const labels: Record<string, string> = {
  character: "キャラクター",
  location: "場所",
  organization: "組織",
  item: "アイテム",
  term: "用語",
};
const Field = ({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) => (
  <label className={`field ${wide ? "wide" : ""}`}>
    <span>{label}</span>
    {children}
  </label>
);
const Multi = ({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: { id: string; name?: string; title?: string }[];
}) => (
  <div className="check-list">
    {options.map((o) => (
      <label key={o.id}>
        <input
          type="checkbox"
          checked={value.includes(o.id)}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? [...value, o.id]
                : value.filter((x) => x !== o.id),
            )
          }
        />
        {o.name || o.title}
      </label>
    ))}
  </div>
);
function Modal({
  title,
  children,
  onClose,
  onSave,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal">
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer>
          <button className="button" onClick={onClose}>
            キャンセル
          </button>
          <button className="button primary" onClick={onSave}>
            保存
          </button>
        </footer>
      </section>
    </div>
  );
}
function useBundle(workId: string) {
  const [bundle, setBundle] = useState<WorkBundle | null>(null);
  const reload = useCallback(() => getBundle(workId).then(setBundle), [workId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { bundle, reload };
}
const charName = (b: WorkBundle, id: string) =>
  b.references.find((r) => r.id === id)?.name || "未設定";

export function ReferencePage({ work }: { work: Work }) {
  const { bundle, reload } = useBundle(work.id),
    [category, setCategory] = useState<string>("character"),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [editing, setEditing] = useState<ReferenceEntry | null>(null),
    [relation, setRelation] = useState<Relationship | null>(null),
    characterInput = useRef<HTMLInputElement>(null);
  if (!bundle) return <div className="loading">読み込み中…</div>;
  const chars = bundle.references.filter((r) => r.category === "character"),
    items = bundle.references.filter(
      (r) =>
        r.category === category &&
        r.name.toLowerCase().includes(search.toLowerCase()) &&
        (!tag || r.tags.includes(tag)),
    ),
    tags = [
      ...new Set(
        bundle.references
          .filter((r) => r.category === category)
          .flatMap((r) => r.tags),
      ),
    ];
  async function save() {
    if (!editing?.name.trim()) return alert("名前を入力してください。");
    await db.references.put({ ...editing, updatedAt: now() });
    setEditing(null);
    await reload();
  }
  async function remove(r: ReferenceEntry) {
    if (confirm(`「${r.name}」を削除しますか？`)) {
      await db.references.delete(r.id);
      await reload();
    }
  }
  async function saveRelation() {
    if (!relation?.sourceCharacterId || !relation.targetCharacterId)
      return alert("起点と対象の人物を選択してください。");
    await db.relationships.put({ ...relation, updatedAt: now() });
    setRelation(null);
    await reload();
  }
  async function exportCharacter(character: ReferenceEntry) {
    await filePort.saveCharacter?.(
      characterToSheet(character),
      characterSheetFilename(character),
    );
  }
  async function importCharacter(value: unknown) {
    const base = emptyReference("character", work.id, newId(), now());
    const character = {
      ...applySheetToCharacter(base, value),
      updatedAt: now(),
    };
    await db.references.put(character);
    await reload();
    setCategory("character");
    setEditing(character);
  }
  async function importCharacterNative() {
    try {
      const value = await filePort.openCharacter?.();
      if (value) await importCharacter(value);
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "読み込みに失敗しました。",
      );
    }
  }
  async function importCharacterFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await importCharacter(await filePort.readJson(file));
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "読み込みに失敗しました。",
      );
    }
  }
  function printCharacterSheet() {
    document.body.classList.add("printing-character-sheet");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("printing-character-sheet"),
      { once: true },
    );
    window.print();
  }
  const make = () => {
    const e = emptyReference(
      category as ReferenceCategory,
      work.id,
      newId(),
      now(),
    );
    setEditing(e);
  };
  return (
    <main className="content reference-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">World bible</p>
          <h1>設定資料</h1>
        </div>
        <div className="heading-actions">
          {category === "character" && (
            <>
              <button
                className="button"
                onClick={() =>
                  environment.kind === "electron"
                    ? void importCharacterNative()
                    : characterInput.current?.click()
                }
              >
                <Upload /> .charaを読込
              </button>
              <input
                ref={characterInput}
                hidden
                type="file"
                accept=".chara,.json,application/json"
                onChange={importCharacterFile}
              />
            </>
          )}
          <button
            className="button primary"
            onClick={
              category === "relationship"
                ? () =>
                    setRelation({
                      id: newId(),
                      workId: work.id,
                      sourceCharacterId: "",
                      targetCharacterId: "",
                      type: "",
                      sourceFeeling: "",
                      targetFeeling: "",
                      publicRelation: "",
                      actualRelation: "",
                      startSceneId: "",
                      changes: [],
                      notes: "",
                      createdAt: now(),
                      updatedAt: now(),
                    })
                : make
            }
          >
            <Plus />
            追加
          </button>
        </div>
      </div>
      <div className="subtabs">
        {([...Object.keys(labels), "relationship"] as const).map((k) => (
          <button
            key={k}
            className={category === k ? "active" : ""}
            onClick={() => setCategory(k)}
          >
            {k === "relationship" ? "人間関係" : labels[k]}
          </button>
        ))}
      </div>
      {category !== "relationship" && (
        <div className="toolbar">
          <div className="search">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${labels[category]}を検索`}
            />
          </div>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">すべてのタグ</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      )}
      {category === "relationship" ? (
        <div className="relation-list">
          {bundle.relationships.map((r) => (
            <article
              className="panel"
              key={r.id}
              onClick={() => setRelation(r)}
            >
              <div className="relation-pair">
                <b>{charName(bundle, r.sourceCharacterId)}</b>
                <span>{r.type || "関係"}</span>
                <b>{charName(bundle, r.targetCharacterId)}</b>
              </div>
              <p>{r.publicRelation || r.actualRelation || "詳細未設定"}</p>
              <small>
                {r.sourceFeeling &&
                  `${charName(bundle, r.sourceCharacterId)} → ${r.sourceFeeling}`}{" "}
                {r.targetFeeling &&
                  `／ ${charName(bundle, r.targetCharacterId)} → ${r.targetFeeling}`}
              </small>
              <button
                className="icon corner"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm("この関係を削除しますか？")) {
                    await db.relationships.delete(r.id);
                    await reload();
                  }
                }}
              >
                <Trash2 />
              </button>
            </article>
          ))}
          {!bundle.relationships.length && (
            <p className="muted-box">
              人物同士の関係を登録すると、表向きと実際の関係、変化履歴を整理できます。
            </p>
          )}
        </div>
      ) : (
        <div className="reference-grid">
          {items.map((r) => (
            <article
              className="reference-card"
              key={r.id}
              onClick={() => setEditing(r)}
            >
              <div>
                <span className="status">{r.importance}</span>
                <h2>{r.name}</h2>
                <small>{r.reading}</small>
              </div>
              <p>
                {r.role ||
                  r.kind ||
                  r.description ||
                  r.notes ||
                  "詳細は未設定です"}
              </p>
              <div className="tags">
                {r.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="corner card-corner-actions">
                {r.category === "character" && (
                  <button
                    className="icon"
                    title="character_sheet.html互換形式で書き出す"
                    onClick={(e) => {
                      e.stopPropagation();
                      void exportCharacter(r);
                    }}
                  >
                    <Download />
                  </button>
                )}
                <button
                  className="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(r);
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
          {!items.length && (
            <p className="muted-box">
              まだ登録がありません。「追加」から作成できます。
            </p>
          )}
        </div>
      )}
      {editing && (
        <Modal
          title={`${labels[editing.category]}を編集`}
          onClose={() => setEditing(null)}
          onSave={save}
        >
          <div className="form-grid">
            <Field label={editing.category === "term" ? "用語名" : "名前"}>
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <Field label="読み">
              <input
                value={editing.reading}
                onChange={(e) =>
                  setEditing({ ...editing, reading: e.target.value })
                }
              />
            </Field>
            {editing.category === "character" && (
              <>
                <Field label="別名">
                  <input
                    value={editing.aliases}
                    onChange={(e) =>
                      setEditing({ ...editing, aliases: e.target.value })
                    }
                  />
                </Field>
                <Field label="役割">
                  <input
                    value={editing.role}
                    onChange={(e) =>
                      setEditing({ ...editing, role: e.target.value })
                    }
                  />
                </Field>
                <Field label="年齢">
                  <input
                    value={editing.age}
                    onChange={(e) =>
                      setEditing({ ...editing, age: e.target.value })
                    }
                  />
                </Field>
                <Field label="性別（自由記述）">
                  <input
                    value={editing.gender}
                    onChange={(e) =>
                      setEditing({ ...editing, gender: e.target.value })
                    }
                  />
                </Field>
                {(
                  [
                    "appearance",
                    "personality",
                    "objective",
                    "desire",
                    "fear",
                    "secret",
                    "history",
                    "speech",
                  ] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={
                      {
                        appearance: "外見",
                        personality: "性格",
                        objective: "目的",
                        desire: "欲求",
                        fear: "恐れていること",
                        secret: "秘密",
                        history: "経歴",
                        speech: "口調",
                      }[k]
                    }
                    wide
                  >
                    <textarea
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    />
                  </Field>
                ))}
                <Field label="一人称">
                  <input
                    value={editing.firstPerson}
                    onChange={(e) =>
                      setEditing({ ...editing, firstPerson: e.target.value })
                    }
                  />
                </Field>
                <Field label="二人称">
                  <input
                    value={editing.secondPerson}
                    onChange={(e) =>
                      setEditing({ ...editing, secondPerson: e.target.value })
                    }
                  />
                </Field>
                <Field label="重要度">
                  <select
                    value={editing.importance}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        importance: e.target
                          .value as ReferenceEntry["importance"],
                      })
                    }
                  >
                    <option>主要</option>
                    <option>準主要</option>
                    <option>その他</option>
                  </select>
                </Field>
                <Field label="初登場シーン">
                  <select
                    value={editing.firstSceneId}
                    onChange={(e) =>
                      setEditing({ ...editing, firstSceneId: e.target.value })
                    }
                  >
                    <option value="">未設定</option>
                    {orderedScenes(bundle).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="関連シーン" wide>
                  <Multi
                    value={editing.relatedSceneIds}
                    onChange={(v) =>
                      setEditing({ ...editing, relatedSceneIds: v })
                    }
                    options={orderedScenes(bundle).map((s) => ({
                      id: s.id,
                      name: s.title,
                    }))}
                  />
                </Field>
              </>
            )}
            {editing.category === "location" && (
              <>
                <Field label="種別">
                  <input
                    value={editing.kind}
                    onChange={(e) =>
                      setEditing({ ...editing, kind: e.target.value })
                    }
                  />
                </Field>
                <Field label="所属地域">
                  <input
                    value={editing.region}
                    onChange={(e) =>
                      setEditing({ ...editing, region: e.target.value })
                    }
                  />
                </Field>
                <Field label="説明" wide>
                  <textarea
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="雰囲気" wide>
                  <textarea
                    value={editing.atmosphere}
                    onChange={(e) =>
                      setEditing({ ...editing, atmosphere: e.target.value })
                    }
                  />
                </Field>
                <Field label="関連人物" wide>
                  <Multi
                    value={editing.relatedCharacterIds}
                    onChange={(v) =>
                      setEditing({ ...editing, relatedCharacterIds: v })
                    }
                    options={chars}
                  />
                </Field>
              </>
            )}
            {editing.category === "organization" && (
              <>
                <Field label="目的" wide>
                  <textarea
                    value={editing.objective}
                    onChange={(e) =>
                      setEditing({ ...editing, objective: e.target.value })
                    }
                  />
                </Field>
                <Field label="概要" wide>
                  <textarea
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="所属人物" wide>
                  <Multi
                    value={editing.memberCharacterIds}
                    onChange={(v) =>
                      setEditing({ ...editing, memberCharacterIds: v })
                    }
                    options={chars}
                  />
                </Field>
                <Field label="敵対・協力関係" wide>
                  <textarea
                    value={editing.relations}
                    onChange={(e) =>
                      setEditing({ ...editing, relations: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
            {editing.category === "item" && (
              <>
                <Field label="種別">
                  <input
                    value={editing.kind}
                    onChange={(e) =>
                      setEditing({ ...editing, kind: e.target.value })
                    }
                  />
                </Field>
                <Field label="所有者">
                  <select
                    value={editing.ownerCharacterId}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        ownerCharacterId: e.target.value,
                      })
                    }
                  >
                    <option value="">未設定</option>
                    {chars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="説明" wide>
                  <textarea
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="初登場シーン">
                  <select
                    value={editing.firstSceneId}
                    onChange={(e) =>
                      setEditing({ ...editing, firstSceneId: e.target.value })
                    }
                  >
                    <option value="">未設定</option>
                    {orderedScenes(bundle).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="関連する伏線">
                  <select
                    value={editing.foreshadowId}
                    onChange={(e) =>
                      setEditing({ ...editing, foreshadowId: e.target.value })
                    }
                  >
                    <option value="">未設定</option>
                    {bundle.foreshadows.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {editing.category === "term" && (
              <>
                <Field label="説明" wide>
                  <textarea
                    value={editing.description}
                    onChange={(e) =>
                      setEditing({ ...editing, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="関連項目" wide>
                  <Multi
                    value={editing.relatedEntryIds}
                    onChange={(v) =>
                      setEditing({ ...editing, relatedEntryIds: v })
                    }
                    options={bundle.references.filter(
                      (x) => x.id !== editing.id,
                    )}
                  />
                </Field>
              </>
            )}
            {editing.category === "character" && (
              <section className="character-sheet-editor wide">
                <div className="character-sheet-heading">
                  <div>
                    <h3>キャラクタープロフィールシート</h3>
                    <p>
                      charcter_sheet.htmlと相互に読み書きできる詳細項目です。
                    </p>
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void exportCharacter(editing)}
                  >
                    <Download /> .charaで書き出す
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={printCharacterSheet}
                  >
                    <Printer /> 印刷・PDF保存
                  </button>
                </div>
                {CHARACTER_SHEET_SECTIONS.map((section, index) => (
                  <details key={section.title} open={index === 0}>
                    <summary>{section.title}</summary>
                    <div className="character-sheet-grid">
                      {section.fields.map((field) => (
                        <Field key={field} label={field}>
                          <textarea
                            value={characterToSheet(editing)[field]}
                            onChange={(event) => {
                              const sheet = characterToSheet(editing);
                              sheet[field] = event.target.value;
                              setEditing(applySheetToCharacter(editing, sheet));
                            }}
                          />
                        </Field>
                      ))}
                    </div>
                  </details>
                ))}
              </section>
            )}
            <Field label="関連シーン" wide>
              <Multi
                value={editing.relatedSceneIds}
                onChange={(v) => setEditing({ ...editing, relatedSceneIds: v })}
                options={orderedScenes(bundle).map((s) => ({
                  id: s.id,
                  name: s.title,
                }))}
              />
            </Field>
            <Field label="タグ（カンマ区切り）" wide>
              <input
                value={editing.tags.join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    tags: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
            <Field label="メモ" wide>
              <textarea
                value={editing.notes}
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </Field>
          </div>
        </Modal>
      )}
      {relation && (
        <Modal
          title="人間関係を編集"
          onClose={() => setRelation(null)}
          onSave={saveRelation}
        >
          <div className="form-grid">
            <Field label="起点キャラクター">
              <select
                value={relation.sourceCharacterId}
                onChange={(e) =>
                  setRelation({
                    ...relation,
                    sourceCharacterId: e.target.value,
                  })
                }
              >
                <option value="">選択</option>
                {chars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="対象キャラクター">
              <select
                value={relation.targetCharacterId}
                onChange={(e) =>
                  setRelation({
                    ...relation,
                    targetCharacterId: e.target.value,
                  })
                }
              >
                <option value="">選択</option>
                {chars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            {(
              [
                "type",
                "sourceFeeling",
                "targetFeeling",
                "publicRelation",
                "actualRelation",
              ] as const
            ).map((k) => (
              <Field
                key={k}
                label={
                  {
                    type: "関係種別",
                    sourceFeeling: "起点から対象への感情",
                    targetFeeling: "対象から起点への感情",
                    publicRelation: "表向きの関係",
                    actualRelation: "実際の関係",
                  }[k]
                }
                wide={k !== "type"}
              >
                <input
                  value={relation[k]}
                  onChange={(e) =>
                    setRelation({ ...relation, [k]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="関係の開始シーン" wide>
              <select
                value={relation.startSceneId}
                onChange={(e) =>
                  setRelation({ ...relation, startSceneId: e.target.value })
                }
              >
                <option value="">未設定</option>
                {orderedScenes(bundle).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="関係の変化履歴" wide>
              <div className="change-history">
                {relation.changes.map((change, index) => (
                  <div key={index}>
                    <select
                      value={change.sceneId}
                      onChange={(e) =>
                        setRelation({
                          ...relation,
                          changes: relation.changes.map((item, i) =>
                            i === index
                              ? { ...item, sceneId: e.target.value }
                              : item,
                          ),
                        })
                      }
                    >
                      <option value="">シーン未設定</option>
                      {orderedScenes(bundle).map((scene) => (
                        <option key={scene.id} value={scene.id}>
                          {scene.title}
                        </option>
                      ))}
                    </select>
                    <input
                      value={change.description}
                      placeholder="関係がどう変化したか"
                      onChange={(e) =>
                        setRelation({
                          ...relation,
                          changes: relation.changes.map((item, i) =>
                            i === index
                              ? { ...item, description: e.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon"
                      onClick={() =>
                        setRelation({
                          ...relation,
                          changes: relation.changes.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
                <button
                  className="button"
                  onClick={() =>
                    setRelation({
                      ...relation,
                      changes: [
                        ...relation.changes,
                        { sceneId: "", description: "" },
                      ],
                    })
                  }
                >
                  <Plus />
                  変化を追加
                </button>
              </div>
            </Field>
            <Field label="メモ" wide>
              <textarea
                value={relation.notes}
                onChange={(e) =>
                  setRelation({ ...relation, notes: e.target.value })
                }
              />
            </Field>
          </div>
        </Modal>
      )}
    </main>
  );
}

export function PlotPage({ work }: { work: Work }) {
  const { bundle, reload } = useBundle(work.id),
    [closed, setClosed] = useState(new Set<string>()),
    [detail, setDetail] = useState<Scene | null>(null);
  if (!bundle) return <div className="loading">読み込み中…</div>;
  const warnings = analyzeStory(bundle),
    fsIssues = foreshadowIssues(bundle),
    ordered = orderedScenes(bundle);
  async function saveScene() {
    if (detail) {
      const index = ordered.findIndex((scene) => scene.id === detail.id);
      const settings = bundle!.work.longFormSettings;
      const tooEarly =
        detail.design.hasFullResolution &&
        (index + 1 < settings.finalResolutionMinScene ||
          ((index + 1) / Math.max(1, bundle!.work.targetScenes)) * 100 <
            settings.finalResolutionMinProgress);
      if (bundle!.work.longFormSupport && settings.hardLock && tooEarly) {
        alert(
          "強制ロックが有効です。完全解決を許可する位置より前のため保存できません。",
        );
        return;
      }
      const stamp = now();
      await db.scenes.put({
        ...detail,
        updatedAt: stamp,
        designUpdatedAt: stamp,
      });
      setDetail(null);
      await reload();
    }
  }
  async function move(scene: Scene, delta: number) {
    const list = ordered.filter((s) => s.chapterId === scene.chapterId),
      i = list.findIndex((s) => s.id === scene.id),
      other = list[i + delta];
    if (!other) return;
    const stamp = now();
    await db.scenes.bulkPut([
      { ...scene, order: other.order, updatedAt: stamp },
      { ...other, order: scene.order, updatedAt: stamp },
    ]);
    await reload();
  }
  return (
    <main className="content plot-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Story structure</p>
          <h1>プロット一覧</h1>
        </div>
        <span className="muted">
          {ordered.length}シーン · {warnings.length}件の助言
        </span>
      </div>
      {bundle.chapters
        .sort((a, b) => a.order - b.order)
        .map((ch) => (
          <section className="plot-chapter" key={ch.id}>
            <button
              className="plot-chapter-head"
              onClick={() =>
                setClosed((v) => {
                  const n = new Set(v);
                  if (n.has(ch.id)) n.delete(ch.id);
                  else n.add(ch.id);
                  return n;
                })
              }
            >
              {closed.has(ch.id) ? <ChevronRight /> : <ChevronDown />}
              <b>{ch.title}</b>
              <span>
                {ordered.filter((s) => s.chapterId === ch.id).length}シーン
              </span>
            </button>
            {!closed.has(ch.id) && (
              <div className="plot-grid">
                {ordered
                  .filter((s) => s.chapterId === ch.id)
                  .map((s, i) => {
                    const n = ordered.indexOf(s) + 1,
                      sw = warnings.filter((w) => w.targetId === s.id),
                      fores = bundle.foreshadows.filter(
                        (f) =>
                          f.setupSceneId === s.id ||
                          f.emphasisSceneIds.includes(s.id) ||
                          f.payoffSceneId === s.id,
                      ),
                      qs = bundle.questions.filter(
                        (q) =>
                          q.occurrenceSceneId === s.id ||
                          q.resolutionSceneId === s.id,
                      ),
                      subs = bundle.subplots.filter(
                        (p) =>
                          p.startSceneId === s.id ||
                          p.progressSceneIds.includes(s.id) ||
                          p.resolutionSceneId === s.id,
                      );
                    return (
                      <article
                        className="plot-card"
                        key={s.id}
                        onClick={() => setDetail(s)}
                      >
                        <header>
                          <span>SCENE {n}</span>
                          <div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void move(s, -1);
                              }}
                              disabled={!i}
                            >
                              <ArrowUp />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void move(s, 1);
                              }}
                            >
                              <ArrowDown />
                            </button>
                          </div>
                        </header>
                        <h2>{s.title}</h2>
                        <div className="plot-meta">
                          <span>{s.design.sceneType}</span>
                          <span>
                            視点: {charName(bundle, s.design.povCharacterId)}
                          </span>
                        </div>
                        <dl>
                          <dt>目的</dt>
                          <dd>{s.design.purpose || "—"}</dd>
                          <dt>障害</dt>
                          <dd>{s.design.obstacle || "—"}</dd>
                          <dt>結果</dt>
                          <dd>{s.design.result || "—"}</dd>
                        </dl>
                        <div className="plot-links">
                          {fores.map((f) => (
                            <span key={f.id}>伏線: {f.name}</span>
                          ))}
                          {qs.map((q) => (
                            <span key={q.id}>問い: {q.question}</span>
                          ))}
                          {subs.map((p) => (
                            <span key={p.id}>副筋: {p.name}</span>
                          ))}
                        </div>
                        <footer>
                          <span>
                            {[
                              ...s.body.replace(/\s/g, ""),
                            ].length.toLocaleString()}
                            字
                          </span>
                          {sw.length > 0 && (
                            <span className="warning-count">
                              <AlertTriangle />
                              {sw.length}
                            </span>
                          )}
                          <NavLink
                            onClick={(e) => e.stopPropagation()}
                            to={`/works/${work.id}/write?scene=${s.id}`}
                          >
                            <ExternalLink />
                            本文
                          </NavLink>
                        </footer>
                      </article>
                    );
                  })}
              </div>
            )}
          </section>
        ))}
      {detail && (
        <SceneDesignModal
          scene={detail}
          bundle={bundle}
          setScene={setDetail}
          onClose={() => setDetail(null)}
          onSave={saveScene}
        />
      )}
      <StructureManagers bundle={bundle} reload={reload} fsIssues={fsIssues} />
    </main>
  );
}

export function SceneDesignModal({
  scene,
  bundle,
  setScene,
  onClose,
  onSave,
}: {
  scene: Scene;
  bundle: WorkBundle;
  setScene: (s: Scene) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const d = scene.design,
    characters = bundle.references.filter((r) => r.category === "character"),
    locations = bundle.references.filter((r) => r.category === "location");
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) =>
    setScene({ ...scene, design: { ...d, [k]: v } });
  return (
    <Modal title="シーン設計" onClose={onClose} onSave={onSave}>
      <div className="form-grid">
        <Field label="シーンの目的" wide>
          <textarea
            value={d.purpose}
            onChange={(e) => set("purpose", e.target.value)}
          />
        </Field>
        <Field label="主な視点人物">
          <select
            value={d.povCharacterId}
            onChange={(e) => set("povCharacterId", e.target.value)}
          >
            <option value="">未設定</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="場所">
          <select
            value={d.locationId}
            onChange={(e) => set("locationId", e.target.value)}
          >
            <option value="">未設定</option>
            {locations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="登場人物" wide>
          <Multi
            value={d.characterIds}
            onChange={(v) => set("characterIds", v)}
            options={characters}
          />
        </Field>
        {(
          [
            "openingSituation",
            "obstacle",
            "attempt",
            "result",
            "endingChange",
          ] as const
        ).map((k) => (
          <Field
            key={k}
            label={
              {
                openingSituation: "開始時の状況",
                obstacle: "障害",
                attempt: "試行",
                result: "結果",
                endingChange: "終了時の変化",
              }[k]
            }
            wide
          >
            <textarea value={d[k]} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
        <Field label="シーン種別">
          <select
            value={d.sceneType}
            onChange={(e) =>
              set("sceneType", e.target.value as typeof d.sceneType)
            }
          >
            {SCENE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="時系列上の日時・順序">
          <input
            value={d.timeline}
            onChange={(e) => set("timeline", e.target.value)}
          />
        </Field>
        <div className="boolean-grid wide">
          {(
            [
              ["hasFullResolution", "完全解決を含む"],
              ["createsNewProblem", "新しい問題を発生"],
              ["revealsInformation", "情報開示を含む"],
              ["changesRelationship", "人間関係が変化"],
              ["changesItemOrState", "所持品・状態が変化"],
              ["multipleLocations", "複数の場所を移動"],
              ["majorTimePassage", "大きな時間経過"],
              ["outcomeSuccessful", "試行が成功"],
            ] as const
          ).map(([k, l]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={d[k]}
                onChange={(e) => set(k, e.target.checked)}
              />
              {l}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function StructureManagers({
  bundle,
  reload,
  fsIssues,
}: {
  bundle: WorkBundle;
  reload: () => Promise<void>;
  fsIssues: { foreshadowId: string; message: string }[];
}) {
  const [tab, setTab] = useState<
      "foreshadow" | "question" | "promise" | "subplot"
    >("foreshadow"),
    [edit, setEdit] = useState<
      Foreshadow | StoryQuestion | PromiseRecord | Subplot | null
    >(null);
  const scenes = orderedScenes(bundle),
    chars = bundle.references.filter((r) => r.category === "character"),
    items = bundle.references.filter((r) => r.category === "item");
  const configs = {
    foreshadow: {
      label: "伏線",
      rows: bundle.foreshadows,
      table: db.foreshadows,
    },
    question: {
      label: "未解決の問い",
      rows: bundle.questions,
      table: db.questions,
    },
    promise: { label: "約束・宣言", rows: bundle.promises, table: db.promises },
    subplot: {
      label: "サブプロット",
      rows: bundle.subplots,
      table: db.subplots,
    },
  } as const;
  const c = configs[tab];
  function make() {
    const base = {
      id: newId(),
      workId: bundle.work.id,
      createdAt: now(),
      updatedAt: now(),
    };
    if (tab === "foreshadow")
      setEdit({
        ...base,
        name: "",
        description: "",
        setupSceneId: "",
        emphasisSceneIds: [],
        plannedPayoffSceneId: "",
        payoffSceneId: "",
        status: "未設置",
        characterIds: [],
        itemIds: [],
        notes: "",
      } as Foreshadow);
    if (tab === "question")
      setEdit({
        ...base,
        question: "",
        occurrenceSceneId: "",
        readerKnows: false,
        protagonistKnows: false,
        characterIds: [],
        plannedResolutionSceneId: "",
        resolutionSceneId: "",
        status: "未解決",
        importance: "中",
        notes: "",
      } as StoryQuestion);
    if (tab === "promise")
      setEdit({
        ...base,
        content: "",
        speakerCharacterId: "",
        target: "",
        occurrenceSceneId: "",
        due: "",
        fulfillmentSceneId: "",
        status: "未処理",
        notes: "",
      } as PromiseRecord);
    if (tab === "subplot")
      setEdit({
        ...base,
        name: "",
        synopsis: "",
        characterIds: [],
        startSceneId: "",
        progressSceneIds: [],
        plannedResolutionSceneId: "",
        resolutionSceneId: "",
        status: "未開始",
        mainPlotConnection: "",
        notes: "",
      } as Subplot);
  }
  async function save() {
    if (!edit) return;
    await db.table(c.table.name).put({ ...edit, updatedAt: now() });
    setEdit(null);
    await reload();
  }
  async function remove(id: string) {
    if (confirm("この項目を削除しますか？")) {
      await db.table(c.table.name).delete(id);
      await reload();
    }
  }
  return (
    <section className="structure-managers">
      <div className="subtabs">
        {(Object.keys(configs) as (keyof typeof configs)[]).map((k) => (
          <button
            className={tab === k ? "active" : ""}
            onClick={() => {
              setTab(k);
              setEdit(null);
            }}
            key={k}
          >
            {configs[k].label}
            <small>{configs[k].rows.length}</small>
          </button>
        ))}
      </div>
      <div className="manager-head">
        <h2>{c.label}</h2>
        <button className="button" onClick={make}>
          <Plus />
          追加
        </button>
      </div>
      <div className="manager-list">
        {c.rows.map((row) => {
          const title =
            "name" in row
              ? row.name
              : "question" in row
                ? row.question
                : "content" in row
                  ? row.content
                  : "項目";
          return (
            <article key={row.id} onClick={() => setEdit(row)}>
              <div>
                <b>{title || "無題"}</b>
                <small>{row.status}</small>
              </div>
              {tab === "foreshadow" &&
                fsIssues
                  .filter((x) => x.foreshadowId === row.id)
                  .map((x) => (
                    <span className="issue" key={x.message}>
                      {x.message}
                    </span>
                  ))}
              <button
                className="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(row.id);
                }}
              >
                <Trash2 />
              </button>
            </article>
          );
        })}
      </div>
      {edit && (
        <Modal
          title={`${c.label}を編集`}
          onClose={() => setEdit(null)}
          onSave={save}
        >
          <div className="form-grid">
            {"name" in edit && (
              <Field label={tab === "subplot" ? "名前" : "伏線名"} wide>
                <input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
            )}
            {"question" in edit && (
              <Field label="問い" wide>
                <input
                  value={edit.question}
                  onChange={(e) =>
                    setEdit({ ...edit, question: e.target.value })
                  }
                />
              </Field>
            )}
            {"content" in edit && (
              <Field label="内容" wide>
                <textarea
                  value={edit.content}
                  onChange={(e) =>
                    setEdit({ ...edit, content: e.target.value })
                  }
                />
              </Field>
            )}
            {"description" in edit && (
              <Field label="内容" wide>
                <textarea
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </Field>
            )}
            {"synopsis" in edit && (
              <Field label="概要" wide>
                <textarea
                  value={edit.synopsis}
                  onChange={(e) =>
                    setEdit({ ...edit, synopsis: e.target.value })
                  }
                />
              </Field>
            )}
            {"setupSceneId" in edit && (
              <>
                <SceneSelect
                  label="設置シーン"
                  value={edit.setupSceneId}
                  set={(v) => setEdit({ ...edit, setupSceneId: v })}
                  scenes={scenes}
                />
                <SceneSelect
                  label="回収予定シーン"
                  value={edit.plannedPayoffSceneId}
                  set={(v) => setEdit({ ...edit, plannedPayoffSceneId: v })}
                  scenes={scenes}
                />
                <SceneSelect
                  label="実際の回収シーン"
                  value={edit.payoffSceneId}
                  set={(v) => setEdit({ ...edit, payoffSceneId: v })}
                  scenes={scenes}
                />
                <Field label="強調シーン" wide>
                  <Multi
                    value={edit.emphasisSceneIds}
                    onChange={(v) => setEdit({ ...edit, emphasisSceneIds: v })}
                    options={scenes}
                  />
                </Field>
                <Field label="関連人物" wide>
                  <Multi
                    value={edit.characterIds}
                    onChange={(v) => setEdit({ ...edit, characterIds: v })}
                    options={chars}
                  />
                </Field>
                <Field label="関連アイテム" wide>
                  <Multi
                    value={edit.itemIds}
                    onChange={(v) => setEdit({ ...edit, itemIds: v })}
                    options={items}
                  />
                </Field>
                <Field label="状態">
                  <select
                    value={edit.status}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        status: e.target.value as Foreshadow["status"],
                      })
                    }
                  >
                    {FORESHADOW_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {"occurrenceSceneId" in edit && (
              <>
                <SceneSelect
                  label="発生シーン"
                  value={edit.occurrenceSceneId}
                  set={(v) => setEdit({ ...edit, occurrenceSceneId: v })}
                  scenes={scenes}
                />
                {"question" in edit && (
                  <>
                    <Field label="関連人物" wide>
                      <Multi
                        value={edit.characterIds}
                        onChange={(v) => setEdit({ ...edit, characterIds: v })}
                        options={chars}
                      />
                    </Field>
                    <SceneSelect
                      label="解決予定シーン"
                      value={edit.plannedResolutionSceneId}
                      set={(v) =>
                        setEdit({ ...edit, plannedResolutionSceneId: v })
                      }
                      scenes={scenes}
                    />
                    <SceneSelect
                      label="解決シーン"
                      value={edit.resolutionSceneId}
                      set={(v) => setEdit({ ...edit, resolutionSceneId: v })}
                      scenes={scenes}
                    />
                    <Field label="重要度">
                      <select
                        value={edit.importance}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            importance: e.target
                              .value as StoryQuestion["importance"],
                          })
                        }
                      >
                        <option>高</option>
                        <option>中</option>
                        <option>低</option>
                      </select>
                    </Field>
                    <div className="boolean-grid wide">
                      <label>
                        <input
                          type="checkbox"
                          checked={edit.readerKnows}
                          onChange={(e) =>
                            setEdit({ ...edit, readerKnows: e.target.checked })
                          }
                        />
                        読者が知っている
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={edit.protagonistKnows}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              protagonistKnows: e.target.checked,
                            })
                          }
                        />
                        主人公が知っている
                      </label>
                    </div>
                  </>
                )}
                {"content" in edit && (
                  <>
                    <Field label="発言者">
                      <select
                        value={edit.speakerCharacterId}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            speakerCharacterId: e.target.value,
                          })
                        }
                      >
                        <option value="">未設定</option>
                        {chars.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="対象">
                      <input
                        value={edit.target}
                        onChange={(e) =>
                          setEdit({ ...edit, target: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="履行予定">
                      <input
                        value={edit.due}
                        onChange={(e) =>
                          setEdit({ ...edit, due: e.target.value })
                        }
                      />
                    </Field>
                    <SceneSelect
                      label="履行シーン"
                      value={edit.fulfillmentSceneId}
                      set={(v) => setEdit({ ...edit, fulfillmentSceneId: v })}
                      scenes={scenes}
                    />
                  </>
                )}
              </>
            )}
            {"startSceneId" in edit && (
              <>
                <SceneSelect
                  label="開始シーン"
                  value={edit.startSceneId}
                  set={(v) => setEdit({ ...edit, startSceneId: v })}
                  scenes={scenes}
                />
                <SceneSelect
                  label="決着予定シーン"
                  value={edit.plannedResolutionSceneId}
                  set={(v) => setEdit({ ...edit, plannedResolutionSceneId: v })}
                  scenes={scenes}
                />
                <SceneSelect
                  label="決着シーン"
                  value={edit.resolutionSceneId}
                  set={(v) => setEdit({ ...edit, resolutionSceneId: v })}
                  scenes={scenes}
                />
                <Field label="進展シーン" wide>
                  <Multi
                    value={edit.progressSceneIds}
                    onChange={(v) => setEdit({ ...edit, progressSceneIds: v })}
                    options={scenes}
                  />
                </Field>
                <Field label="主な人物" wide>
                  <Multi
                    value={edit.characterIds}
                    onChange={(v) => setEdit({ ...edit, characterIds: v })}
                    options={chars}
                  />
                </Field>
                <Field label="本筋との接続" wide>
                  <textarea
                    value={edit.mainPlotConnection}
                    onChange={(e) =>
                      setEdit({ ...edit, mainPlotConnection: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
            {tab !== "foreshadow" && (
              <Field label="状態">
                <select
                  value={edit.status}
                  onChange={(e) =>
                    setEdit({ ...edit, status: e.target.value as never })
                  }
                >
                  {tab === "question" && (
                    <>
                      <option>未解決</option>
                      <option>一部解決</option>
                      <option>解決</option>
                      <option>意図的に未解決</option>
                    </>
                  )}
                  {tab === "promise" && (
                    <>
                      <option>未処理</option>
                      <option>履行</option>
                      <option>破棄</option>
                      <option>失敗</option>
                      <option>意図的に未処理</option>
                    </>
                  )}
                  {tab === "subplot" && (
                    <>
                      <option>未開始</option>
                      <option>進行中</option>
                      <option>決着</option>
                      <option>保留</option>
                    </>
                  )}
                </select>
              </Field>
            )}
            <Field label="メモ" wide>
              <textarea
                value={edit.notes}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              />
            </Field>
          </div>
        </Modal>
      )}
    </section>
  );
}
function SceneSelect({
  label,
  value,
  set,
  scenes,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  scenes: Scene[];
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">未設定</option>
        {scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function InspectionPage({
  work,
  onChange,
}: {
  work: Work;
  onChange: (w: Work) => void;
}) {
  const { bundle, reload } = useBundle(work.id),
    [showSettings, setShowSettings] = useState(false);
  if (!bundle) return <div className="loading">読み込み中…</div>;
  const warnings = analyzeStory(bundle),
    prefs = new Map(bundle.warningPreferences.map((p) => [p.warningKey, p])),
    visible = warnings.filter(
      (w) => prefs.get(w.key)?.disposition !== "ignored",
    );
  async function disposition(key: string, value: WarningDisposition) {
    await db.warningPreferences.put({
      id: prefs.get(key)?.id || newId(),
      workId: work.id,
      warningKey: key,
      disposition: value,
      updatedAt: now(),
    });
    await reload();
  }
  async function saveSettings(next: Work) {
    await db.works.put(next);
    onChange(next);
    setShowSettings(false);
    await reload();
  }
  return (
    <main className="content inspect-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Structural guidance</p>
          <h1>長編化支援</h1>
        </div>
        <button className="button" onClick={() => setShowSettings(true)}>
          分析設定
        </button>
      </div>
      {!bundle.work.longFormSupport ? (
        <div className="notice">
          <b>長編化支援は無効です</b>
          <p>
            作品ホームの「長編化支援」を有効にすると、登録した構造情報を単純なルールで点検します。
          </p>
        </div>
      ) : (
        <>
          <div className="warning-summary">
            <AlertTriangle />
            <div>
              <b>{visible.length}件の助言</b>
              <span>
                物語を早く畳みすぎている可能性を中立的に示します。修正を強制するものではありません。
              </span>
            </div>
          </div>
          <div className="warning-list">
            {visible.map((w) => (
              <article key={w.key}>
                <AlertTriangle />
                <div>
                  <header>
                    <b>{w.rule}</b>
                    <span>{w.severity}</span>
                  </header>
                  <h3>{w.targetLabel}</h3>
                  <p>{w.reason}</p>
                  <small>{w.metric}</small>
                  <footer>
                    <button onClick={() => void disposition(w.key, "ignored")}>
                      無視する
                    </button>
                    <button onClick={() => void disposition(w.key, "later")}>
                      後で確認
                    </button>
                    {w.targetType === "scene" && (
                      <NavLink
                        to={`/works/${work.id}/write?scene=${w.targetId}`}
                      >
                        対象を開く <ExternalLink />
                      </NavLink>
                    )}
                  </footer>
                </div>
              </article>
            ))}
            {!visible.length && (
              <p className="muted-box">現在表示する助言はありません。</p>
            )}
          </div>
        </>
      )}
      {showSettings && (
        <LongFormModal
          work={bundle.work}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
        />
      )}
    </main>
  );
}
function LongFormModal({
  work,
  onClose,
  onSave,
}: {
  work: Work;
  onClose: () => void;
  onSave: (w: Work) => void;
}) {
  const [draft, setDraft] = useState(work),
    s = draft.longFormSettings;
  const set = (key: keyof typeof s, value: number | boolean) =>
    setDraft({ ...draft, longFormSettings: { ...s, [key]: value } });
  return (
    <Modal
      title="長編化支援の設定"
      onClose={onClose}
      onSave={() => onSave({ ...draft, updatedAt: now() })}
    >
      <div className="form-grid">
        <label className="check wide">
          <input
            type="checkbox"
            checked={draft.longFormSupport}
            onChange={(e) =>
              setDraft({ ...draft, longFormSupport: e.target.checked })
            }
          />
          長編化支援を有効にする
        </label>
        <Field label="目標文字数">
          <input
            type="number"
            value={draft.targetCharacters}
            onChange={(e) =>
              setDraft({ ...draft, targetCharacters: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="目標章数">
          <input
            type="number"
            value={s.targetChapters}
            onChange={(e) => set("targetChapters", Number(e.target.value))}
          />
        </Field>
        <Field label="目標シーン数">
          <input
            type="number"
            value={draft.targetScenes}
            onChange={(e) =>
              setDraft({ ...draft, targetScenes: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="最終解決を許可する最小シーン">
          <input
            type="number"
            value={s.finalResolutionMinScene}
            onChange={(e) =>
              set("finalResolutionMinScene", Number(e.target.value))
            }
          />
        </Field>
        <Field label="最終解決を許可する進捗率（%）">
          <input
            type="number"
            value={s.finalResolutionMinProgress}
            onChange={(e) =>
              set("finalResolutionMinProgress", Number(e.target.value))
            }
          />
        </Field>
        <Field label="推奨する未解決項目の最低件数">
          <input
            type="number"
            value={s.minOpenThreads}
            onChange={(e) => set("minOpenThreads", Number(e.target.value))}
          />
        </Field>
        <Field label="1シーンに許容する変化数">
          <input
            type="number"
            value={s.maxChangesPerScene}
            onChange={(e) => set("maxChangesPerScene", Number(e.target.value))}
          />
        </Field>
        <Field label="同じ種別の連続許容数">
          <input
            type="number"
            value={s.maxConsecutiveSceneType}
            onChange={(e) =>
              set("maxConsecutiveSceneType", Number(e.target.value))
            }
          />
        </Field>
        <label className="check wide">
          <input
            type="checkbox"
            checked={s.warnInstantSuccess}
            onChange={(e) => set("warnInstantSuccess", e.target.checked)}
          />
          一度で成功する展開を警告する
        </label>
        <label className="check wide">
          <input
            type="checkbox"
            checked={s.hardLock}
            onChange={(e) => set("hardLock", e.target.checked)}
          />
          強制ロックを有効にする（警告対象の完全解決を保存時に確認）
        </label>
      </div>
    </Modal>
  );
}
