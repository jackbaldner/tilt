import { cookies } from "next/headers";
import { verify } from "jsonwebtoken";
import { one } from "./db";

const JWT_SECRET =
  process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";
export const COOKIE_NAME = "tilt_token";

export interface WebUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  chips: number;
}

/** Use in Server Components and layouts to get the current session user. */
export async function getSessionUser(): Promise<WebUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verify(token, JWT_SECRET) as { sub: string };
    const user = await one<WebUser>(
      "SELECT id, email, name, image, chips FROM User WHERE id = ?",
      [payload.sub]
    );
    return user;
  } catch {
    return null;
  }
}

/** Set the session cookie on a NextResponse. */
export function setSessionCookie(res: import("next/server").NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: false, // needs to be readable by JS for Bearer auth on client
    sameSite: "lax",
    path: "/",
    maxAge: 90 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
}
