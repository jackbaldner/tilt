import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const TEST_DB_DIR = path.join(os.tmpdir(), "tilt-tests");

export default function globalSetup() {
  // Wipe any leftover temp DBs from previous runs (aborted, crashed, etc.)
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
}
