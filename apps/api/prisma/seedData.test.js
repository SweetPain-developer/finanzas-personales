import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEMO_USER,
  accounts,
  categories,
  commitments,
  commitmentTemplates,
  goals,
  transactions,
  withDemoOwnership,
} from "./seed-data.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const seedScript = readFileSync(join(currentDir, "seed.js"), "utf8");

describe("demo seed ownership", () => {
  it("defines a deterministic demo user for closed-product seed data", () => {
    expect(DEMO_USER).toEqual({
      id: "user-demo-initial",
      email: "demo@finanzas-personales.local",
      passwordHash: "demo-seed-password-hash-placeholder",
      displayName: "Usuario demo",
    });
  });

  it("attaches the demo userId to every owned demo record", () => {
    const ownedRecords = [
      ...withDemoOwnership(accounts),
      ...withDemoOwnership(categories),
      ...withDemoOwnership(commitmentTemplates),
      ...withDemoOwnership(commitments),
      ...withDemoOwnership(goals),
      ...withDemoOwnership(transactions),
    ];

    expect(ownedRecords).not.toHaveLength(0);
    expect(ownedRecords.every((record) => record.userId === DEMO_USER.id)).toBe(true);
  });

  it("keeps all category names unique inside the demo user scope", () => {
    const scopedNames = withDemoOwnership(categories).map((category) => `${category.userId}:${category.nombre}`);

    expect(new Set(scopedNames).size).toBe(scopedNames.length);
  });

  it("limits destructive seed cleanup to demo-owned records", () => {
    expect(seedScript).toMatch(/const demoOwner = \{ userId: DEMO_USER\.id \}/);
    expect(seedScript).not.toMatch(/deleteMany\(\s*\)/);

    for (const model of ["transaction", "goal", "commitment", "commitmentTemplate", "category", "account"]) {
      expect(seedScript).toContain(`prisma.${model}.deleteMany({ where: demoOwner })`);
    }
  });

  it("resolves the demo user before cleanup and writes only demo-owned seed data", () => {
    expect(seedScript.indexOf("prisma.user.upsert")).toBeLessThan(seedScript.indexOf("deleteMany"));

    for (const records of ["accounts", "categories", "goals", "commitmentTemplates", "commitments", "transactions"]) {
      expect(seedScript).toContain(`createMany({ data: withDemoOwnership(${records}) })`);
    }
  });
});
