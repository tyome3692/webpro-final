import { Request, Response } from "express";
import { getExams, CanvasConfigError, CanvasAuthError } from "../services/canvasService.js";

// GET /api/exams
export async function listExams(_req: Request, res: Response) {
  try {
    const exams = await getExams();
    res.json(exams);
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
