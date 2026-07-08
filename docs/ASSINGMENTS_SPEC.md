# 課題表示機能（Canvas API連携）実装仕様書

このファイルは Claude Code に渡す追加実装の指示書です。既存のバックエンド（空き教室検索）に、
Canvas LMS から自分の課題を取得して返すエンドポイントを追加します。

Claude Code には「ASSIGNMENTS_SPEC.md に従って課題取得機能を追加して」と伝えてください。

---

## 0. 目的とスコープ

- 自分の Canvas（KLMS）から履修科目の課題を取得し、締め切り順に並べて返す。
- 提出済み / 未提出 / 期限切れ の状態も返す（設計対話 Step1 の「未提出だけ抽出」「あと3日」を実現するため）。
- **今回は自分ひとり用**（トークン1個を `.env` に置く）。複数ユーザー対応は将来課題（下の「9」参照）。

## 1. 【最重要・セキュリティ】絶対に守ること

Canvas のアクセストークンは Canvas のパスワードと同等の権限を持つ。次を厳守すること。

- トークンは **バックエンドの `.env` にのみ** 置く。フロントエンド（HTML/JS）・レスポンス・ログに**絶対に出さない**。
- `/api/assignments` のレスポンスにトークンを含めない。
- `console.log` などでトークンやその一部を出力しない。
- `.env` は `.gitignore` に入っていることを確認する（コミット禁止）。
- Canvas への通信は必ず HTTPS。トークンは URL クエリではなく **Authorization ヘッダ**で送る。

## 2. 環境変数（.env に追加）

```
CANVAS_BASE_URL="https://<自分の大学のCanvasドメイン>"   # 例: https://lms.example.ac.jp （末尾スラッシュなし）
CANVAS_TOKEN="<Canvasのユーザー設定で発行したアクセストークン>"
```

※ トークンは Canvas にログイン →「アカウント > 設定 > 承認済み統合 > 新しいアクセストークンを作成」で発行する。

## 3. 追加するファイル

```
backend/src/
├── services/
│   └── canvasService.ts      # Canvas APIを叩いて課題を取得・整形
├── controllers/
│   └── assignmentController.ts
└── routes/
    └── assignments.ts
```

## 4. Canvas API の使い方（この手順で取得すること）

ベースURLは `CANVAS_BASE_URL`、認証は全リクエストで `Authorization: Bearer <CANVAS_TOKEN>` ヘッダ。

### 手順
1. **履修中の科目を取得**
   ```
   GET /api/v1/courses?enrollment_state=active&per_page=100
   ```
   レスポンスの各要素から `id`（科目ID）と `name`（科目名）を使う。

2. **各科目の課題を、自分の提出状況つきで取得**
   ```
   GET /api/v1/courses/:course_id/assignments?include[]=submission&order_by=due_at&per_page=100
   ```
   - `include[]=submission` を付けると、各課題に自分の `submission` オブジェクトが入る。
   - 使うフィールド:
     - 課題: `id`, `name`, `due_at`(ISO8601, null あり), `html_url`
     - `submission`: `workflow_state`（`unsubmitted`/`submitted`/`graded` など）, `missing`(bool), `submitted_at`

3. すべての科目の課題を1つの配列にまとめる。

### 状態（status）の決定ルール
各課題について、次の順で `status` を決める:
- `submission.workflow_state === "graded"` → `"graded"`（採点済み）
- `submission.workflow_state === "submitted"` または `submission.submitted_at` あり → `"submitted"`（提出済み）
- `submission.missing === true`、または（`due_at` が過去 かつ 未提出）→ `"missing"`（期限切れ・未提出）
- それ以外 → `"unsubmitted"`（未提出）

### 注意
- `due_at` が null の課題（締め切りなし）は結果から除外してよい。
- Canvas はページングされる。`per_page=100` で足りることが多いが、`Link` ヘッダに `rel="next"` があれば
  それをたどって全ページ取得すること（将来課題として TODO コメントを残すだけでも可）。
- HTTP クライアントは `fetch`（Node 22 標準）でよい。追加ライブラリは不要。

## 5. エンドポイント仕様

```
GET /api/assignments
```

クエリパラメータ（任意）:
| 名前   | 説明                                                        |
|--------|-------------------------------------------------------------|
| status | `unsubmitted` を指定すると未提出・期限切れのみ返す（任意）  |

**レスポンス（200, JSON）**: 締め切りが近い順（`due_at` 昇順）に並べて返す。

```json
[
  {
    "id": 101,
    "title": "プログラミング基礎レポート",
    "course": "プログラミング基礎",
    "due_at": "2026-07-15T14:59:00Z",
    "status": "unsubmitted",
    "html_url": "https://<canvas>/courses/123/assignments/101"
  }
]
```

**エラー処理**:
- Canvas が 401 を返した（トークン無効・期限切れ）→ このAPIは `502` と
  `{ "error": "Canvasトークンが無効か期限切れです。再発行して .env を更新してください。" }` を返す。
- `CANVAS_TOKEN` / `CANVAS_BASE_URL` が未設定 → `500` と分かりやすいエラーメッセージ。

## 6. 責務分離（既存の方針を踏襲）

- `canvasService.ts`: Canvas との通信・整形ロジック（上記手順4・状態判定）をすべてここに閉じ込める。
- `assignmentController.ts`: クエリ受け取り → service 呼び出し → JSON 返却・エラー整形のみ。
- `routes/assignments.ts`: `GET /api/assignments` を controller に接続。
- `src/index.ts` に新しい route を登録する。

## 7. CORS

既存の `app.use(cors())` があれば、このエンドポイントもそのまま別オリジンのフロントから呼べる。

## 8. 受け入れ条件

`.env` に有効なトークンを入れた状態で:
```bash
npm run dev
curl "http://localhost:3000/api/assignments" | head
curl "http://localhost:3000/api/assignments?status=unsubmitted" | head
```
- 課題が締め切り順（昇順）で返る。
- 各要素に id / title / course / due_at / status / html_url が含まれる。
- レスポンス・サーバーログのどこにもトークン文字列が出ていない。
- トークンを空にすると 500、無効な値にすると 502 が返る。

## 9. 将来課題（今回はやらない・設計メモ）

- **複数ユーザー対応**: 本番で他の学生も使うなら、トークンを `.env` の共有1個ではなく
  「ユーザーごとに暗号化して保存」する必要がある。その場合は OAuth2 認可フロー
  （Developer Key 発行 → 各ユーザーが認可 → refresh token で更新）が正攻法。
  Canvas のアクセストークンは1時間で失効し refresh token で更新する点に注意。
- **キャッシュ**: 毎回 Canvas を叩くと遅い＆レート制限に当たりうるので、数分間 DB or メモリにキャッシュすると良い。
  その際、設計対話 Step3 の `Assignment` テーブルに保存する形にできる。
- **リマインド**: `status` と `due_at` を使って通知を出す機能へ拡張可能。