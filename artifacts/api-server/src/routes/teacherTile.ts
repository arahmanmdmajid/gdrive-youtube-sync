import { Router } from "express";
import { loadAliases, replaceAliases, listReads, runReads, DEFAULT_RUN_LIMIT, MAX_RUN_LIMIT } from "../lib/teacherReads";
import { parseAliasBody, aliasHash } from "../lib/teacherAliasTable";

const router = Router();

// The alias table: how each teacher shows on the name tile. The real aliases are loaded here and are not
// kept in the repository.
router.get("/teacher-aliases", async (_req, res) => {
  const aliases = await loadAliases();
  res.json({ hash: aliasHash(aliases), aliases });
});

// Replaces the whole table. Body: { "aliases": [ { "teacher": "Ustad X", "strong": [...], "allOf": [...], "weak": [...] } ] }
router.put("/teacher-aliases", async (req, res) => {
  const parsed = parseAliasBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const words = await replaceAliases(parsed.entries);
  res.json({ teachers: parsed.entries.length, words, hash: aliasHash(parsed.entries) });
});

// The stored results of the reads. Only verdicts: no frames and no text exist to show.
router.get("/teacher-reads", async (_req, res) => {
  res.json(await listReads());
});

// Reads up to ?limit recordings now (default 2, at most 10) and returns counts and the teachers found.
router.post("/teacher-reads/run", async (req, res) => {
  const asked = Number(req.query.limit ?? DEFAULT_RUN_LIMIT);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_RUN_LIMIT) : DEFAULT_RUN_LIMIT;
  const summary = await runReads(limit);
  res.status(summary.skipped === "a run is already in progress" ? 409 : 200).json(summary);
});

export default router;
