import { Request, Response } from "express";
import { getTimetable, CanvasConfigError, CanvasAuthError } from "../services/canvasService.js";

// GET /api/timetable
export async function listTimetable(req: Request, res: Response) {
  const { term } = req.query;

  try {
    const timetable = await getTimetable(typeof term === "string" ? term : undefined);
    res.json(timetable);
  } catch (err) {
    if (err instanceof CanvasConfigError) {
      return res.status(500).json({ error: err.message });
    }
    if (err instanceof CanvasAuthError) {
      return res.status(502).json({ error: err.message });
    }
    // 予期しないエラーのメッセージには Authorization ヘッダの値がそのまま含まれる場合がある。
    // トークン漏洩を避けるため、詳細メッセージはログにも出力しない。
    console.error("Canvas連携で予期しないエラーが発生しました。");
    return res.status(502).json({ error: "Canvasとの通信に失敗しました。" });
  }
}
