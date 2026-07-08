import { prisma } from "../lib/prisma.js";

export type SearchParams = {
  campus: string;
  day: number;
  period: number;
  hasPc?: boolean;
  allowsFood?: boolean;
};

// 全教室を取得する
export async function getAllClassrooms() {
  return prisma.classroom.findMany();
}

// 指定した campus / day / period の条件で「空いている」教室を検索する
export async function searchAvailableClassrooms(params: SearchParams) {
  const { campus, day, period, hasPc, allowsFood } = params;

  // 指定した day・period に授業が入っている（=埋まっている）教室の roomId 一覧を取得
  const busySchedules = await prisma.schedule.findMany({
    where: { day, period },
    select: { roomId: true },
  });
  const busyRoomIds = busySchedules.map((s) => s.roomId);

  // campus が一致し、かつ埋まっている教室を除いたものを候補にする
  return prisma.classroom.findMany({
    where: {
      campus,
      id: { notIn: busyRoomIds },
      ...(hasPc !== undefined ? { hasPc } : {}),
      ...(allowsFood !== undefined ? { allowsFood } : {}),
    },
  });
}
