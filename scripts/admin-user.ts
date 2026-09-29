/**
 * Create an admin account or reset its password.
 *
 *   npm run admin:user -- --user admin                   # random password, printed once
 *   npm run admin:user -- --user admin --password "…"    # choose the password
 *   npm run admin:user -- --list                         # show existing admin usernames
 *   npm run admin:user -- --delete --user someone        # remove an admin
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { STORE_SCHEMA } from "../src/lib/store-schema";
import { generatePassword, hashPassword, passwordProblem } from "../src/lib/password";

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "store.db"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");
db.exec(STORE_SCHEMA);

if (argv.includes("--list")) {
  const rows = db.prepare("SELECT username, created_at, last_login_at FROM admin_users ORDER BY id").all();
  console.table(rows);
  process.exit(0);
}

const username = (arg("user") ?? "").trim();
if (!/^[a-zA-Z0-9._@-]{3,40}$/.test(username)) {
  console.error('Give a username with --user (3–40 letters, digits, . _ @ -). Example: npm run admin:user -- --user admin');
  process.exit(1);
}

if (argv.includes("--delete")) {
  const r = db.prepare("DELETE FROM admin_users WHERE username = ?").run(username);
  console.log(r.changes ? `Deleted admin "${username}".` : `No admin called "${username}".`);
  process.exit(0);
}

const given = arg("password");
if (given) {
  const problem = passwordProblem(given);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
}
const password = given ?? generatePassword();
const hash = hashPassword(password);
const now = new Date().toISOString();
const existing = db.prepare("SELECT id FROM admin_users WHERE username = ?").get(username) as { id: number } | undefined;

if (existing) {
  db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(hash, existing.id);
  db.prepare("DELETE FROM admin_sessions WHERE user_id = ?").run(existing.id);
  db.prepare("DELETE FROM login_attempts WHERE key = ? OR key LIKE ?").run(`user:${username.toLowerCase()}`, `${username.toLowerCase()}|%`);
  console.log(`Password for "${username}" was reset, sign-in locks cleared, all their sessions signed out.`);
} else {
  db.prepare("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)").run(username, hash, now);
  console.log(`Admin "${username}" created.`);
}
if (!given) {
  console.log(`\n  Username: ${username}\n  Password: ${password}\n\nStore it somewhere safe — it is not saved in plain text anywhere.`);
}
console.log("Sign in at /admin");
