// Recovery tool: set a new password for the student portal's admin account.
// Run from artifacts/student-api — see "Student portal admin sign-in" in docs/operations.md.
//
// The password is read from environment variables, never from a command-line argument, so it
// is not echoed or kept in shell history. It is hashed exactly as the portal does (bcryptjs,
// cost 10) and only the single admin row is touched. Needs DATABASE_URL (via --env-file=../../.env),
// so only someone with access to this machine's .env can use it, which is the safeguard.
import bcrypt from 'bcryptjs';
import { createRequire } from 'node:module';

// pg is a dependency of lib/db, not of this package, so load it from there.
const pg = createRequire(new URL('../../lib/db/package.json', import.meta.url))('pg');

const pw = process.env.NEW_ADMIN_PASSWORD ?? '';
if (pw.length < 8 || pw === 'CHANGE-ME-FIRST') {
  console.error('Refusing to run: set NEW_ADMIN_PASSWORD to your own password (at least 8 characters) first.');
  process.exit(1);
}
// A hidden prompt cannot show a typo, and a typo "verifies" against itself, so require a second entry.
if (pw !== (process.env.NEW_ADMIN_PASSWORD_CONFIRM ?? '')) {
  console.error('The two password entries do not match. Nothing changed. Type the same password both times.');
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const admins = await c.query(`SELECT id, username FROM users WHERE role = 'admin'`);
if (admins.rowCount !== 1) {
  console.error(`Expected exactly one admin account, found ${admins.rowCount}. Nothing changed.`);
  await c.end();
  process.exit(1);
}
const hash = await bcrypt.hash(pw, 10);
await c.query(`UPDATE users SET password_hash = $1 WHERE id = $2 AND role = 'admin'`, [hash, admins.rows[0].id]);
const row = (await c.query(`SELECT password_hash FROM users WHERE id = $1`, [admins.rows[0].id])).rows[0];
console.log(`Password updated for "${admins.rows[0].username}". New password verifies:`, await bcrypt.compare(pw, row.password_hash));
await c.end();
