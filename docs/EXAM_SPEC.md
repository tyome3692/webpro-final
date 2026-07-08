# 試験時間割（Canvas API連携）実装仕様書

このファイルは Claude Code に渡す追加実装の指示書です。既存のバックエンドに、Canvas から試験（＝小テスト）を
取得して返すエンドポイント `GET /api/exams` を追加します。

Claude Code には「EXAMS_SPEC.md に従って試験取得機能を追加して」と伝えてください。

---

## 0. 前提と、正直な注意

Canvas には「試験」という専用のデータ型は存在しない。多くの場合、試験は次のいずれかで登録されている:

- **小テスト（Quizzes）** … 期末試験・中間試験をオンラインquizとして作るケース。→ **今回はこれを主な取得元にする。**
- カレンダー予定（Calendar Events）… 対面試験の日時・教室を予定として登録するケース（任意で追加取得）。

つまり `/api/exams` は「試験っぽいもの」を集めるエンドポイントであり、**あなたの大学が試験をどう登録しているかで
取得元の調整が必要**になる。まずは Quizzes ベースで実装し、うまく拾えなければ取得ルールを変える方針とする。

## 1. セキュリティ（ASSIGNMENTS_SPEC と同一。必ず守る）

- Canvas トークンは `.env` の `CANVAS_TOKEN` のみ。フロント・レスポンス・ログに出さない。
- 認証は `Authorization: Bearer <CANVAS_TOKEN>` ヘッダ。通信は HTTPS。
- 既存の `canvasService.ts` を再利用し、トークン読み出し口を一本化する。

## 2. Canvas API の使い方

ベースURLは `CANVAS_BASE_URL`。

1. **履修中の科目を取得**（課題機能と同じ）
   ```
   GET /api/v1/courses?enrollment_state=active&per_page=100
   ```
2. **各科目の小テストを取得**
   ```
   GET /api/v1/courses/:course_id/quizzes?per_page=100
   ```
   Quiz オブジェクトから使うフィールド:
   - `id`, `title`, `html_url`
   - `quiz_type`（`"assignment"`=採点対象quiz / `"practice_quiz"` / `"graded_survey"` / `"survey"`）
   - `due_at`（締切）, `lock_at`（受付終了）, `time_limit`（制限時間・分, null あり）

### 「試験」とみなすルール（初期値・後で調整可）
- `quiz_type === "assignment"`（採点対象の小テスト）だけを試験として扱う。
- 日時 `date` は `due_at`。`due_at` が null なら `lock_at` を使う。両方 null なら除外。

## 3. エンドポイント仕様

```
GET /api/exams
```

**レスポンス（200, JSON）**: `date` 昇順で返す。

```json
[
  {
    "id": 555,
    "title": "期末試験",
    "course": "統計学",
    "date": "2026-07-28T13:00:00Z",
    "location": null,
    "time_limit": 90,
    "html_url": "https://<canvas>/courses/123/quizzes/555"
  }
]
```

- `location` は Quizzes からは取れないため基本 `null`（下の「6」でカレンダー予定を足すと入る）。
- `time_limit` は分。無ければ `null`。

**エラー処理**（課題機能と同じ）:
- Canvas が 401 → `502` と `{ "error": "Canvasトークンが無効か期限切れです。" }`
- `CANVAS_TOKEN` / `CANVAS_BASE_URL` 未設定 → `500`

## 4. ファイル追加（既存の責務分離に合わせる）

```
backend/src/
├── services/canvasService.ts        # 既存に getExams() を追加
├── controllers/examController.ts    # 新規
└── routes/exams.ts                  # 新規（GET /api/exams を接続）
```
`src/index.ts` に route を登録する。取得・整形ロジックは `canvasService.ts` に閉じ込め、controller は JSON を返すだけ。

## 5. 受け入れ条件

```bash
npm run dev
curl "http://localhost:3000/api/exams" | head
```
- 試験が `date` 昇順で返る。
- 各要素に id / title / course / date / location / time_limit / html_url が含まれる。
- レスポンス・ログにトークンが出ていない。
- 該当する小テストが無い科目でもエラーにならず、空配列を含めて正しくまとまる。

## 6. 任意拡張（対面試験の日時・教室も拾いたい場合）

対面試験がカレンダー予定として登録されているなら、次も取得してマージする:
```
GET /api/v1/calendar_events?type=event&start_date=2026-01-01&end_date=2026-12-31&per_page=100&context_codes[]=course_<id>
```
- イベントから `title`, `start_at`（→date）, `location_name`（→location）, `html_url` を拾う。
- タイトルに「試験」「期末」「中間」「exam」などを含むものだけに絞ると精度が上がる。
- Quizzes 由来と `date` 昇順でまとめて返す。

## 7. 将来課題（今回はやらない）

- 取得結果を DB（設計対話 Step3 の考え方で `Exam` テーブル）にキャッシュして高速化。
- 課題機能と同じく、複数ユーザー対応時は各自トークンの管理（OAuth2）が必要。