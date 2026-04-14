import { beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let testDbPath: string;

beforeEach(() => {
  // Each test gets its own temp file-based SQLite DB
  testDbPath = path.join(os.tmpdir(), `tilt-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  process.env.SQLITE_PATH = testDbPath;
  delete process.env.TURSO_DATABASE_URL;
});

afterEach(() => {
  if (testDbPath && fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
