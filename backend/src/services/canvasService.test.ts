import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCourseTitle } from "./canvasService.js";

// TIMETABLE_SPEC.md 5. パーサの受け入れテスト
test("parseCourseTitle: 複数コマ・単一教室", () => {
  const result = parseCourseTitle(
    "3-12 春[月2 月3 月4]今井 倫太　情報工学実験第１Ｂ [矢上 12-204]"
  );
  assert.deepEqual(result, {
    code: "3-12",
    term: "春",
    slots: [
      { day: 0, period: 2 },
      { day: 0, period: 3 },
      { day: 0, period: 4 },
    ],
    instructor: "今井 倫太",
    course: "情報工学実験第１Ｂ",
    campus: "矢上",
    rooms: ["12-204"],
  });
});

test("parseCourseTitle: 単一コマ", () => {
  const result = parseCourseTitle("3-22 春[火2]松谷 宏紀　アルゴリズム第２Ａ [矢上 12-203]");
  assert.deepEqual(result, {
    code: "3-22",
    term: "春",
    slots: [{ day: 1, period: 2 }],
    instructor: "松谷 宏紀",
    course: "アルゴリズム第２Ａ",
    campus: "矢上",
    rooms: ["12-203"],
  });
});

test("parseCourseTitle: 複数教室", () => {
  const result = parseCourseTitle(
    "3-34 春[水4]鳴海 紘也　実践のためのＷｅｂプログラミング [矢上 12-203, 12-204]"
  );
  assert.deepEqual(result, {
    code: "3-34",
    term: "春",
    slots: [{ day: 2, period: 4 }],
    instructor: "鳴海 紘也",
    course: "実践のためのＷｅｂプログラミング",
    campus: "矢上",
    rooms: ["12-203", "12-204"],
  });
});

test("parseCourseTitle: 科目名内の半角スペースを保持する", () => {
  const result = parseCourseTitle(
    "3-41 春[木1]斎藤 英雄　図形処理Ａ ビジュアルコンピューティングⅠＡ [矢上 11-31]"
  );
  assert.deepEqual(result, {
    code: "3-41",
    term: "春",
    slots: [{ day: 3, period: 1 }],
    instructor: "斎藤 英雄",
    course: "図形処理Ａ ビジュアルコンピューティングⅠＡ",
    campus: "矢上",
    rooms: ["11-31"],
  });
});

test("parseCourseTitle: 科目名内の半角スペース(別パターン)", () => {
  const result = parseCourseTitle(
    "3-52 春[金2]吉岡 健太郎　コンピュータシミュレーション同実習 数値解析 [矢上 14-B107]"
  );
  assert.deepEqual(result, {
    code: "3-52",
    term: "春",
    slots: [{ day: 4, period: 2 }],
    instructor: "吉岡 健太郎",
    course: "コンピュータシミュレーション同実習 数値解析",
    campus: "矢上",
    rooms: ["14-B107"],
  });
});

test("parseCourseTitle: 複数コマ・複数教室", () => {
  const result = parseCourseTitle(
    "3-53 春[金3 金4]高田 眞吾　プログラミング第２同演習Ａ [矢上 14-202, 14-B101]"
  );
  assert.deepEqual(result, {
    code: "3-53",
    term: "春",
    slots: [
      { day: 4, period: 3 },
      { day: 4, period: 4 },
    ],
    instructor: "高田 眞吾",
    course: "プログラミング第２同演習Ａ",
    campus: "矢上",
    rooms: ["14-202", "14-B101"],
  });
});

test("parseCourseTitle: 書式に合わないタイトルは null を返す", () => {
  assert.equal(parseCourseTitle("お知らせ"), null);
  assert.equal(parseCourseTitle("2026年度 履修案内"), null);
});
