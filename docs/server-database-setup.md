# サーバーとデータベースで管理するには

## 全体構成

```
[ブラウザ] ←→ [Vite フロント] ←→ [API サーバー (Node/Express)] ←→ [SQLite DB]
                    localhost:5173        localhost:3001              papers.db
```

- **フロント**：いまの React アプリ。表示・操作はそのまま。
- **API サーバー**：論文・フォルダの CRUD と PDF アップロードを提供。
- **DB**：SQLite で論文・フォルダを永続化（ファイル 1 つで完結）。

---

## データベース

### テーブル例

**papers**（論文）

| カラム      | 型         | 説明 |
|------------|------------|------|
| id         | INTEGER PK | 連番 |
| title      | TEXT       | 英語タイトル |
| title_ja   | TEXT       | 日本語タイトル |
| authors    | TEXT (JSON) | 著者配列 |
| journal    | TEXT       | ジャーナル |
| year       | INTEGER    | 年 |
| doi        | TEXT       | DOI |
| abstract   | TEXT       | 要旨 |
| notes      | TEXT       | メモ |
| folder     | TEXT       | フォルダ名 |
| tags       | TEXT (JSON) | タグ配列 |
| status     | TEXT       | unread / reading / read |
| starred    | INTEGER 0/1 | お気に入り |
| pdf_path   | TEXT       | 保存した PDF のパス（任意） |
| added      | TEXT       | 追加日 YYYY-MM-DD |
| created_at | TEXT       | 作成日時 |
| updated_at | TEXT       | 更新日時 |

**folders**（フォルダ名一覧）

| カラム | 型         | 説明 |
|--------|------------|------|
| id     | INTEGER PK | 連番 |
| name   | TEXT UNIQUE | フォルダ名（「すべて」は登録しない） |

---

## API 例

| メソッド | パス | 説明 |
|----------|------|------|
| GET      | /api/papers   | 論文一覧取得 |
| POST     | /api/papers   | 論文追加（JSON + 任意で PDF） |
| GET      | /api/papers/:id | 1件取得 |
| PUT      | /api/papers/:id | 更新 |
| DELETE   | /api/papers/:id | 削除 |
| GET      | /api/folders  | フォルダ一覧 |
| POST     | /api/folders  | フォルダ追加 |
| DELETE   | /api/folders/:name | フォルダ削除 |
| GET      | /api/papers/:id/pdf | PDF ダウンロード |

---

## 運用の流れ

1. **開発時**
   - ターミナル1: `npm run dev`（フロント 5173）
   - ターミナル2: `node server/index.js` など（API 3001）
   - フロントの API 呼び出し先を `http://localhost:3001` に設定。

2. **本番**
   - フロント: Vite でビルド → 静的ファイルをサーバーで配信 or Vercel/Netlify など。
   - API: Railway / Render / 自前 VPS などにデプロイ。同じサーバーで SQLite ファイルを保存。

3. **PDF**
   - サーバーの `uploads/` などにファイル保存し、`papers.pdf_path` に相対パスを保存。取得は `GET /api/papers/:id/pdf` でファイル返却。

---

## 次のステップ

- 同じリポジトリに `server/` を追加し、上記の API と SQLite を実装する。
- フロントは `fetch('/api/papers')` などで API を叩き、表示・追加・編集・削除をすべて API 経由にする。

実装まで進める場合は「サーバーとフロントの実装までやって」と指定してください。
