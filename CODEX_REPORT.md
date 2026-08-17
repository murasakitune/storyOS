# Story OS Google Drive同期 実装レポート

作成日: 2026-08-17  
対象バージョン: 0.2.1

## 0.2.1 追加修正

- `npm run dev`ではService Workerを登録せず、同一オリジンに残った旧Workerと`story-os-*`キャッシュを解除。
- PWA更新時はwaiting Workerへ`SKIP_WAITING`を送り、controller切替後に再読込。
- Google Driveの設定でElectron非対応の`prompt()`を廃止。
- ブラウザ/Electron共通の同期設定モーダルを追加。
- ブラウザ版とElectron版を同一renderer・同一バージョン0.2.1として再生成。

## 変更した主なファイル

- `src/sync/types.ts`: 同期コレクションとDrive同期形式
- `src/sync/merge.ts`: UUID・更新日時・削除墓標による純粋マージ処理
- `src/sync/storage.ts`: IndexedDBと同期形式の相互変換、削除検出、適用処理
- `src/sync/google-drive.ts`: OAuth、Drive REST API、appDataFolder入出力
- `src/sync/GoogleDriveSync.tsx`: 自動同期スケジューラ、手動同期、状態UI
- `src/db.ts`: Dexie v4、同期メタデータテーブル
- `src/types.ts`: 同期メタデータと本文・シーン設計別更新日時
- `src/defaults.ts`: 旧シーンデータの自動補完
- `src/App.tsx`: グローバル同期UIと同期後の画面更新
- `src/shared/electron-api.ts`, `electron/preload.ts`, `electron/main.ts`: Electron OAuthだけを担う限定IPC
- `public/oauth-callback.html`: ブラウザOAuthコールバック
- `public/sw.js`: PWAキャッシュ更新
- `vercel.json`, `.env.example`: VercelとOAuth環境変数
- `scripts/sync-validation.ts`: マージ・削除・検証の回帰テスト
- `README.md`: デプロイ、Google設定、利用方法

## 実装内容

Driveの`appDataFolder`に`story-os-sync-v1.json`を1ファイル作成します。ファイル内部は次のコレクションへ分離されています。

- works / chapters / scenes
- sceneBodies / sceneDesigns
- references / relationships
- foreshadows / questions / promises / subplots
- warningPreferences / spellingRules / workPreferences
- timelineEvents / knowledgeItems / branchIdeas / writingLogs / snapshots

ローカルIndexedDBは既存構造を維持します。同期境界でシーンから本文とシーン設計を分離・再結合します。既存シーンには`bodyUpdatedAt`と`designUpdatedAt`を自動補完します。作品JSONのschemaVersionは4、Dexieはversion 4です。

## 同期フロー

1. IndexedDB変更をDexieの`storagemutated`で検知し、LocalStorageへ最終変更時刻を記録。
2. 最後の変更から10秒待機。
3. 保留中の本文自動保存をflush。
4. Drive `appDataFolder`から同期ファイルを検索・ダウンロード。
5. コレクションごと、UUIDごとにローカルとDriveを比較。
6. 同じUUIDは`updatedAt`、`bodyUpdatedAt`、`designUpdatedAt`、`savedAt`等の新しい方を採用。
7. 前回同期時に存在し現在消えたUUIDを削除墓標としてマージ。
8. マージ結果をIndexedDBへ適用し、日付順へ正規化。
9. 同じマージ結果をDriveへアップロードして両端末を収束。
10. Drive由来の変更がある場合だけ画面を再読込。

ダウンロード契機は接続済みセッションの起動時、`visibilitychange`で表示へ戻った時、5分間隔です。「同期」ボタンも維持しています。

## 追加した設定

```text
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_GOOGLE_REDIRECT_URI=https://<vercel-domain>/oauth-callback.html
```

アクセストークンはsessionStorageとメモリだけに置き、LocalStorageやIndexedDB、Drive同期ファイルには保存しません。クライアントシークレットは不要です。

環境変数を埋め込まない場合は、画面の「設定」からClient IDとHTTPSコールバックURIをLocalStorageへ登録できます。Client IDは公開識別子で、クライアントシークレットは扱いません。

## 実行した確認

- TypeScript型チェック、ESLint
- UUID追加・更新日時競合・削除墓標・日付整列・形式検証テスト
- IndexedDB v4への移行とDexie変更通知テスト
- 第2段階、第3段階、キャラクターシート、Electron安全設定の全回帰テスト
- Vite/Vercel向けproduction build
- Electron main/preloadコンパイル、NSIS/portable生成
- 展開済み版とportable版を隔離プロファイルで起動し、DB作成と既存本文操作を確認

Google OAuth/Drive実アカウントとのE2E通信はClient IDとテストユーザーが未提供のため未実施です。`scripts/sync-validation.ts`で同期中核を自動検証し、実アカウント確認手順を下記に記載しています。

## Google Drive API側で必要な設定

1. Google Cloudプロジェクトを作成。
2. Google Drive APIを有効化。
3. OAuth同意画面を構成。開発中はテストユーザーを登録。
4. OAuth 2.0 Client IDを「ウェブアプリケーション」として作成。
5. 承認済みJavaScript生成元にVercelオリジンと`http://localhost:5173`を登録。
6. 承認済みリダイレクトURIにVercel/localhost双方の`/oauth-callback.html`を登録。
7. 使用スコープは`https://www.googleapis.com/auth/drive.appdata`のみ。

公式資料:

- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list

## 手動確認手順

1. `.env.local`またはVercel環境変数へClient IDとリダイレクトURIを設定。
2. `npm run dev`で起動し「Drive接続」を押す。
3. Google同意画面でテストユーザーを選び、状態が「同期完了」になることを確認。
4. PC側で作品・章・シーン・本文・キャラクターを作成。
5. 最終入力から10秒後に「同期完了」になることを確認。
6. AndroidのVercel版で同じGoogleアカウントへ接続し、データが追加されることを確認。
7. 両端末で別レコードを作り、UUID重複なしで双方に現れることを確認。
8. 同じレコードを順番に編集し、更新日時が新しい内容になることを確認。
9. レコードを削除し、別端末同期後に復活しないことを確認。
10. PCで本文、Androidで同じシーンの設計を変更し、両方が残ることを確認。
11. タブ復帰、5分定期同期、手動「同期」を確認。
12. ネットワークを切って編集し、再接続後に同期されることを確認。

## 制約

Googleのブラウザ向けアクセストークンは短命であり、バックエンドへrefresh tokenを置かない今回の構成では、期限切れやブラウザ完全終了後にユーザー操作で再接続が必要です。接続済みセッション中は指定された全自動同期契機が動作します。`appDataFolder`はDrive UIから見えず、Googleアカウント側でアプリ連携データを削除すると復元できないため、従来のJSONバックアップも併用してください。
