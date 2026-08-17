# Story OS

Story OS は、作品・章・シーン・本文に加え、設定資料、プロット、伏線、時系列、点検を一か所で管理できる、オフライン中心の小説執筆支援アプリです。ブラウザ/PWA版とWindows向けElectron版を同じ画面・データ形式で提供します。本文や分析結果を外部へ送信せず、生成AI、クラウドDB、実行時CDNを使用しません。

Google Drive同期を有効にした場合に限り、暗号化されたHTTPS通信でGoogle Driveの非表示領域`appDataFolder`へ同期データを送受信します。それ以外の外部送信はありません。

## 必要環境

- Node.js 20.19以上（または22.13以上）
- npm
- Windows 10/11（デスクトップ版の実行・配布物作成時）

## ブラウザ/PWA版

```bash
npm install
npm run dev
```

表示されたlocalhostのURLをブラウザで開きます。本番相当の確認は次の手順です。

```bash
npm run build
npm run preview
```

ブラウザの「アプリをインストール」を選ぶとPWAとして利用できます。一度読み込んだアプリシェルはService Workerへ保存され、オフラインでも起動できます。更新の適用時も、編集中の本文を自動的に破棄しません。

### Vercelへのデプロイ

VercelでリポジトリをImportし、Framework PresetをViteにします。`vercel.json`にビルドコマンドとセキュリティヘッダーを設定済みです。Environment Variablesへ次を設定してからデプロイしてください。

```text
VITE_GOOGLE_CLIENT_ID=Google Cloudで作成したWeb application Client ID
VITE_GOOGLE_REDIRECT_URI=https://実際のVercelドメイン/oauth-callback.html
```

Viteの環境変数はビルド時に埋め込まれるため、変更後は再デプロイが必要です。値の例は`.env.example`にあります。OAuthクライアントシークレットは使用せず、Vercelにも登録しないでください。

## Google Drive同期

画面右上（狭い画面では右下）の「Drive接続」を押してGoogleアカウントを選択します。権限は`https://www.googleapis.com/auth/drive.appdata`だけを要求します。同期ファイルはGoogle Drive UIから見えないアプリ専用領域へ保存されます。

- 接続済みセッションのアプリ起動時にダウンロード
- タブへ戻ったときにダウンロード
- 5分ごとに定期同期
- IndexedDB変更後、最後の変更から10秒後にアップロード
- 「同期」ボタンによる手動同期
- UUIDがないデータを追加し、同じUUIDは更新日時が新しい方を採用
- 削除は墓標として同期し、別端末で復活しないよう処理
- 作品、章、シーン情報、本文、シーン設計、キャラクター等を別コレクションで保持

Googleのブラウザ向けトークンは短期間だけ有効で、refresh tokenをブラウザへ保存しない安全設計です。期限切れまたはブラウザ完全終了後は「Drive接続」をもう一度押してください。再接続後は通常の自動同期へ戻ります。オフライン中の変更はIndexedDBへ残り、接続回復後の同期でマージされます。

### Google Cloud側の設定

1. Google Cloud Consoleでプロジェクトを作成する。
2. Google Drive APIを有効化する。
3. OAuth同意画面を設定し、開発中は利用するGoogleアカウントをテストユーザーへ追加する。
4. OAuth Client IDを「ウェブアプリケーション」で作成する。
5. 承認済みJavaScript生成元へVercelのオリジンと`http://localhost:5173`を追加する。
6. 承認済みリダイレクトURIへ`https://実際のVercelドメイン/oauth-callback.html`と`http://localhost:5173/oauth-callback.html`を追加する。

Electron版も同じClient IDとDrive同期サービスを使用します。製品ビルドにはHTTPSの`VITE_GOOGLE_REDIRECT_URI`が必要です。

環境変数を埋め込まずに使う場合は、画面の同期表示にある「設定」からClient IDを入力できます。Electronでは併せてVercel上のHTTPSコールバックURIを入力します。Client IDは公開識別子であり秘密情報ではありませんが、クライアントシークレットは入力・保存しないでください。

## Electronデスクトップ版

開発モードはViteとElectronを同時に起動します。開発版のデータは製品版と分離されます。

```bash
npm run dev:electron
```

製品ビルドをローカル起動する場合は次を実行します。

```bash
npm run start:electron
```

Windows向けインストーラーとポータブル版の作成:

```bash
npm run dist:win
```

成果物は `release/Story-OS-Setup-<version>-x64.exe` と `release/Story-OS-Portable-<version>-x64.exe` です。インストーラーはインストール先を選択でき、デスクトップとスタートメニューにショートカットを作成します。現在の配布物はコード署名されていないため、Windows SmartScreenの警告が出る場合があります。公開配布前に組織の証明書で署名してください。自動更新は未実装で、新版は新しいインストーラーを上書き実行して更新します。

## ブラウザ版とデスクトップ版の違い

機能とバックアップ形式は共通ですが、ブラウザとElectronはセキュリティ上、別々のIndexedDBを使用します。ブラウザ/PWA版から移行する場合は「データ管理」で全作品JSONを書き出し、Electron版でそのJSONを読み込んでください。逆方向も同じ手順です。OS標準の保存・選択ダイアログはElectron版でのみ使用し、ブラウザ版では従来のダウンロードとファイル選択を使用します。

## データ保存とバックアップ

- 作品、章、シーン、本文、設定資料、分析設定: Dexie.js経由のIndexedDB `StoryOS`
- テーマやサイドバー幅など軽量な表示設定: LocalStorage
- Windows製品版のWebストレージ: `%APPDATA%\Story OS`
- Electron開発版のWebストレージ: `%APPDATA%\Story OS Development`

通常のアンインストールではユーザーデータを削除しない設定です。ただし、手動削除、ストレージクリーナー、OS初期化などでは失われる可能性があります。「データ管理」から定期的に全作品JSONを別ドライブへ保存してください。アプリのフォルダーを直接コピーするより、JSONエクスポートを正式な移行・復旧方法として推奨します。

エクスポートにはアプリ名、schemaVersion、出力日時が含まれます。第1〜第3段階の旧形式はインポート時に検証・移行され、不足フィールドには安全な初期値を補います。同一作品IDがある場合は上書き、複製、キャンセルを選択できます。上書き前には復元用スナップショットを作成します。

### キャラクターシートの相互利用

「設定資料」→「キャラクター」では、詳細プロフィール41項目を管理できます。`charcter_sheet.html`から出力した`.chara`を「.charaを読込」で取り込めます。各キャラクターカードのダウンロードボタン、または編集画面の「.charaで書き出す」から出力したファイルは、元のHTMLのインポート機能でそのまま開けます。印刷・PDF保存にも対応しています。

## 自動保存と終了

本文は入力停止から短いデバウンス後に保存します。シーン移動、作品移動、ウィンドウ終了時には保留中の保存を先に確定し、保存に失敗した場合は終了確認を表示します。OSの強制終了や電源断はこの確認を待てないため、重要な節目では手動保存とJSONバックアップも併用してください。

本文エディタでは行・列・選択文字数を確認でき、`Ctrl/Cmd + H`で本文内の検索・置換、`F3`/`Shift + F3`で次・前の候補へ移動できます。`Tab`は全角空白による字下げ、複数行選択時は各行の字下げ、`Shift + Tab`は字下げ解除として動作します。

## Electronの安全設計

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- preloadから公開するのは、検証済みの保存/読込ダイアログ、メニュー通知、終了確認のみ
- rendererへNode.js、任意パス、任意コマンド実行を公開しない
- 本番画面は安定した `storyos://` オリジンから読み込み、CSPを適用
- 新規ウィンドウを拒否し、外部URLは許可リスト方式
- 二重起動を抑止し、既存ウィンドウを前面へ表示

## 検証コマンド

```bash
npm run typecheck
npm run lint
npm run test:stage2
npm run test:stage3
npm run test:electron
npm run build:electron
```

## 主な構成

- `src/types.ts`: 拡張可能なドメイン型
- `src/db.ts`: IndexedDBスキーマとDexie操作
- `src/migrations.ts`: DB/バックアップの移行
- `src/defaults.ts`: 旧データを安全に補完する既定値
- `src/analysis.ts`: 外部APIを使わない構造分析
- `src/services/platform.ts`: ブラウザ/Electron共通のファイル操作ポート
- `src/shared/electron-api.ts`: rendererとpreload間の型付き契約
- `electron/main.ts`: ウィンドウ、メニュー、OSダイアログ、安全なIPC
- `electron/preload.ts`: 最小限のcontextBridge API
- `scripts/electron-validation.ts`: Electron安全設定の静的回帰テスト

## ショートカット

- `Ctrl/Cmd + S`: 編集中の本文を保存
- `Ctrl/Cmd + Shift + F`: 集中モード
- `Ctrl/Cmd + Shift + N`: シーン追加
- `Ctrl/Cmd + K` または `Ctrl/Cmd + F`: 作品内検索
- `Alt + ← / →`: 前後のシーン

## 今後の配布対応

正式配布時は、コード署名、署名済み更新フィード、自動更新、クラッシュレポートの明示的なオプトイン設計を追加してください。現在の版はネットワーク不要で主要機能が完結し、手動インストール/更新を前提としています。
