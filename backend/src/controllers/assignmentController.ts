import { Request, Response } from "express";
import { getAssignments, CanvasConfigError, CanvasAuthError } from "../services/canvasService.js";

// GET /api/assignments
export async function listAssignments(req: Request, res: Response) {
  const { status } = req.query;

  try {
    const assignments = await getAssignments(typeof status === "string" ? status : undefined);
    res.json(assignments);
  } catch (err) {
    if (err instanceof CanvasConfigError) {
      return res.status(500).json({ error: err.message });
    }
    if (err instanceof CanvasAuthError) {
      return res.status(502).json({ error: err.message });
    }
    // 予期しないエラーのメッセージには Authorization ヘッダの値がそのまま含まれる場合がある
    // （例: fetch の Headers 実装が不正な値をエラーメッセージに含めて例外を投げるケース）。
    // トークン漏洩を避けるため、詳細メッセージはログにも出力しない。
    console.error("Canvas連携で予期しないエラーが発生しました。");
    return res.status(502).json({ error: "Canvasとの通信に失敗しました。" });
  }
}
