import { NextResponse } from "next/server";

export async function GET() {
  const hasTursoUrl = Boolean(process.env.TURSO_DATABASE_URL);
  const hasToken = Boolean(process.env.TURSO_AUTH_TOKEN);
  const hasSecret = Boolean(process.env.NEXTAUTH_SECRET);
  
  let libsqlTest = "not tested";
  if (hasTursoUrl) {
    try {
      const { createClient } = await import("@libsql/client");
      const client = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      const result = await client.execute("SELECT 1 as ok");
      libsqlTest = "ok: " + JSON.stringify(result.rows[0]);
    } catch (e: any) {
      libsqlTest = "error: " + e.message;
    }
  }
  
  return NextResponse.json({
    hasTursoUrl,
    hasToken,
    hasSecret,
    urlPrefix: process.env.TURSO_DATABASE_URL?.slice(0, 30) + "...",
    libsqlTest,
  });
}
