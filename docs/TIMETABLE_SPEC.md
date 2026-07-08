# 時間割（授業タイトル解析）実装仕様書

このファイルは Claude Code に渡す指示書です。Canvas の履修科目タイトルを解析して、週間時間割データを返す
エンドポイント `GET /api/timetable` を追加します（※試験タブの代わりに時間割を出す方針）。

Claude Code には「TIMETABLE_SPEC.md に従って時間割取得機能を追加して」と伝えてください。

---

## 0. 背景（なぜタイトル解析なのか）

大学の「時間割」タブは Canvas の LTI 外部ツールで、Canvas 標準 API では取得できないことが判明した。
一方、履修科目の**タイトルに曜日・時限・教員・キャンパス・教室がすべて規則的に入っている**ため、
`GET /api/v1/courses` で取れる科目タイトルを解析して時間割を組み立てる。

タイトルの書式（実データ）:
```
3-12 春[月2 月3 月4]今井 倫太　情報工学実験第１Ｂ [矢上 12-204]
```
- `3-12` : 科目コード
- `春` : 開講期（春 / 秋 など）
- `[月2 月3 月4]` : 曜日+時限のコマ（空白区切り・複数可）
- `今井 倫太` : 教員名（教員名と科目名の区切りは **全角スペース `　`(U+3000)**）
- `情報工学実験第１Ｂ` : 科目名（内部に半角スペースを含む場合あり）
- `[矢上 12-204]` : 末尾の角括弧 = キャンパス + 教室（教室はカンマ区切りで複数可）

## 1. セキュリティ（既存と同一・必須）

- Canvas トークンは `.env` の `CANVAS_TOKEN` のみ。フロント・レスポンス・ログに出さない。
- 認証は `Authorization: Bearer <CANVAS_TOKEN>` ヘッダ、通信は HTTPS。
- 既存の `canvasService.ts` を再利用する。

## 2. Canvas API

```
GET /api/v1/courses?enrollment_state=active&per_page=100
```
各要素の `id` と `name`（＝上記タイトル）を使う。`html_url` は科目に無いので
`${CANVAS_BASE_URL}/courses/${id}` を組み立てて使う。

## 3. パーサ（この実装を使うこと）

`canvasService.ts` に以下の関数を実装する。書式に合わないタイトル（時間割用でない科目）は `null` を返し、
時間割からは除外する。曜日は 月=0, 火=1, 水=2, 木=3, 金=4, 土=5, 日=6 とする。

```ts
const DAY_MAP: Record<string, number> = { "月":0,"火":1,"水":2,"木":3,"金":4,"土":5,"日":6 };

export function parseCourseTitle(name: string) {
  const m = name.trim().match(
    /^(\S+)\s+(春|秋|通年|集中|その他)?\s*\[([^\]]*)\](.*?)\s*\[([^\]]+)\]\s*$/
  );
  if (!m) return null; // 時間割用の書式でない → 除外
  const [, code, term, slotStr, mid, placeStr] = m;

  // "月2 月3 月4" → [{day:0,period:2}, ...]
  const slots = (slotStr.match(/[月火水木金土日]\d+/g) || []).map(tok => ({
    day: DAY_MAP[tok[0]],
    period: Number(tok.slice(1)),
  }));

  // "今井 倫太　情報工学実験第１Ｂ" を全角スペースで分割
  const idx = mid.indexOf("\u3000");
  const instructor = idx >= 0 ? mid.slice(0, idx).trim() : "";
  const course     = (idx >= 0 ? mid.slice(idx + 1) : mid).trim();

  // "矢上 12-203, 12-204" → campus + rooms[]
  const place = placeStr.trim();
  const sp = place.indexOf(" ");
  const campus    = sp >= 0 ? place.slice(0, sp) : place;
  const roomsPart = sp >= 0 ? place.slice(sp + 1) : "";
  const rooms = roomsPart.split(/[,、]/).map(s => s.trim()).filter(Boolean);

  return { code, term: term ?? null, slots, instructor, course, campus, rooms };
}
```

## 4. エンドポイント仕様

```
GET /api/timetable
```
クエリ（任意）: `term`（例 `?term=春`）を指定するとその開講期のみ返す。

処理: 履修科目を取得 → 各 `name` を `parseCourseTitle` で解析 → `null`（書式外）と
`slots` が空のものは除外 → 配列で返す。

**レスポンス（200, JSON）**:
```json
[
  {
    "id": 123,
    "course": "情報工学実験第１Ｂ",
    "instructor": "今井 倫太",
    "term": "春",
    "campus": "矢上",
    "rooms": ["12-204"],
    "slots": [ {"day":0,"period":2}, {"day":0,"period":3}, {"day":0,"period":4} ],
    "html_url": "https://<canvas>/courses/123"
  }
]
```

エラー処理は既存と同じ（トークン無効→502、未設定→500）。

## 5. パーサの受け入れテスト（この入力→出力になること）

実データから抽出。ユニットテストにそのまま使うこと。

| 入力タイトル | course | instructor | slots(day,period) | campus | rooms |
|---|---|---|---|---|---|
| `3-12 春[月2 月3 月4]今井 倫太　情報工学実験第１Ｂ [矢上 12-204]` | 情報工学実験第１Ｂ | 今井 倫太 | (0,2)(0,3)(0,4) | 矢上 | ["12-204"] |
| `3-22 春[火2]松谷 宏紀　アルゴリズム第２Ａ [矢上 12-203]` | アルゴリズム第２Ａ | 松谷 宏紀 | (1,2) | 矢上 | ["12-203"] |
| `3-34 春[水4]鳴海 紘也　実践のためのＷｅｂプログラミング [矢上 12-203, 12-204]` | 実践のためのＷｅｂプログラミング | 鳴海 紘也 | (2,4) | 矢上 | ["12-203","12-204"] |
| `3-41 春[木1]斎藤 英雄　図形処理Ａ ビジュアルコンピューティングⅠＡ [矢上 11-31]` | 図形処理Ａ ビジュアルコンピューティングⅠＡ | 斎藤 英雄 | (3,1) | 矢上 | ["11-31"] |
| `3-52 春[金2]吉岡 健太郎　コンピュータシミュレーション同実習 数値解析 [矢上 14-B107]` | コンピュータシミュレーション同実習 数値解析 | 吉岡 健太郎 | (4,2) | 矢上 | ["14-B107"] |
| `3-53 春[金3 金4]高田 眞吾　プログラミング第２同演習Ａ [矢上 14-202, 14-B101]` | プログラミング第２同演習Ａ | 高田 眞吾 | (4,3)(4,4) | 矢上 | ["14-202","14-B101"] |

ポイント（テストで守る性質）:
- 科目名に含まれる**半角スペースは保持**する（「図形処理Ａ ビジュアルコンピューティングⅠＡ」を分割しない）。
- 複数コマ・複数教室を正しく配列化する。
- 教員名と科目名の区切りは全角スペースのみで判定する。

## 6. ファイル追加（既存の責務分離に合わせる）

```
backend/src/
├── services/canvasService.ts        # parseCourseTitle と getTimetable を追加
├── controllers/timetableController.ts
└── routes/timetable.ts              # GET /api/timetable
```
`src/index.ts` に route 登録。パース・整形は service に閉じ込め、controller は JSON を返すだけ。

## 7. 受け入れ条件

```bash
npm run dev
curl "http://localhost:3000/api/timetable" | head
curl "http://localhost:3000/api/timetable?term=春" | head
```
- 各要素に id / course / instructor / term / campus / rooms / slots / html_url が含まれる。
- 上記テスト表の6件が期待どおり解析される。
- 書式に合わない履修科目（お知らせ用コースなど）はエラーにならず除外される。
- レスポンス・ログにトークンが出ていない。

## 8. 将来課題（今回はやらない）

- 解析した教室情報を、空き教室機能の `Classroom`/`Schedule` テーブルに流し込めば、
  実際の授業データとして空き教室検索の精度が上がる（設計対話 Step3 との統合）。
- タイトル書式が変わる科目が出たら、テスト表に1行足してからパーサを調整する。