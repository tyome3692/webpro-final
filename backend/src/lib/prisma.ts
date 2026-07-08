import { PrismaClient } from "@prisma/client";

// アプリ全体で PrismaClient のインスタンスを1つだけ共有する
export const prisma = new PrismaClient();
