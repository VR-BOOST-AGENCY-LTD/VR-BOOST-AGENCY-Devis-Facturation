import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/avatar/:userId?v=<version> — logo du compte, réservé aux utilisateurs connectés.
 * L'URL change à chaque nouvelle image (?v=), d'où une mise en cache longue côté navigateur.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { userId } = await ctx.params;
  const a = await db.userAvatar.findUnique({ where: { userId } });
  if (!a) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return new NextResponse(Buffer.from(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
