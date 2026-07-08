# 空き教室検索 バックエンド 実装仕様書

このファイルは Claude Code に渡す実装指示書です。プロジェクトのルートに `BACKEND_SPEC.md` として置き、
Claude Code に「BACKEND_SPEC.md に従ってバックエンドを実装して」と伝えてください。

---

## 0. このアプリの目的

大学生が「いま・この曜日・この時限に空いている教室」を、キャンパスや設備（PC・飲食可）で
絞り込んで探せる Web アプリ。まずは **空き教室検索** の1機能をバックエンドとして完成させる。
（課題取得・試験時間割は将来拡張。今回のスコープ外。）

## 1. 技術スタック（この構成で実装すること）

- 言語: TypeScript
- 実行環境: Node.js 22
- Web フレームワーク: Express
- ORM: Prisma
- データベース: SQLite（開発用。あとで PostgreSQL に差し替え可能な書き方にすること）
- 補助: 開発時のホットリロードに `tsx`、CORS 有効化に `cors`

## 2. データ設計（Prisma スキーマ）

設計対話 Step 3 のテーブルに対応する。`prisma/schema.prisma` を次の内容で作成すること。

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// 教室マスタ
model Classroom {
  id         Int        @id @default(autoincrement())
  name       String     // 教室名 例: "101", "南校舎443"
  campus     String     // キャンパス 例: "日吉"
  hasPc      Boolean    @default(false) // PCの有無
  allowsFood Boolean    @default(false) // 飲食可否
  capacity   Int        // 定員（席数）
  schedules  Schedule[] // この教室で行われる授業（1対多）
}

// 授業スケジュール = 「埋まっているコマ」。ここに無い時間帯は空き。
model Schedule {
  id        Int       @id @default(autoincrement())
  roomId    Int       // 外部キー
  room      Classroom @relation(fields: [roomId], references: [id])
  day       Int       // 0=月 1=火 2=水 3=木 4=金
  period    Int       // 時限 1〜6

  @@index([day, period]) // 検索を速くするための索引
}
```

## 3. API 設計（エンドポイント）

設計対話 Step 4 の REST 設計に従う。

### 3-1. 空き教室検索（メイン）

```
GET /api/classrooms/search
```

クエリパラメータ:

| 名前         | 型      | 必須 | 説明                          |
|--------------|---------|------|-------------------------------|
| campus       | string  | 必須 | 例: `日吉`                    |
| day          | number  | 必須 | 0〜4（月〜金）                |
| period       | number  | 必須 | 1〜6                          |
| has_pc       | boolean | 任意 | `true` のとき PC あり教室のみ |
| allows_food  | boolean | 任意 | `true` のとき飲食可教室のみ   |

**ロジック（設計対話 Step 1 のとおり）:**
1. 指定した `day` と `period` に授業が入っている（= Schedule に該当行がある）教室を「埋まっている」とする。
2. 全教室のうち、`campus` が一致し、かつ「埋まっていない」教室を候補にする。
3. `has_pc=true` なら `hasPc=true` の教室だけ、`allows_food=true` なら `allowsFood=true` の教室だけに絞る。
4. 結果を返す。

**レスポンス（200, JSON）:** フロントエンドが期待する形。キー名はスネークケースで返すこと。

```json
[
  {
    "id": 6,
    "name": "南校舎443",
    "campus": "三田",
    "has_pc": false,
    "allows_food": false,
    "capacity": 60
  }
]
```

**バリデーション:** `campus`/`day`/`period` が無い、または `day` が0〜4外・`period` が1〜6外のときは
`400` と `{ "error": "説明メッセージ" }` を返すこと。

### 3-2. 全教室一覧（動作確認・管理用）

```
GET /api/classrooms
```

全教室を JSON 配列で返す（上と同じキー形式）。

## 4. フォルダ構成（設計対話 Step 5 の MVC 準拠）

```
backend/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts              # サンプルデータ投入
├── src/
│   ├── index.ts             # アプリ起動・ミドルウェア・ルート登録
│   ├── routes/
│   │   └── classrooms.ts    # ルーティング
│   ├── controllers/
│   │   └── classroomController.ts   # リクエスト受付・レスポンス整形（司令塔）
│   ├── services/
│   │   └── classroomService.ts      # 空き教室を求める中心ロジック
│   └── lib/
│       └── prisma.ts        # PrismaClient を1つだけ生成して共有
├── .env                     # DATABASE_URL="file:./dev.db"
├── package.json
└── tsconfig.json
```

責務分離:
- **controller**: クエリの取り出しと検証、service の呼び出し、JSON 整形のみ。DB を直接触らない。
- **service**: Prisma を使って教室・スケジュールを取得し、空き教室を計算する中心ロジック。
- **routes**: URL と controller の対応付けのみ。

## 5. シードデータ（`prisma/seed.ts`）

動作確認用に、以下のサンプルを投入すること。フロントエンドの最小版と同じデータ。

教室（Classroom）:

| name        | campus | hasPc | allowsFood | capacity |
|-------------|--------|-------|-----------|----------|
| 101         | 日吉   | false | true      | 120      |
| 203         | 日吉   | true  | false     | 40       |
| J14         | 日吉   | false | false     | 80       |
| 来往舎      | 日吉   | false | true      | 200      |
| PC-A        | 日吉   | true  | false     | 30       |
| 南校舎443   | 三田   | false | false     | 60       |
| 第一校舎121 | 三田   | false | true      | 90       |
| 研究室棟A   | 三田   | true  | false     | 24       |
| 14-201      | 矢上   | true  | false     | 50       |
| 創想館ラボ  | 矢上   | true  | true      | 36       |

スケジュール（Schedule, `roomId` は上の教室の作成順=1始まりに対応）:

```
room=101(1):  月1, 月2, 水3
room=203(2):  月2, 火4, 木1
room=J14(3):  月1, 金5
room=来往舎(4): 火3, 水3
room=PC-A(5): 月2, 月3, 水1
room=南校舎443(6): 月2, 木4
room=第一校舎121(7): 火1, 火2
room=研究室棟A(8): 水5
room=14-201(9): 月2, 金3
room=創想館ラボ(10): 木2
```

## 6. package.json に用意するスクリプト

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  }
}
```

## 7. 完成の受け入れ条件（これが通れば完成）

セットアップ手順:
```bash
npm install
npm run db:push      # スキーマをDBに反映
npm run db:seed      # サンプルデータ投入
npm run dev          # http://localhost:3000 で起動
```

動作確認（サーバ起動後、別ターミナルで）:
```bash
# 三田・月曜(0)・2限 の空き教室 → 南校舎443 は月2が埋まっているので出ない。
#   第一校舎121(火のみ)・研究室棟A(水のみ) は空き → この2室が返る想定。
curl "http://localhost:3000/api/classrooms/search?campus=三田&day=0&period=2"

# 日吉・月曜(0)・2限 かつ PCあり → PC-Aは月2埋まり。203も月2埋まり → 空きPC室は0件想定。
curl "http://localhost:3000/api/classrooms/search?campus=日吉&day=0&period=2&has_pc=true"

# 全教室一覧
curl "http://localhost:3000/api/classrooms"
```

条件を満たすこと:
- 上記 curl が期待どおりの結果を返す。
- 不正なパラメータで 400 が返る。
- CORS が有効で、別ポートのフロントエンドから叩ける。
- controller / service / routes の責務が分離されている。

## 8. 実装後にやってほしいこと

- README.md にセットアップと起動手順を書く。
- 主要な service ロジックに、日本語コメントで「何をしているか」を書く。
- `.gitignore` に `node_modules`、`.env`、`dev.db` を入れる。

---

## 補足: 将来の拡張（今回はやらない。設計として頭出しだけ）

- `User` / `Assignment` テーブルを追加し、KLMS 由来の課題管理を足す
  （※ KLMS 連携は大学の公式 API または iCal が使えるか確認してから。スクレイピングは規約リスクがあるため最後の手段）。
- 試験時間割は Schedule と同じ構造で `ExamSchedule` を追加して実装可能。
- SQLite → PostgreSQL 移行は `datasource db` の provider 変更と接続文字列の差し替えで対応。