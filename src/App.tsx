import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus2,
  Focus,
  Home,
  Menu,
  Moon,
  MoreVertical,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createWork,
  db,
  deleteWork,
  getBundle,
  newId,
  now,
  putBundle,
} from "./db";
import {
  SCENE_STATUSES,
  WORK_STATUSES,
  type Chapter,
  type ExportEnvelope,
  type SaveState,
  type Scene,
  type Work,
  type WorkBundle,
} from "./types";
import { analyzeStory } from "./analysis";
import { defaultSceneDesign, normalizeBundle, normalizeWork } from "./defaults";
import { CURRENT_SCHEMA_VERSION, migrateExport } from "./migrations";
import { PlotPage, ReferencePage, SceneDesignModal } from "./Stage2";
import { CommandPalette, CompletionDialog, QualityHub } from "./Stage3";
import { filePort, environment } from "./services/platform";
import { createSnapshot } from "./services/snapshots";
import { GoogleDriveSync } from "./sync/GoogleDriveSync";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const count = (text: string) => [...text.replace(/\s/g, "")].length;
const saveFile = (data: unknown, name: string) =>
  void filePort
    .saveJson(data, name)
    .catch((error) =>
      alert(
        error instanceof Error
          ? error.message
          : "ファイルを保存できませんでした。",
      ),
    );

async function applyPwaUpdate() {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration?.waiting) return location.reload();
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => location.reload(),
    { once: true },
  );
  registration.waiting.postMessage("SKIP_WAITING");
}

function Button({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={34} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("storyos-theme") || "dark",
  );
  const [dbError, setDbError] = useState("");
  const [syncRevision, setSyncRevision] = useState(0);
  const handleSyncDataChanged = useCallback(
    () => setSyncRevision((value) => value + 1),
    [],
  );
  const [updateReady, setUpdateReady] = useState(false),
    [showGuide, setShowGuide] = useState(
      () => !localStorage.getItem("storyos-guide-seen"),
    );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("storyos-theme", theme);
  }, [theme]);
  useEffect(() => {
    db.open().catch((e) =>
      setDbError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  useEffect(() => {
    const ready = () => setUpdateReady(true);
    window.addEventListener("storyos-update", ready);
    return () => window.removeEventListener("storyos-update", ready);
  }, []);
  useEffect(
    () =>
      window.electronAPI?.onPrepareClose(async (requestId) => {
        try {
          const success = window.storyOSFlush
            ? await window.storyOSFlush()
            : true;
          window.electronAPI?.finishClose(
            requestId,
            success,
            success ? undefined : "自動保存に失敗しました。",
          );
        } catch (error) {
          window.electronAPI?.finishClose(
            requestId,
            false,
            error instanceof Error ? error.message : "自動保存に失敗しました。",
          );
        }
      }),
    [],
  );
  if (dbError)
    return (
      <main className="fatal">
        <h1>データベースを利用できません</h1>
        <p>{dbError}</p>
        <p>
          ブラウザのプライベートモードやストレージ制限を解除し、空き容量を確認してから再読み込みしてください。
        </p>
      </main>
    );
  return (
    <>
      <button
        className="theme-toggle icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title="テーマを切り替え"
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </button>
      <GoogleDriveSync onDataChanged={handleSyncDataChanged} />
      <Routes key={syncRevision}>
        <Route path="/" element={<Library />} />
        <Route path="/works/:workId/*" element={<WorkShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showGuide && (
        <aside className="guide-toast">
          <b>Story OSへようこそ</b>
          <p>
            作品を作り、章とシーンを選んで本文を書きます。設定資料とプロットで構造を整理し、点検で仕上げを確認できます。データはこの端末だけに保存されます。
          </p>
          <button
            onClick={() => {
              localStorage.setItem("storyos-guide-seen", "1");
              setShowGuide(false);
            }}
          >
            始める
          </button>
        </aside>
      )}
      {updateReady && (
        <aside className="update-toast">
          <span>
            新しいバージョンを利用できます。保存完了を確認して再読み込みしてください。
          </span>
          <button onClick={() => void applyPwaUpdate()}>再読み込み</button>
          <button onClick={() => setUpdateReady(false)}>後で</button>
        </aside>
      )}
    </>
  );
}

function Library() {
  const [works, setWorks] = useState<Work[]>([]),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("updatedAt-desc");
  const nav = useNavigate();
  const load = useCallback(() => db.works.toArray().then(setWorks), []);
  useEffect(
    () =>
      window.electronAPI?.onMenuAction((action) => {
        if (action === "new-work")
          void createWork().then((created) => nav(`/works/${created.id}/home`));
        if (action === "open-work") nav("/");
      }),
    [nav],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const stats = useMemo(
    () =>
      Promise.all(
        works.map(async (w) => ({
          id: w.id,
          chapters: await db.chapters.where("workId").equals(w.id).count(),
          scenes: await db.scenes.where("workId").equals(w.id).toArray(),
        })),
      ),
    [works],
  );
  const [counts, setCounts] = useState<
    Record<string, { chapters: number; scenes: number; chars: number }>
  >({});
  useEffect(() => {
    void stats.then((rows) =>
      setCounts(
        Object.fromEntries(
          rows.map((r) => [
            r.id,
            {
              chapters: r.chapters,
              scenes: r.scenes.length,
              chars: r.scenes.reduce((n, s) => n + count(s.body), 0),
            },
          ]),
        ),
      ),
    );
  }, [stats]);
  const shown = [...works]
    .filter((w) =>
      w.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => {
      const [key, dir] = sort.split("-") as [keyof Work, string];
      return (
        String(a[key]).localeCompare(String(b[key]), "ja") *
        (dir === "asc" ? 1 : -1)
      );
    });
  async function add() {
    const work = await createWork();
    nav(`/works/${work.id}/home`);
  }
  async function rename(w: Work) {
    const title = prompt("新しい作品名", w.title)?.trim();
    if (title) {
      await db.works.update(w.id, { title, updatedAt: now() });
      await load();
    }
  }
  async function duplicate(id: string) {
    const b = await getBundle(id);
    if (!b) return;
    const copy = cloneBundle(b);
    copy.work.title = `${b.work.title}（コピー）`;
    await putBundle(copy);
    await load();
  }
  async function remove(w: Work) {
    if (
      confirm(`「${w.title}」を削除します。元に戻せません。よろしいですか？`)
    ) {
      await deleteWork(w.id);
      await load();
    }
  }
  return (
    <main className="library page">
      <header className="library-head">
        <div>
          <div className="brand">
            <span>Story</span> OS
          </div>
          <p>物語を、静かに組み立てる。</p>
        </div>
        <Button className="primary" onClick={add}>
          <Plus />
          新しい作品
        </Button>
      </header>
      <section className="toolbar">
        <div className="search">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="作品を検索"
          />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="updatedAt-desc">更新日時（新しい順）</option>
          <option value="createdAt-desc">作成日時（新しい順）</option>
          <option value="title-asc">タイトル（昇順）</option>
          <option value="title-desc">タイトル（降順）</option>
        </select>
      </section>
      {shown.length === 0 ? (
        <Empty
          title={
            works.length
              ? "該当する作品がありません"
              : "最初の物語を始めましょう"
          }
          text={
            works.length
              ? "検索条件を変えてみてください。"
              : "作品を作成すると、章と最初のシーンが用意されます。"
          }
          action={
            !works.length ? (
              <Button className="primary" onClick={add}>
                <Plus />
                作品を作成
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="work-grid">
          {shown.map((w) => (
            <article
              className="work-card"
              key={w.id}
              onClick={() => nav(`/works/${w.id}/home`)}
            >
              <div className="card-top">
                <span className={`status s-${w.status}`}>{w.status}</span>
                <button
                  className="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    rename(w);
                  }}
                  title="作品名を変更"
                >
                  <MoreVertical />
                </button>
              </div>
              <h2>{w.title}</h2>
              <p className="tagline">
                {w.tagline || "キャッチコピーは未設定です"}
              </p>
              <div className="metrics">
                <span>
                  <b>{(counts[w.id]?.chars || 0).toLocaleString()}</b> 文字
                </span>
                <span>
                  <b>{counts[w.id]?.chapters || 0}</b> 章
                </span>
                <span>
                  <b>{counts[w.id]?.scenes || 0}</b> シーン
                </span>
              </div>
              <footer>
                <span>最終編集 {fmt(w.lastEditedAt)}</span>
                <div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void duplicate(w.id);
                    }}
                  >
                    複製
                  </button>
                  <button
                    className="danger-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(w);
                    }}
                  >
                    削除
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function WorkShell() {
  const { workId } = useParams();
  const [work, setWork] = useState<Work | null | undefined>(undefined);
  const [palette, setPalette] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (workId)
      db.works.get(workId).then((w) => setWork(w ? normalizeWork(w) : null));
  }, [workId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "f")) {
        e.preventDefault();
        setPalette(true);
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(
    () =>
      window.electronAPI?.onMenuAction((action) => {
        if (action === "new-work")
          void createWork().then((created) => nav(`/works/${created.id}/home`));
        if (action === "open-work") nav("/");
        if (action === "search") setPalette(true);
        if (action === "focus-mode")
          window.dispatchEvent(new CustomEvent("storyos-focus-mode"));
        if (
          [
            "export-backup",
            "import-backup",
            "export-manuscript",
            "backup-help",
          ].includes(action)
        ) {
          if (location.pathname.endsWith("/data"))
            window.dispatchEvent(
              new CustomEvent("storyos-data-action", { detail: action }),
            );
          else {
            sessionStorage.setItem("storyos-menu-action", action);
            nav(`/works/${work?.id || workId}/data`);
          }
        }
      }),
    [nav, work?.id, workId, location.pathname],
  );
  if (work === undefined) return <div className="loading">読み込み中…</div>;
  if (!work) return <Navigate to="/" replace />;
  const tabs = [
    ["home", "ホーム", <Home />],
    ["write", "執筆", <BookOpen />],
    ["reference", "設定資料", <FilePlus2 />],
    ["plot", "プロット", <Menu />],
    ["inspect", "点検", <Search />],
    ["data", "データ管理", <Settings />],
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="back" onClick={() => nav("/")}>
          <ArrowLeft />
          作品一覧
        </button>
        <div className="work-title">
          <span>{work.title}</span>
          <small>{work.status}</small>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map(([path, label, icon]) => (
          <NavLink
            key={String(path)}
            to={`/works/${work.id}/${String(path)}`}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {icon}
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="home" replace />} />
        <Route
          path="home"
          element={<Dashboard work={work} onChange={setWork} />}
        />
        <Route
          path="write"
          element={<Writer work={work} onWorkChange={setWork} />}
        />
        <Route path="data" element={<DataManager work={work} />} />
        <Route path="reference" element={<ReferencePage work={work} />} />
        <Route path="plot" element={<PlotPage work={work} />} />
        <Route
          path="inspect"
          element={<QualityHub work={work} onChange={setWork} />}
        />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Routes>
      {palette && (
        <CommandPalette work={work} onClose={() => setPalette(false)} />
      )}
    </div>
  );
}

function Dashboard({
  work,
  onChange,
}: {
  work: Work;
  onChange: (w: Work) => void;
}) {
  const [draft, setDraft] = useState(work),
    [scenes, setScenes] = useState<Scene[]>([]),
    [chapters, setChapters] = useState(0),
    [bundle, setBundle] = useState<WorkBundle | null>(null),
    [completion, setCompletion] = useState<WorkBundle | null>(null),
    timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    db.scenes.where("workId").equals(work.id).toArray().then(setScenes);
    db.chapters.where("workId").equals(work.id).count().then(setChapters);
    getBundle(work.id).then(setBundle);
  }, [work.id]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function change<K extends keyof Work>(key: K, value: Work[K]) {
    if (key === "status" && value === "完成" && draft.status !== "完成") {
      void getBundle(work.id).then((b) => b && setCompletion(b));
      return;
    }
    const next = { ...draft, [key]: value, updatedAt: now() };
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void db.works.put(next);
      onChange(next);
    }, 500);
  }
  const chars = scenes.reduce((n, s) => n + count(s.body), 0),
    progress = Math.min(
      100,
      Math.round((chars / Math.max(1, draft.targetCharacters)) * 100),
    );
  const sceneProgress = Math.min(
    100,
    Math.round((scenes.length / Math.max(1, draft.targetScenes)) * 100),
  );
  const typeCounts = scenes.reduce<Record<string, number>>((result, scene) => {
    result[scene.design?.sceneType || "その他"] =
      (result[scene.design?.sceneType || "その他"] || 0) + 1;
    return result;
  }, {});
  const dashboardWarnings = bundle ? analyzeStory(bundle) : [];
  return (
    <main className="content dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">作品ホーム</p>
          <h1>{draft.title}</h1>
        </div>
        <span className="muted">最終編集 {fmt(draft.lastEditedAt)}</span>
      </div>
      <section className="stat-grid">
        <div>
          <span>総文字数</span>
          <b>{chars.toLocaleString()}</b>
          <small>文字</small>
        </div>
        <div>
          <span>目標文字数</span>
          <b>{draft.targetCharacters.toLocaleString()}</b>
          <small>文字</small>
        </div>
        <div className="progress-stat">
          <span>執筆進捗</span>
          <b>{progress}%</b>
          <div className="progress">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div>
          <span>構成</span>
          <b>{chapters}</b>
          <small>章 / {scenes.length} シーン</small>
        </div>
        <div>
          <span>完了シーン</span>
          <b>
            {
              scenes.filter(
                (s) => s.status === "初稿完了" || s.status === "推敲済み",
              ).length
            }
          </b>
          <small>シーン</small>
        </div>
      </section>
      {bundle && (
        <section className="stat-grid extended-stats">
          <div className="progress-stat">
            <span>シーン進捗</span>
            <b>{sceneProgress}%</b>
            <div className="progress">
              <i style={{ width: `${sceneProgress}%` }} />
            </div>
          </div>
          <div>
            <span>未回収伏線</span>
            <b>
              {
                bundle.foreshadows.filter(
                  (f) => f.status !== "回収済み" && f.status !== "廃止",
                ).length
              }
            </b>
            <small>件</small>
          </div>
          <div>
            <span>未解決の問い</span>
            <b>
              {
                bundle.questions.filter(
                  (q) => q.status === "未解決" || q.status === "一部解決",
                ).length
              }
            </b>
            <small>件</small>
          </div>
          <div>
            <span>未処理の約束</span>
            <b>{bundle.promises.filter((p) => p.status === "未処理").length}</b>
            <small>件</small>
          </div>
          <div>
            <span>サブプロット / 助言</span>
            <b>{bundle.subplots.length}</b>
            <small>副筋 / {dashboardWarnings.length}件</small>
          </div>
        </section>
      )}
      {bundle && (
        <section className="structure-strip panel">
          <h2>シーン種別の内訳</h2>
          <div>
            {Object.entries(typeCounts).map(([type, amount]) => (
              <span key={type}>
                <b>{type}</b> {amount}
              </span>
            ))}
          </div>
          <h2>主要人物の登場回数</h2>
          <div>
            {bundle.references
              .filter(
                (r) => r.category === "character" && r.importance === "主要",
              )
              .map((character) => (
                <span key={character.id}>
                  <b>{character.name}</b>{" "}
                  {
                    scenes.filter(
                      (s) =>
                        s.design?.povCharacterId === character.id ||
                        s.design?.characterIds.includes(character.id),
                    ).length
                  }
                </span>
              ))}
          </div>
        </section>
      )}
      <div className="dashboard-columns">
        <section className="panel">
          <h2>作品概要</h2>
          <div className="form-grid">
            <Field label="作品タイトル" wide>
              <input
                value={draft.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </Field>
            <Field label="キャッチコピー" wide>
              <input
                value={draft.tagline}
                onChange={(e) => change("tagline", e.target.value)}
              />
            </Field>
            <Field label="ジャンル">
              <input
                value={draft.genre}
                onChange={(e) => change("genre", e.target.value)}
              />
            </Field>
            <Field label="ステータス">
              <select
                value={draft.status}
                onChange={(e) =>
                  change("status", e.target.value as Work["status"])
                }
              >
                {WORK_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="概要" wide>
              <textarea
                rows={5}
                value={draft.synopsis}
                onChange={(e) => change("synopsis", e.target.value)}
              />
            </Field>
            <Field label="テーマ" wide>
              <textarea
                rows={3}
                value={draft.theme}
                onChange={(e) => change("theme", e.target.value)}
              />
            </Field>
            <Field label="想定文字数">
              <input
                type="number"
                min="0"
                value={draft.targetCharacters}
                onChange={(e) =>
                  change("targetCharacters", Number(e.target.value))
                }
              />
            </Field>
            <Field label="目標シーン数">
              <input
                type="number"
                min="0"
                value={draft.targetScenes}
                onChange={(e) => change("targetScenes", Number(e.target.value))}
              />
            </Field>
            <label className="check wide">
              <input
                type="checkbox"
                checked={draft.longFormSupport}
                onChange={(e) => change("longFormSupport", e.target.checked)}
              />
              長編化支援を有効にする
            </label>
          </div>
        </section>
        <section className="panel recent">
          <h2>直近で編集した項目</h2>
          {[...scenes]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 5)
            .map((s) => (
              <NavLink key={s.id} to={`/works/${work.id}/write?scene=${s.id}`}>
                <div>
                  <b>{s.title}</b>
                  <small>{fmt(s.updatedAt)}</small>
                </div>
                <span>{count(s.body).toLocaleString()}字</span>
              </NavLink>
            ))}
          {bundle?.references
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 3)
            .map((entry) => (
              <NavLink key={entry.id} to={`/works/${work.id}/reference`}>
                <div>
                  <b>{entry.name}</b>
                  <small>設定資料 · {fmt(entry.updatedAt)}</small>
                </div>
                <span>{entry.category}</span>
              </NavLink>
            ))}
          {!scenes.length && <p className="muted">シーンはまだありません。</p>}
        </section>
      </div>
      {completion && (
        <CompletionDialog
          b={completion}
          onCancel={() => setCompletion(null)}
          onComplete={() => {
            const next = {
              ...draft,
              status: "完成" as const,
              updatedAt: now(),
            };
            setDraft(next);
            void db.works.put(next);
            onChange(next);
            setCompletion(null);
          }}
        />
      )}
    </main>
  );
}

function Writer({
  work,
  onWorkChange,
}: {
  work: Work;
  onWorkChange: (w: Work) => void;
}) {
  const [chapters, setChapters] = useState<Chapter[]>([]),
    [scenes, setScenes] = useState<Scene[]>([]),
    [selected, setSelected] = useState<string | null>(
      new URLSearchParams(useLocation().search).get("scene"),
    ),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [sidebar, setSidebar] = useState(
      localStorage.getItem("storyos-sidebar") !== "closed",
    ),
    [focus, setFocus] = useState(false);
  const [writerPrefs, setWriterPrefs] = useState(() => ({
    sidebar: Number(localStorage.getItem("storyos-sidebar-width") || 310),
    fontSize: Number(localStorage.getItem("storyos-font-size") || 17),
    lineHeight: Number(localStorage.getItem("storyos-line-height") || 2.05),
    bodyWidth: Number(localStorage.getItem("storyos-body-width") || 1100),
    font: localStorage.getItem("storyos-font") || "serif",
  }));
  const [draft, setDraft] = useState<Scene | null>(null),
    [saveState, setSaveState] = useState<SaveState>("保存済み"),
    [bundle, setBundle] = useState<WorkBundle | null>(null),
    [designOpen, setDesignOpen] = useState(false),
    [findOpen, setFindOpen] = useState(false),
    [findText, setFindText] = useState(""),
    [replaceText, setReplaceText] = useState(""),
    [cursor, setCursor] = useState({ line: 1, column: 1, selection: 0 });
  const timer = useRef<number | undefined>(undefined),
    draftRef = useRef<Scene | null>(null),
    dirtyRef = useRef(false),
    manuscriptRef = useRef<HTMLTextAreaElement>(null),
    findInputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const [c, s, b] = await Promise.all([
      db.chapters.where("workId").equals(work.id).sortBy("order"),
      db.scenes.where("workId").equals(work.id).toArray(),
      getBundle(work.id),
    ]);
    setChapters(c);
    setScenes(s);
    setBundle(b);
    if (!selected && s.length)
      setSelected(s.sort((a, b) => a.order - b.order)[0].id);
  }, [work.id, selected]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (draftRef.current?.id === selected) return;
    const scene = scenes.find((s) => s.id === selected) || null;
    setDraft(scene);
    draftRef.current = scene;
    dirtyRef.current = false;
    setSaveState("保存済み");
  }, [selected, scenes]);
  const persist = useCallback(
    async (scene: Scene) => {
      setSaveState("保存中");
      try {
        const stamp = now(),
          next = { ...scene, updatedAt: stamp };
        const previous = await db.scenes.get(scene.id),
          delta = count(next.body) - count(previous?.body || "");
        await db.transaction(
          "rw",
          [db.scenes, db.works, db.writingLogs],
          async () => {
            await db.scenes.put(next);
            await db.works.update(work.id, {
              updatedAt: stamp,
              lastEditedAt: stamp,
            });
            if (delta !== 0)
              await db.writingLogs.add({
                id: newId(),
                workId: work.id,
                sceneId: scene.id,
                delta,
                totalCharacters: count(next.body),
                warningCount: bundle
                  ? analyzeStory({
                      ...bundle,
                      scenes: bundle.scenes.map((s) =>
                        s.id === next.id ? next : s,
                      ),
                    }).length
                  : 0,
                savedAt: stamp,
              });
          },
        );
        setScenes((v) => v.map((s) => (s.id === next.id ? next : s)));
        if (draftRef.current?.updatedAt === scene.updatedAt) {
          setDraft(next);
          draftRef.current = next;
          dirtyRef.current = false;
          setSaveState("保存済み");
        } else {
          setSaveState("編集中");
        }
        onWorkChange({ ...work, updatedAt: stamp, lastEditedAt: stamp });
      } catch {
        dirtyRef.current = true;
        setSaveState("保存失敗");
      }
    },
    [onWorkChange, work, bundle],
  );
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (draftRef.current && dirtyRef.current) return persist(draftRef.current);
    return Promise.resolve();
  }, [persist]);
  useEffect(() => {
    window.storyOSFlush = async () => {
      try {
        await flush();
        return !dirtyRef.current;
      } catch {
        return false;
      }
    };
    const focus = () => setFocus((v) => !v);
    window.addEventListener("storyos-focus-mode", focus);
    return () => {
      delete window.storyOSFlush;
      window.removeEventListener("storyos-focus-mode", focus);
    };
  }, [flush]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (draftRef.current && dirtyRef.current)
        void db.scenes.put(draftRef.current);
    },
    [],
  );
  function edit<K extends keyof Scene>(key: K, value: Scene[K]) {
    if (!draft) return;
    const stamp = now(),
      next = {
        ...draft,
        [key]: value,
        updatedAt: stamp,
        ...(key === "body" ? { bodyUpdatedAt: stamp } : {}),
        ...(key === "design" ? { designUpdatedAt: stamp } : {}),
      };
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setSaveState("編集中");
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(next), 700);
  }
  function updateCursor() {
    const area = manuscriptRef.current;
    if (!area) return;
    const before = area.value.slice(0, area.selectionStart),
      lineStart = before.lastIndexOf("\n") + 1;
    setCursor({
      line: before.split("\n").length,
      column: [...before.slice(lineStart)].length + 1,
      selection: [...area.value.slice(area.selectionStart, area.selectionEnd)]
        .length,
    });
  }
  function selectBodyRange(start: number, end: number) {
    requestAnimationFrame(() => {
      const area = manuscriptRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(start, end);
      updateCursor();
    });
  }
  function findInBody(direction = 1) {
    const area = manuscriptRef.current;
    if (!area || !findText || !draft) return;
    const body = draft.body,
      from = direction > 0 ? area.selectionEnd : area.selectionStart - 1;
    let index =
      direction > 0
        ? body.indexOf(findText, Math.max(0, from))
        : body.lastIndexOf(findText, from);
    if (index < 0)
      index =
        direction > 0 ? body.indexOf(findText) : body.lastIndexOf(findText);
    if (index >= 0) selectBodyRange(index, index + findText.length);
  }
  function replaceSelection() {
    const area = manuscriptRef.current;
    if (!area || !draft || !findText) return;
    const { selectionStart: start, selectionEnd: end } = area;
    if (draft.body.slice(start, end) !== findText) {
      findInBody();
      return;
    }
    const body = `${draft.body.slice(0, start)}${replaceText}${draft.body.slice(end)}`;
    edit("body", body);
    selectBodyRange(start, start + replaceText.length);
  }
  function replaceAll() {
    if (!draft || !findText) return;
    const occurrences = draft.body.split(findText).length - 1;
    if (!occurrences) return;
    edit("body", draft.body.split(findText).join(replaceText));
    selectBodyRange(0, 0);
  }
  function handleManuscriptKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab" || !draft) return;
    e.preventDefault();
    const area = e.currentTarget,
      start = area.selectionStart,
      end = area.selectionEnd;
    if (start === end) {
      if (e.shiftKey) {
        const removable =
          draft.body.slice(Math.max(0, start - 1), start) === "\u3000";
        if (!removable) return;
        edit("body", draft.body.slice(0, start - 1) + draft.body.slice(end));
        selectBodyRange(start - 1, start - 1);
      } else {
        edit(
          "body",
          draft.body.slice(0, start) + "\u3000" + draft.body.slice(end),
        );
        selectBodyRange(start + 1, start + 1);
      }
      return;
    }
    const lineStart = draft.body.lastIndexOf("\n", start - 1) + 1,
      selected = draft.body.slice(lineStart, end),
      transformed = e.shiftKey
        ? selected.replace(new RegExp("(^|\\n)\\u3000", "g"), "$1")
        : selected.replace(/(^|\n)/g, "$1\u3000"),
      body =
        draft.body.slice(0, lineStart) + transformed + draft.body.slice(end);
    edit("body", body);
    selectBodyRange(lineStart, lineStart + transformed.length);
  }
  async function choose(id: string) {
    await flush();
    setSelected(id);
  }
  async function addChapter() {
    const t = now();
    await db.chapters.add({
      id: newId(),
      workId: work.id,
      title: `第${chapters.length + 1}章`,
      synopsis: "",
      order: chapters.length,
      createdAt: t,
      updatedAt: t,
    });
    await load();
  }
  async function editChapter(c: Chapter) {
    const title = prompt("章タイトル", c.title)?.trim();
    if (title) {
      await db.chapters.update(c.id, { title, updatedAt: now() });
      await load();
    }
  }
  async function removeChapter(c: Chapter) {
    const child = scenes.filter((s) => s.chapterId === c.id);
    if (
      !confirm(`「${c.title}」と所属する${child.length}シーンを削除しますか？`)
    )
      return;
    await db.transaction("rw", db.chapters, db.scenes, async () => {
      await db.scenes.where("chapterId").equals(c.id).delete();
      await db.chapters.delete(c.id);
    });
    if (child.some((s) => s.id === selected)) setSelected(null);
    await normalizeChapters();
    await load();
  }
  async function addScene(chapterId: string) {
    await flush();
    const list = scenes.filter((s) => s.chapterId === chapterId),
      t = now(),
      scene: Scene = {
        id: newId(),
        workId: work.id,
        chapterId,
        title: "新しいシーン",
        summary: "",
        body: "",
        notes: "",
        order: list.length,
        status: "未着手",
        design: defaultSceneDesign(),
        bodyUpdatedAt: t,
        designUpdatedAt: t,
        createdAt: t,
        updatedAt: t,
      };
    await db.scenes.add(scene);
    await load();
    setSelected(scene.id);
  }
  async function removeScene(s: Scene) {
    if (confirm(`「${s.title}」を削除しますか？`)) {
      await db.scenes.delete(s.id);
      if (selected === s.id) setSelected(null);
      await normalizeScenes(s.chapterId);
      await load();
    }
  }
  async function normalizeChapters() {
    const list = await db.chapters
      .where("workId")
      .equals(work.id)
      .sortBy("order");
    const stamp = now();
    await db.chapters.bulkPut(
      list.map((c, i) => ({ ...c, order: i, updatedAt: stamp })),
    );
  }
  async function normalizeScenes(chapterId: string) {
    const list = (
      await db.scenes.where("chapterId").equals(chapterId).toArray()
    ).sort((a, b) => a.order - b.order);
    const stamp = now();
    await db.scenes.bulkPut(
      list.map((s, i) => ({ ...s, order: i, updatedAt: stamp })),
    );
  }
  async function moveChapter(c: Chapter, delta: number) {
    const i = chapters.findIndex((x) => x.id === c.id),
      other = chapters[i + delta];
    if (!other) return;
    const stamp = now();
    await db.chapters.bulkPut([
      { ...c, order: other.order, updatedAt: stamp },
      { ...other, order: c.order, updatedAt: stamp },
    ]);
    await load();
  }
  async function moveScene(s: Scene, delta: number) {
    const list = scenes
        .filter((x) => x.chapterId === s.chapterId)
        .sort((a, b) => a.order - b.order),
      i = list.findIndex((x) => x.id === s.id),
      other = list[i + delta];
    if (!other) return;
    const stamp = now();
    await db.scenes.bulkPut([
      { ...s, order: other.order, updatedAt: stamp },
      { ...other, order: s.order, updatedAt: stamp },
    ]);
    await load();
  }
  async function moveToChapter(s: Scene, chapterId: string) {
    if (chapterId === s.chapterId) return;
    const old = s.chapterId,
      order = scenes.filter((x) => x.chapterId === chapterId).length;
    await db.scenes.put({ ...s, chapterId, order, updatedAt: now() });
    await normalizeScenes(old);
    await load();
  }
  function toggleSidebar() {
    const n = !sidebar;
    setSidebar(n);
    localStorage.setItem("storyos-sidebar", n ? "open" : "closed");
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
      if (e.key === "F3" && findOpen) {
        e.preventDefault();
        findInBody(e.shiftKey ? -1 : 1);
      }
      if (e.key === "Escape" && findOpen) setFindOpen(false);
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setFocus((v) => !v);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "n" &&
        chapters[0]
      ) {
        e.preventDefault();
        void addScene(chapters[0].id);
      }
      if (
        e.altKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        selected
      ) {
        e.preventDefault();
        const ordered = [...scenes].sort((a, b) => a.order - b.order),
          i = ordered.findIndex((s) => s.id === selected),
          next = ordered[i + (e.key === "ArrowUp" ? -1 : 1)];
        if (next) void choose(next.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  function updateWriterPref<K extends keyof typeof writerPrefs>(
    key: K,
    value: (typeof writerPrefs)[K],
  ) {
    const next = { ...writerPrefs, [key]: value };
    setWriterPrefs(next);
    const storageKey =
      key === "sidebar"
        ? "sidebar-width"
        : key === "fontSize"
          ? "font-size"
          : key === "lineHeight"
            ? "line-height"
            : key === "bodyWidth"
              ? "body-width"
              : "font";
    localStorage.setItem(`storyos-${storageKey}`, String(value));
  }
  const total = scenes.reduce(
    (n, s) => n + count(s.id === draft?.id ? draft.body : s.body),
    0,
  );
  function saveDesign() {
    if (!draft) return;
    const index = bundle?.scenes.findIndex((s) => s.id === draft.id) ?? -1;
    const settings = work.longFormSettings;
    const tooEarly =
      draft.design.hasFullResolution &&
      (index + 1 < settings.finalResolutionMinScene ||
        ((index + 1) / Math.max(1, work.targetScenes)) * 100 <
          settings.finalResolutionMinProgress);
    if (work.longFormSupport && settings.hardLock && tooEarly) {
      alert(
        "強制ロックが有効です。完全解決を許可する位置より前のため保存できません。設定を変更するか、完全解決を解除してください。",
      );
      return;
    }
    edit("design", draft.design);
    setDesignOpen(false);
  }
  return (
    <main
      style={
        {
          "--sidebar-width": `${writerPrefs.sidebar}px`,
          "--editor-font-size": `${writerPrefs.fontSize}px`,
          "--editor-line-height": writerPrefs.lineHeight,
          "--editor-body-width": `${writerPrefs.bodyWidth}px`,
          "--editor-font":
            writerPrefs.font === "serif"
              ? "'Yu Mincho',serif"
              : "'Yu Gothic UI',sans-serif",
        } as CSSProperties
      }
      className={`writer ${focus ? "focus" : ""} ${sidebar ? "" : "sidebar-closed"}`}
    >
      <aside className="tree">
        <div className="tree-head">
          <b>章とシーン</b>
          <div>
            <button className="icon" onClick={addChapter} title="章を追加">
              <Plus />
            </button>
            <button
              className="editor-search-button"
              onClick={() => {
                setFindOpen((open) => !open);
                requestAnimationFrame(() => findInputRef.current?.focus());
              }}
              title="本文内検索・置換 (Ctrl+H)"
            >
              <Search />
              本文内検索
            </button>
            <button
              className="icon"
              onClick={toggleSidebar}
              title="サイドバーを閉じる"
            >
              <PanelLeftClose />
            </button>
          </div>
        </div>
        <div className="tree-scroll">
          {chapters.map((c) => {
            const children = scenes
                .filter((s) => s.chapterId === c.id)
                .sort((a, b) => a.order - b.order),
              isClosed = collapsed.has(c.id);
            return (
              <div className="chapter" key={c.id}>
                <div className="chapter-row">
                  <button
                    className="chevron"
                    onClick={() =>
                      setCollapsed((v) => {
                        const n = new Set(v);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                  >
                    {isClosed ? <ChevronRight /> : <ChevronDown />}
                  </button>
                  <button
                    className="chapter-title"
                    onDoubleClick={() => editChapter(c)}
                  >
                    {c.title}
                  </button>
                  <div className="row-actions">
                    <button onClick={() => moveChapter(c, -1)} title="上へ">
                      <ArrowUp />
                    </button>
                    <button onClick={() => moveChapter(c, 1)} title="下へ">
                      <ArrowDown />
                    </button>
                    <button onClick={() => editChapter(c)} title="編集">
                      <MoreVertical />
                    </button>
                    <button onClick={() => removeChapter(c)} title="削除">
                      <Trash2 />
                    </button>
                  </div>
                </div>
                {!isClosed && (
                  <div className="scene-list">
                    {children.map((s) => (
                      <div
                        key={s.id}
                        className={`scene-row ${s.id === selected ? "selected" : ""}`}
                      >
                        <button
                          className="scene-main"
                          onClick={() => void choose(s.id)}
                        >
                          <span>{s.title}</span>
                          <small>
                            {count(s.body).toLocaleString()}字 · {s.status}
                          </small>
                        </button>
                        <div className="row-actions">
                          <button onClick={() => moveScene(s, -1)} title="上へ">
                            <ArrowUp />
                          </button>
                          <button onClick={() => moveScene(s, 1)} title="下へ">
                            <ArrowDown />
                          </button>
                          <select
                            value={s.chapterId}
                            onChange={(e) =>
                              void moveToChapter(s, e.target.value)
                            }
                            title="章を移動"
                          >
                            {chapters.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => removeScene(s)} title="削除">
                            <Trash2 />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="add-scene"
                      onClick={() => addScene(c.id)}
                    >
                      <Plus />
                      シーンを追加
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
      <section className="editor-area">
        <div className="editor-bar">
          <div>
            {!sidebar && (
              <button
                className="icon"
                onClick={toggleSidebar}
                title="サイドバーを開く"
              >
                <Menu />
              </button>
            )}
            <span className={`save-state ${saveState}`}>
              {saveState === "保存中" && <i />}
              {saveState}
            </span>
          </div>
          <div className="counts">
            <span>
              シーン <b>{count(draft?.body || "").toLocaleString()}</b>字
            </span>
            <span>
              作品全体 <b>{total.toLocaleString()}</b>字
            </span>
            <details className="writer-settings">
              <summary>表示</summary>
              <div>
                <label>
                  サイドバー
                  <input
                    type="range"
                    min="220"
                    max="480"
                    value={writerPrefs.sidebar}
                    onChange={(e) =>
                      updateWriterPref("sidebar", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  文字サイズ
                  <input
                    type="range"
                    min="13"
                    max="26"
                    value={writerPrefs.fontSize}
                    onChange={(e) =>
                      updateWriterPref("fontSize", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  行間
                  <input
                    type="range"
                    min="1.4"
                    max="2.8"
                    step="0.1"
                    value={writerPrefs.lineHeight}
                    onChange={(e) =>
                      updateWriterPref("lineHeight", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  本文幅
                  <input
                    type="range"
                    min="640"
                    max="1600"
                    value={writerPrefs.bodyWidth}
                    onChange={(e) =>
                      updateWriterPref("bodyWidth", Number(e.target.value))
                    }
                  />
                </label>
                <select
                  value={writerPrefs.font}
                  onChange={(e) => updateWriterPref("font", e.target.value)}
                >
                  <option value="serif">明朝体</option>
                  <option value="sans">ゴシック体</option>
                </select>
              </div>
            </details>
            <button
              className="icon"
              onClick={() => setFocus(!focus)}
              title="集中モード"
            >
              <Focus />
            </button>
          </div>
        </div>
        {draft ? (
          <div className="editor-wrap">
            <div className="scene-fields">
              <input
                className="scene-title-input"
                value={draft.title}
                onChange={(e) => edit("title", e.target.value)}
                placeholder="シーンタイトル"
              />
              <select
                value={draft.status}
                onChange={(e) =>
                  edit("status", e.target.value as Scene["status"])
                }
              >
                {SCENE_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <textarea
                value={draft.summary}
                onChange={(e) => edit("summary", e.target.value)}
                placeholder="このシーンのあらすじ"
                rows={2}
              />
              <button
                className="button scene-design-button"
                onClick={() => setDesignOpen(true)}
              >
                シーン設計を開く
              </button>
            </div>
            <div className="manuscript-shell">
              {findOpen && (
                <div className="manuscript-find" role="search">
                  <input
                    ref={findInputRef}
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        findInBody(e.shiftKey ? -1 : 1);
                      }
                    }}
                    placeholder="検索する文字"
                  />
                  <input
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="置換後の文字"
                  />
                  <span>
                    {findText
                      ? `${Math.max(0, draft.body.split(findText).length - 1)}件`
                      : "0件"}
                  </span>
                  <button onClick={() => findInBody(-1)} title="前を検索">
                    <ArrowUp />
                  </button>
                  <button onClick={() => findInBody(1)} title="次を検索">
                    <ArrowDown />
                  </button>
                  <button onClick={replaceSelection}>置換</button>
                  <button onClick={replaceAll}>すべて置換</button>
                  <button
                    className="icon"
                    onClick={() => setFindOpen(false)}
                    title="閉じる"
                  >
                    <X />
                  </button>
                </div>
              )}
              <textarea
                ref={manuscriptRef}
                className="manuscript"
                value={draft.body}
                onChange={(e) => {
                  edit("body", e.target.value);
                  updateCursor();
                }}
                onKeyDown={handleManuscriptKeyDown}
                onSelect={updateCursor}
                onClick={updateCursor}
                onKeyUp={updateCursor}
                placeholder="物語を書き始める…"
                aria-label="シーン本文"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck={false}
                wrap="soft"
              />
              <footer className="manuscript-status">
                <span>{draft.body.split("\n").length.toLocaleString()}行</span>
                <span>
                  {cursor.line}行 {cursor.column}列
                </span>
                {cursor.selection > 0 && (
                  <span>選択 {cursor.selection.toLocaleString()}文字</span>
                )}
                <span className="indent-hint">Tab: 全角字下げ</span>
              </footer>
            </div>
            <details className="notes">
              <summary>シーンメモ</summary>
              <textarea
                value={draft.notes}
                onChange={(e) => edit("notes", e.target.value)}
                placeholder="伏線、調べもの、修正点など"
                rows={5}
              />
            </details>
          </div>
        ) : (
          <Empty
            title="シーンを選択してください"
            text="左のツリーからシーンを選ぶか、新しいシーンを追加してください。"
          />
        )}
      </section>
      {focus && (
        <button
          className="exit-focus icon"
          onClick={() => setFocus(false)}
          title="集中モードを終了"
        >
          <X />
        </button>
      )}
      {designOpen && draft && bundle && (
        <SceneDesignModal
          scene={draft}
          bundle={bundle}
          setScene={setDraft}
          onClose={() => setDesignOpen(false)}
          onSave={saveDesign}
        />
      )}
    </main>
  );
}

function DataManager({ work }: { work: Work }) {
  const input = useRef<HTMLInputElement>(null),
    nav = useNavigate();
  const [backupPref, setBackupPref] = useState<
    import("./types").WorkPreference | null
  >(null);
  useEffect(() => {
    db.workPreferences
      .where("workId")
      .equals(work.id)
      .first()
      .then((p) => setBackupPref(p || null));
  }, [work.id]);
  async function exportWork() {
    const bundle = await getBundle(work.id);
    const snapshots = await db.snapshots
      .where("workId")
      .equals(work.id)
      .toArray();
    if (bundle)
      saveFile(
        {
          appName: "Story OS",
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: now(),
          kind: "work",
          data: bundle,
          snapshots,
        } satisfies ExportEnvelope,
        `story-os-${work.title}.json`,
      );
    const pref = await db.workPreferences
      .where("workId")
      .equals(work.id)
      .first();
    if (pref)
      await db.workPreferences.put({
        ...pref,
        lastBackupAt: now(),
        updatedAt: now(),
      });
  }
  async function exportAll() {
    const works = await db.works.toArray(),
      bundles = (await Promise.all(works.map((w) => getBundle(w.id)))).filter(
        (x): x is WorkBundle => !!x,
      );
    const snapshots = await db.snapshots.toArray();
    saveFile(
      {
        appName: "Story OS",
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: now(),
        kind: "all",
        data: bundles,
        snapshots,
      } satisfies ExportEnvelope,
      `story-os-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }
  async function exportManuscript() {
    const bundle = await getBundle(work.id);
    if (!bundle) return;
    const text = [...bundle.chapters]
      .sort((a, b) => a.order - b.order)
      .map(
        (chapter) =>
          `# ${chapter.title}\n\n${bundle.scenes
            .filter((scene) => scene.chapterId === chapter.id)
            .sort((a, b) => a.order - b.order)
            .map((scene) => `## ${scene.title}\n\n${scene.body}`)
            .join("\n\n")}`,
      )
      .join("\n\n");
    await filePort.saveText?.(text, `${work.title}.md`, "markdown");
  }
  async function importJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processImport(await filePort.readJson(file));
  }
  async function importNative() {
    try {
      const value = await filePort.openJson?.();
      if (value) await processImport(value);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "バックアップを読み込めませんでした。",
      );
    }
  }
  async function processImport(value: unknown) {
    try {
      const raw = migrateExport(value);
      const bundles = Array.isArray(raw.data) ? raw.data : [raw.data];
      const preview = bundles
        .map(
          (b) =>
            `・${b.work.title}: ${b.chapters.length}章 / ${b.scenes.length}シーン / ${b.references.length}設定`,
        )
        .join("\n");
      if (
        !confirm(
          `インポート内容を確認してください。\n${preview}\n\n取り込みを開始しますか？`,
        )
      )
        return;
      for (const original of bundles) {
        let bundle = original;
        const exists = await db.works.get(bundle.work.id);
        if (exists) {
          const choice = prompt(
            `「${bundle.work.title}」と同じIDの作品があります。\n上書き: overwrite / 複製: copy / キャンセル: cancel`,
            "copy",
          );
          if (choice === "cancel" || choice === null) continue;
          if (choice === "copy") bundle = cloneBundle(bundle);
          else if (choice === "overwrite")
            await createSnapshot(bundle.work.id, "インポート前（自動）");
          else throw new Error("選択を認識できませんでした。");
        }
        await putBundle(bundle);
      }
      if (raw.snapshots?.length) await db.snapshots.bulkPut(raw.snapshots);
      alert(
        `${bundles.length}件のデータを確認し、インポート処理が完了しました。`,
      );
      nav("/");
    } catch (err) {
      alert(
        `インポートできませんでした。\n${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  function handleDataAction(action: string) {
    if (action === "export-backup") void exportAll();
    if (action === "import-backup") void importNative();
    if (action === "export-manuscript") void exportManuscript();
    if (action === "backup-help")
      alert(
        "作品単位または全作品バックアップを定期的に作成し、別のドライブにも保管してください。",
      );
  }
  useEffect(() => {
    const action = sessionStorage.getItem("storyos-menu-action");
    if (!action) return;
    sessionStorage.removeItem("storyos-menu-action");
    handleDataAction(action);
  });
  useEffect(() => {
    const handler = (event: Event) =>
      handleDataAction((event as CustomEvent<string>).detail);
    window.addEventListener("storyos-data-action", handler);
    return () => window.removeEventListener("storyos-data-action", handler);
  });
  return (
    <main className="content data-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">バックアップと復元</p>
          <h1>データ管理</h1>
        </div>
      </div>
      <section className="panel data-actions">
        <div>
          <Download />
          <h2>この作品をエクスポート</h2>
          <p>
            「{work.title}
            」の作品情報、章、シーン、本文を1つのJSONファイルに保存します。
          </p>
          <Button onClick={exportWork}>作品を保存</Button>
        </div>
        <div>
          <Download />
          <h2>全作品をバックアップ</h2>
          <p>このブラウザに保存されているすべての作品をまとめて保存します。</p>
          <Button onClick={exportAll}>全作品を保存</Button>
          <Button onClick={exportManuscript}>本文をMarkdownで保存</Button>
        </div>
        <div>
          <Upload />
          <h2>JSONからインポート</h2>
          <p>
            Story
            OSのバックアップファイルを検証して取り込みます。同じIDは処理方法を選べます。
          </p>
          <Button
            onClick={() =>
              environment.kind === "electron"
                ? void importNative()
                : input.current?.click()
            }
          >
            ファイルを選択
          </Button>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={importJson}
          />
        </div>
      </section>
      <section className="notice">
        <b>データはこの端末だけに保存されます</b>
        <p>
          本文が外部に送信されることはありません。ブラウザのデータ削除や端末故障に備え、定期的に「全作品をバックアップ」してください。
        </p>
        <p>
          最終バックアップ:{" "}
          {backupPref?.lastBackupAt
            ? fmt(backupPref.lastBackupAt)
            : "まだ記録されていません"}
        </p>
        {backupPref && (
          <label className="field backup-reminder">
            <span>バックアップを促す間隔（日、0で無効）</span>
            <input
              type="number"
              min="0"
              value={backupPref.backupReminderDays}
              onChange={async (e) => {
                const next = {
                  ...backupPref,
                  backupReminderDays: Number(e.target.value),
                  updatedAt: now(),
                };
                setBackupPref(next);
                await db.workPreferences.put(next);
              }}
            />
          </label>
        )}
        {backupPref &&
          backupPref.backupReminderDays > 0 &&
          (!backupPref.lastBackupAt ||
            Date.now() - Date.parse(backupPref.lastBackupAt) >
              backupPref.backupReminderDays * 86400000) && (
            <p className="issue">バックアップ推奨日を過ぎています。</p>
          )}
      </section>
    </main>
  );
}

function cloneBundle(b: WorkBundle): WorkBundle {
  const wid = newId(),
    time = now(),
    map = new Map(b.chapters.map((c) => [c.id, newId()])),
    sceneMap = new Map(b.scenes.map((s) => [s.id, newId()])),
    refMap = new Map(b.references.map((r) => [r.id, newId()])),
    fsMap = new Map(b.foreshadows.map((f) => [f.id, newId()]));
  const sid = (id: string) => sceneMap.get(id) || "";
  const rid = (id: string) => refMap.get(id) || "";
  return normalizeBundle({
    work: {
      ...b.work,
      id: wid,
      title: `${b.work.title}（インポート）`,
      createdAt: time,
      updatedAt: time,
      lastEditedAt: time,
    },
    chapters: b.chapters.map((c) => ({
      ...c,
      id: map.get(c.id)!,
      workId: wid,
    })),
    scenes: b.scenes.map((s) => ({
      ...s,
      id: sceneMap.get(s.id)!,
      workId: wid,
      chapterId: map.get(s.chapterId)!,
      design: {
        ...s.design,
        povCharacterId: rid(s.design.povCharacterId),
        characterIds: s.design.characterIds.map(rid).filter(Boolean),
        locationId: rid(s.design.locationId),
      },
    })),
    references: b.references.map((r) => ({
      ...r,
      id: refMap.get(r.id)!,
      workId: wid,
      firstSceneId: sid(r.firstSceneId),
      relatedSceneIds: r.relatedSceneIds.map(sid).filter(Boolean),
      relatedCharacterIds: r.relatedCharacterIds.map(rid).filter(Boolean),
      memberCharacterIds: r.memberCharacterIds.map(rid).filter(Boolean),
      ownerCharacterId: rid(r.ownerCharacterId),
      foreshadowId: fsMap.get(r.foreshadowId) || "",
      relatedEntryIds: r.relatedEntryIds.map(rid).filter(Boolean),
    })),
    relationships: b.relationships.map((r) => ({
      ...r,
      id: newId(),
      workId: wid,
      sourceCharacterId: rid(r.sourceCharacterId),
      targetCharacterId: rid(r.targetCharacterId),
      startSceneId: sid(r.startSceneId),
      changes: r.changes.map((c) => ({ ...c, sceneId: sid(c.sceneId) })),
    })),
    foreshadows: b.foreshadows.map((f) => ({
      ...f,
      id: fsMap.get(f.id)!,
      workId: wid,
      setupSceneId: sid(f.setupSceneId),
      emphasisSceneIds: f.emphasisSceneIds.map(sid).filter(Boolean),
      plannedPayoffSceneId: sid(f.plannedPayoffSceneId),
      payoffSceneId: sid(f.payoffSceneId),
      characterIds: f.characterIds.map(rid).filter(Boolean),
      itemIds: f.itemIds.map(rid).filter(Boolean),
    })),
    questions: b.questions.map((q) => ({
      ...q,
      id: newId(),
      workId: wid,
      occurrenceSceneId: sid(q.occurrenceSceneId),
      characterIds: q.characterIds.map(rid).filter(Boolean),
      plannedResolutionSceneId: sid(q.plannedResolutionSceneId),
      resolutionSceneId: sid(q.resolutionSceneId),
    })),
    promises: b.promises.map((p) => ({
      ...p,
      id: newId(),
      workId: wid,
      speakerCharacterId: rid(p.speakerCharacterId),
      occurrenceSceneId: sid(p.occurrenceSceneId),
      fulfillmentSceneId: sid(p.fulfillmentSceneId),
    })),
    subplots: b.subplots.map((p) => ({
      ...p,
      id: newId(),
      workId: wid,
      characterIds: p.characterIds.map(rid).filter(Boolean),
      startSceneId: sid(p.startSceneId),
      progressSceneIds: p.progressSceneIds.map(sid).filter(Boolean),
      plannedResolutionSceneId: sid(p.plannedResolutionSceneId),
      resolutionSceneId: sid(p.resolutionSceneId),
    })),
    warningPreferences: [],
    spellingRules: b.spellingRules.map((r) => ({
      ...r,
      id: newId(),
      workId: wid,
    })),
    workPreferences: b.workPreferences.map((p) => ({
      ...p,
      id: wid,
      workId: wid,
    })),
    timelineEvents: b.timelineEvents.map((e) => ({
      ...e,
      id: newId(),
      workId: wid,
      sceneIds: e.sceneIds.map(sid).filter(Boolean),
      characterIds: e.characterIds.map(rid).filter(Boolean),
      locationIds: e.locationIds.map(rid).filter(Boolean),
    })),
    knowledgeItems: b.knowledgeItems.map((k) => ({
      ...k,
      id: newId(),
      workId: wid,
      originSceneId: sid(k.originSceneId),
      states: k.states.map((s) => ({
        ...s,
        characterId: rid(s.characterId),
        fromSceneId: sid(s.fromSceneId),
      })),
    })),
    branchIdeas: b.branchIdeas.map((x) => ({
      ...x,
      id: newId(),
      workId: wid,
      originSceneId: sid(x.originSceneId),
      parentId: "",
      characterIds: x.characterIds.map(rid).filter(Boolean),
      referenceIds: x.referenceIds.map(rid).filter(Boolean),
    })),
    writingLogs: [],
  });
}
export default App;
