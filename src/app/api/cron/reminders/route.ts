import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runAutoReminders } from "@/server/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reminders — relances automatiques, appelée une fois par jour par la tâche planifiée.
 * Protégée par CRON_SECRET (en-tête Authorization: Bearer …), comparaison à temps constant.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok =
    !!secret && secret.length >= 24 && given.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    return NextResponse.json(await runAutoReminders());
  } catch (e) {
    console.error("[cron/reminders]", e);
    return NextResponse.json({ error: "Échec des relances" }, { status: 500 });
  }
}
