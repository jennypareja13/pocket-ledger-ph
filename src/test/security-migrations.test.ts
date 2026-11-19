import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationsDir = new URL("../../drizzle/migrations/", import.meta.url);
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const readMigration = (file: string) =>
  readFileSync(new URL(file, migrationsDir), "utf8");

const stripSqlComments = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const statementsFor = (file: string) =>
  stripSqlComments(readMigration(file))
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

describe("database migration security guard", () => {
  it("does not grant privileges to anon or PUBLIC in any migration", () => {
    for (const file of migrationFiles) {
      for (const statement of statementsFor(file)) {
        const grant = statement.match(/^GRANT\b[\s\S]*?\bTO\s+([\s\S]+)$/i);
        if (!grant) continue;
        const grantees = grant[1]!
          .replace(/\bWITH\s+GRANT\s+OPTION\b[\s\S]*$/i, "")
          .split(",")
          .map((role) => role.trim().replace(/^"|"$/g, "").toLowerCase());
        expect(grantees, file).not.toContain("anon");
        expect(grantees, file).not.toContain("public");
      }
    }
  });

  it("does not grant TRUNCATE in any migration", () => {
    for (const file of migrationFiles) {
      for (const statement of statementsFor(file)) {
        expect(statement, file).not.toMatch(/^GRANT\b[\s\S]*?\bTRUNCATE\b/i);
      }
    }
  });

  it("does not drop RLS policies or disable row-level security", () => {
    for (const file of migrationFiles) {
      const sql = stripSqlComments(readMigration(file));
      expect(sql, file).not.toMatch(/\bDROP\s+POLICY\b/i);
      expect(sql, file).not.toMatch(
        /\bALTER\s+TABLE\b[\s\S]*?\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i,
      );
    }
  });

  it("enables RLS in the same migration file for every public table it creates", () => {
    for (const file of migrationFiles) {
      const sql = stripSqlComments(readMigration(file));
      const createdTables = [
        ...sql.matchAll(
          /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_][a-z0-9_]*)/gi,
        ),
      ].map((match) => match[1]?.toLowerCase()).filter(Boolean);

      for (const table of createdTables) {
        const enablesRls = new RegExp(
          String.raw\`\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?public\\.\${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\b\`,
          "i",
        );
        expect(sql, \`\${file} creates public.\${table}\`).toMatch(enablesRls);
      }
    }
  });

  it("documents deferred PR F limits and keeps them out of active PR A migrations", () => {
    const docs = readFileSync(
      new URL("../../docs/security/pr-a-database-hardening.md", import.meta.url),
      "utf8",
    );
    expect(docs).toContain("16 KiB");
    expect(docs).toContain("10,000-row cap");
    expect(docs).toContain("Deferred: PR F");

    for (const file of [
      "0002_restrict_ledger_feedback_grants.sql",
      "0003_restrict_public_default_privileges.sql",
    ]) {
      const sql = stripSqlComments(readMigration(file));
      expect(sql, file).not.toMatch(/pg_column_size\s*\(/i);
      expect(sql, file).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i);
      expect(sql, file).not.toMatch(/CREATE\s+TRIGGER\b/i);
    }
  });
});
