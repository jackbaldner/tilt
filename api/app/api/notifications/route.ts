import { NextRequest, NextResponse } from "next/server";
import { all, run, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const notifications = all<any>(
    "SELECT * FROM Notification WHERE userId = ? ORDER BY createdAt DESC LIMIT 50",
    [auth.id]
  );

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  return NextResponse.json({
    notifications: notifications.map((n: any) => ({ ...n, data: JSON.parse(n.data ?? "{}") })),
    unreadCount,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { ids, all: markAll } = await req.json();
  const timestamp = now();

  if (markAll) {
    run("UPDATE Notification SET read = 1 WHERE userId = ?", [auth.id]);
  } else if (ids?.length) {
    for (const id of ids) {
      run("UPDATE Notification SET read = 1 WHERE id = ? AND userId = ?", [id, auth.id]);
    }
  }

  return NextResponse.json({ success: true });
}
