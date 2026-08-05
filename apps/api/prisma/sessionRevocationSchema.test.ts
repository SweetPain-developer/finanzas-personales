import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(currentDir, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(currentDir, "migrations/20260801100000_session_revocation/migration.sql"),
  "utf8",
);

describe("session revocation schema", () => {
  it("stores a per-user session version with a safe default", () => {
    expect(schema).toMatch(/sessionVersion\s+Int\s+@default\(0\)/);
    expect(migration).toContain('ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0');
    expect(migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
  });
});
