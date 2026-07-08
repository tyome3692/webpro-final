# 空き教室検索・課題確認バックエンド

大学生が「いま・この曜日・この時限に空いている教室」をキャンパスや設備で絞り込んで探し、
あわせて Canvas(KLMS) の課題を締め切り順に確認できる API サーバー。

## 技術スタック

- TypeScript / Node.js 22
- Express
- Prisma (SQLite)

## セットアップ

```bash
npm install
npm run db:push      # スキーマをDBに反映
npm run db:seed       # サンプルデータ投入
npm run dev           # http://localhost:3000 で起動
```

`.env` の `DATABASE_URL` を変更すれば、将来 PostgreSQL 等に差し替え可能です。

### 課題取得機能（Canvas API連携）を使う場合

`.env` に以下を追加してください（**絶対にコミットしない。`.gitignore` 済み**）。

```
CANVAS_BASE_URL="https://<自分の大学のCanvasドメイン>"   # 末尾スラッシュなし推奨
CANVAS_TOKEN="<Canvasのユーザー設定で発行したアクセストークン>"
```

トークンは Canvas にログイン →「アカウント > 設定 > 承認済み統合 > 新しいアクセストークンを作成」で発行します。
トークンは Canvas のパスワードと同等の権限を持つため、フロントエンド・レスポンス・ログには絶対に出力しません
（`Authorization` ヘッダでのみ Canvas に送信）。

## 動作確認

サーバー起動後、別ターミナルで以下を実行します。
Web ブラウザやフロントエンドの `fetch` は日本語を自動でパーセントエンコードしますが、
`curl` に直接日本語を渡すとシェルがそのまま生バイトを送ってしまい、
HTTP のリクエストラインとして不正になるため `--data-urlencode` を使ってください。

```bash
# 三田・月曜(0)・2限 の空き教室
curl "http://localhost:3000/api/classrooms/search" -G \
  --data-urlencode "campus=三田" --data-urlencode "day=0" --data-urlencode "period=2"

# 日吉・月曜(0)・2限 かつ PCあり
curl "http://localhost:3000/api/classrooms/search" -G \
  --data-urlencode "campus=日吉" --data-urlencode "day=0" --data-urlencode "period=2" \
  --data-urlencode "has_pc=true"

# 全教室一覧
curl "http://localhost:3000/api/classrooms"

# 課題一覧（締め切り順）。CANVAS_BASE_URL / CANVAS_TOKEN の設定が必要
curl "http://localhost:3000/api/assignments"

# 未提出・期限切れのみ
curl "http://localhost:3000/api/assignments?status=unsubmitted"

# 試験一覧（日付順）。小テスト(Quizzes)とカレンダー予定から収集
curl "http://localhost:3000/api/exams"

# 時間割（履修科目タイトルを解析）
curl "http://localhost:3000/api/timetable"
curl "http://localhost:3000/api/timetable?term=春"
```

### パーサのユニットテスト

`parseCourseTitle`（時間割タイトル解析）は Node 標準の `node:test` でテストしています。

```bash
npm test
```

## フォルダ構成

```
backend/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── index.ts
│   ├── routes/
│   │   ├── classrooms.ts
│   │   ├── assignments.ts
│   │   ├── exams.ts
│   │   └── timetable.ts
│   ├── controllers/
│   │   ├── classroomController.ts
│   │   ├── assignmentController.ts
│   │   ├── examController.ts
│   │   └── timetableController.ts
│   ├── services/
│   │   ├── classroomService.ts
│   │   ├── canvasService.ts
│   │   └── canvasService.test.ts
│   └── lib/prisma.ts
├── .env
├── package.json
└── tsconfig.json
```

- **routes**: URL と controller の対応付けのみ。
- **controller**: クエリの取り出しと検証、service の呼び出し、レスポンスの JSON 整形。
- **service**: Prisma / Canvas API を使ってデータを取得・整形する中心ロジック。

## 課題取得のエラー処理

- `CANVAS_BASE_URL` / `CANVAS_TOKEN` が未設定 → `500`
- Canvas がトークン無効/期限切れ(401)を返した → `502`（`{"error": "Canvasトークンが無効か期限切れです。..."}`）
- それ以外の通信エラー → `502`（詳細メッセージはトークン漏洩防止のためログに出さない）
