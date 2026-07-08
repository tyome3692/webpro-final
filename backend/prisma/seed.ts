import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 教室マスタ（作成順 = roomId 1〜10 に対応）
const classrooms = [
  { name: "101", campus: "日吉", hasPc: false, allowsFood: true, capacity: 120 },
  { name: "203", campus: "日吉", hasPc: true, allowsFood: false, capacity: 40 },
  { name: "J14", campus: "日吉", hasPc: false, allowsFood: false, capacity: 80 },
  { name: "来往舎", campus: "日吉", hasPc: false, allowsFood: true, capacity: 200 },
  { name: "PC-A", campus: "日吉", hasPc: true, allowsFood: false, capacity: 30 },
  { name: "南校舎443", campus: "三田", hasPc: false, allowsFood: false, capacity: 60 },
  { name: "第一校舎121", campus: "三田", hasPc: false, allowsFood: true, capacity: 90 },
  { name: "研究室棟A", campus: "三田", hasPc: true, allowsFood: false, capacity: 24 },
  { name: "14-201", campus: "矢上", hasPc: true, allowsFood: false, capacity: 50 },
  { name: "創想館ラボ", campus: "矢上", hasPc: true, allowsFood: true, capacity: 36 },
];

// スケジュール（埋まっているコマ）。roomId は上の配列の並び順（1始まり）に対応
const schedulesByRoomIndex: { day: number; period: number }[][] = [
  [ { day: 0, period: 1 }, { day: 0, period: 2 }, { day: 2, period: 3 } ], // 101
  [ { day: 0, period: 2 }, { day: 1, period: 4 }, { day: 3, period: 1 } ], // 203
  [ { day: 0, period: 1 }, { day: 4, period: 5 } ], // J14
  [ { day: 1, period: 3 }, { day: 2, period: 3 } ], // 来往舎
  [ { day: 0, period: 2 }, { day: 0, period: 3 }, { day: 2, period: 1 } ], // PC-A
  [ { day: 0, period: 2 }, { day: 3, period: 4 } ], // 南校舎443
  [ { day: 1, period: 1 }, { day: 1, period: 2 } ], // 第一校舎121
  [ { day: 2, period: 5 } ], // 研究室棟A
  [ { day: 0, period: 2 }, { day: 4, period: 3 } ], // 14-201
  [ { day: 3, period: 2 } ], // 創想館ラボ
];

async function main() {
  // 既存データを削除してから投入（何度実行しても同じ状態になるように）
  await prisma.schedule.deleteMany();
  await prisma.classroom.deleteMany();

  for (let i = 0; i < classrooms.length; i++) {
    const room = await prisma.classroom.create({ data: classrooms[i] });
    const schedules = schedulesByRoomIndex[i];
    if (schedules.length > 0) {
      await prisma.schedule.createMany({
        data: schedules.map((s) => ({ roomId: room.id, day: s.day, period: s.period })),
      });
    }
  }

  console.log("シードデータの投入が完了しました。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
