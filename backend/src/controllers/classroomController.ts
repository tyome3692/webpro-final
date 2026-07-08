import { Request, Response } from "express";
import * as classroomService from "../services/classroomService.js";

// Prisma のモデル（camelCase）をフロントエンド向けの snake_case な形に整形する
function toResponseShape(room: {
  id: number;
  name: string;
  campus: string;
  hasPc: boolean;
  allowsFood: boolean;
  capacity: number;
}) {
  return {
    id: room.id,
    name: room.name,
    campus: room.campus,
    has_pc: room.hasPc,
    allows_food: room.allowsFood,
    capacity: room.capacity,
  };
}

// GET /api/classrooms
export async function listClassrooms(_req: Request, res: Response) {
  const rooms = await classroomService.getAllClassrooms();
  res.json(rooms.map(toResponseShape));
}

// GET /api/classrooms/search
export async function searchClassrooms(req: Request, res: Response) {
  const { campus, day, period, has_pc, allows_food } = req.query;

  if (typeof campus !== "string" || campus.length === 0) {
    return res.status(400).json({ error: "campus は必須です" });
  }
  if (typeof day !== "string" || day.length === 0) {
    return res.status(400).json({ error: "day は必須です" });
  }
  if (typeof period !== "string" || period.length === 0) {
    return res.status(400).json({ error: "period は必須です" });
  }

  const dayNum = Number(day);
  const periodNum = Number(period);

  if (!Number.isInteger(dayNum) || dayNum < 0 || dayNum > 4) {
    return res.status(400).json({ error: "day は0〜4の整数で指定してください" });
  }
  if (!Number.isInteger(periodNum) || periodNum < 1 || periodNum > 6) {
    return res.status(400).json({ error: "period は1〜6の整数で指定してください" });
  }

  const hasPc = has_pc === undefined ? undefined : has_pc === "true";
  const allowsFood = allows_food === undefined ? undefined : allows_food === "true";

  const rooms = await classroomService.searchAvailableClassrooms({
    campus,
    day: dayNum,
    period: periodNum,
    hasPc,
    allowsFood,
  });

  res.json(rooms.map(toResponseShape));
}
