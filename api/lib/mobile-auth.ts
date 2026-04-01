import { NextRequest, NextResponse } from "next/server";
import { verify } from "jsonwebtoken";
import { one } from "./db";

const JWT_SECRET = process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  chips: number;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  chips: number;
}

export async function requireAuth(req: NextRequest): Promise<AuthUser | NextResponse> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const payload = verify(token, JWT_SECRET) as { sub: string };

    const user = one<UserRow>(
      "SELECT id, email, name, image, chips FROM User WHERE id = ?",
      [payload.sub]
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return user as AuthUser;
  } catch (error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export function isAuthError(result: AuthUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
