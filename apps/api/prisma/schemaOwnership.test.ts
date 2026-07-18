import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(currentDir, "schema.prisma"), "utf8");

function modelBlock(modelName: string) {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) {
    throw new Error(`Model ${modelName} not found.`);
  }

  return match[1];
}

describe("Prisma ownership schema", () => {
  it("defines a login-ready User model with reverse ownership relations", () => {
    const user = modelBlock("User");

    expect(user).toMatch(/id\s+String\s+@id @default\(cuid\(\)\)/);
    expect(user).toMatch(/email\s+String\s+@unique/);
    expect(user).toMatch(/passwordHash\s+String/);
    expect(user).toMatch(/displayName\s+String\?/);
    expect(user).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(user).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);

    for (const relation of ["accounts", "categories", "transactions", "commitmentTemplates", "commitments", "goals"]) {
      expect(user).toContain(relation);
    }
  });

  it.each(["Account", "Category", "Transaction", "CommitmentTemplate", "Commitment", "Goal"])(
    "requires %s ownership through userId and owner relation",
    (modelName) => {
      const block = modelBlock(modelName);

      expect(block).toContain("userId");
      expect(block).toContain("user");
      expect(block).toMatch(/@relation\(fields: \[userId\], references: \[id\], onDelete: Restrict, onUpdate: Cascade\)/);
    },
  );

  it("scopes functional uniqueness by user while preserving generated commitment duplicate protection", () => {
    expect(modelBlock("Category")).toContain("@@unique([userId, nombre])");
    expect(modelBlock("Commitment")).toContain("@@unique([templateId, anio, mes])");
  });
});
