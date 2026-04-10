// Usage: node scripts/set-password.mjs <email> <newpassword>
import { hash } from "bcryptjs";
import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, "../prisma/dev.db"));

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/set-password.mjs <email> <password>");
  process.exit(1);
}

const user = db.prepare("SELECT id, email FROM User WHERE email = ?").get(email.toLowerCase());
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const passwordHash = await hash(password, 10);
db.prepare("UPDATE User SET password_hash = ?, updatedAt = ? WHERE id = ?")
  .run(passwordHash, new Date().toISOString(), user.id);

console.log(`✓ Password set for ${user.email}`);
