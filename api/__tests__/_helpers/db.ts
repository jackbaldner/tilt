/**
 * Per-test SQLite isolation helper.
 *
 * IMPORTANT: `lib/db.ts` caches the `localDb` instance as a module-level
 * singleton. Setting `process.env.SQLITE_PATH` here is not enough on its own —
 * each test file must call `vi.resetModules()` before re-importing `lib/db.ts`
 * so that the new path is picked up and a fresh DB handle is created.
 */
import { beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

const TEST_DB_DIR = path.join(os.tmpdir(), "tilt-tests");

let testDbPath: string;

beforeEach(() => {
  // Ensure the dedicated temp subdir exists (globalSetup wipes it at run start)
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });

  // UUID + PID makes names unique across parallel workers and retries
  const suffix = `${process.pid}-${crypto.randomUUID()}`;
  testDbPath = path.join(TEST_DB_DIR, `tilt-test-${suffix}.db`);
  process.env.SQLITE_PATH = testDbPath;
  delete process.env.TURSO_DATABASE_URL;
});

afterEach(() => {
  // Remove main DB file and WAL/SHM sidecars created by journal_mode=WAL
  for (const ext of ["", "-wal", "-shm"]) {
    const filePath = `${testDbPath}${ext}`;
    if (testDbPath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});
