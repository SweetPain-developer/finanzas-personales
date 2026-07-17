import { describe, expect, it, vi } from "vitest";

import {
  executeBackfill,
  ownershipTables,
  readConfig,
  readExpectedCounts,
  type BackfillConfig,
  type BackfillRepository,
  type OwnershipTable,
} from "./backfillOwnership.js";

const expectedCounts = { accounts: 8, categories: 18, transactions: 58, commitment_templates: 8, commitments: 17, goals: 4 } as const;
const env = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost:5432/finanzas_personales",
  OWNERSHIP_BACKFILL_CONFIRM: "local-finanzas-personales",
  OWNERSHIP_BACKFILL_DATABASE_NAME: "finanzas_personales",
  OWNERSHIP_BACKFILL_DATABASE_HOST: "localhost",
  OWNERSHIP_BACKFILL_DATABASE_PORT: "5432",
  INITIAL_USER_EMAIL: "  Owner@Example.COM ",
  INITIAL_USER_PASSWORD: "fake-test-password-marker",
  OWNERSHIP_EXPECTED_COUNTS: JSON.stringify(expectedCounts),
};

function config(overrides: Partial<BackfillConfig> = {}): BackfillConfig {
  return { email: "owner@example.com", password: "fake-config-password-marker", expectedCounts: { ...expectedCounts }, rotatePassword: false, ...overrides };
}

function fakeRepository(options: { users?: { id: string; email: string }[]; nulls?: number; transferOwnershipConflicts?: number } = {}) {
  const assigned: string[] = [];
  const repository: BackfillRepository = {
    advisoryLock: vi.fn(async () => undefined),
    listUsers: vi.fn(async () => options.users ?? []),
    countRows: vi.fn(async (table: OwnershipTable) => expectedCounts[table]),
    countNulls: vi.fn(async () => options.nulls ?? 0),
    countConflicts: vi.fn(async () => 0),
    countOrphans: vi.fn(async () => 0),
    countCrossOwnership: vi.fn(async () => 0),
    countTransferOwnershipConflicts: vi.fn(async () => options.transferOwnershipConflicts ?? 0),
    createUser: vi.fn(async () => ({ id: "new-user" })),
    updatePassword: vi.fn(async () => undefined),
    assignNullOwnership: vi.fn(async (table) => { assigned.push(table); }),
  };
  return { repository, assigned };
}

describe("ownership backfill contract", () => {
  it("requires explicit target confirmation, matching database, and non-production", () => {
    expect(() => readConfig({ ...env, OWNERSHIP_BACKFILL_CONFIRM: "" })).toThrow(/CONFIRM/);
    expect(() => readConfig({ ...env, OWNERSHIP_BACKFILL_DATABASE_NAME: "other" })).toThrow(/does not match/);
    expect(() => readConfig({ ...env, OWNERSHIP_BACKFILL_DATABASE_HOST: "other-host" })).toThrow(/host/);
    expect(() => readConfig({ ...env, OWNERSHIP_BACKFILL_DATABASE_PORT: "6543" })).toThrow(/port/);
    expect(() => readConfig({ ...env, OWNERSHIP_BACKFILL_DATABASE_HOST: undefined })).toThrow(/HOST/);
    expect(() => readConfig({ ...env, OWNERSHIP_BACKFILL_DATABASE_PORT: undefined })).toThrow(/PORT/);
    expect(() => readConfig({ ...env, NODE_ENV: "production" })).toThrow(/forbidden/);
    expect(readConfig(env).email).toBe("owner@example.com");
  });

  it("requires all six expected counts", () => {
    expect(() => readExpectedCounts(undefined)).toThrow(/required/);
    expect(() => readExpectedCounts(JSON.stringify({ accounts: 8 }))).toThrow(/exactly/);
    expect(readExpectedCounts(JSON.stringify(expectedCounts))).toEqual(expectedCounts);
  });

  it("creates a new owner and assigns every nullable row", async () => {
    const { repository, assigned } = fakeRepository();
    await executeBackfill(repository, config(), async () => "hash");
    expect(repository.createUser).toHaveBeenCalledWith("owner@example.com", "hash");
    expect(assigned).toEqual([...ownershipTables]);
  });

  it("reuses an existing owner after trim/lowercase normalization without changing its hash", async () => {
    const { repository } = fakeRepository({ users: [{ id: "existing", email: " Owner@Example.com " }] });
    const hash = vi.fn(async () => "should-not-be-called");
    await executeBackfill(repository, config(), hash);
    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.updatePassword).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it("aborts when normalized email matches more than one user", async () => {
    const { repository } = fakeRepository({ users: [{ id: "one", email: "owner@example.com" }, { id: "two", email: " Owner@Example.com " }] });
    await expect(executeBackfill(repository, config(), async () => "hash")).rejects.toThrow(/More than one/);
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it("is idempotent when ownership already belongs to the selected owner", async () => {
    const { repository, assigned } = fakeRepository({ users: [{ id: "existing", email: "owner@example.com" }] });
    await executeBackfill(repository, config(), async () => "hash");
    expect(assigned).toHaveLength(ownershipTables.length);
    expect(repository.countConflicts).toHaveBeenCalled();
  });

  it("fails before mutation on a count mismatch", async () => {
    const { repository } = fakeRepository();
    repository.countRows = vi.fn(async (table: OwnershipTable) => table === "goals" ? 3 : expectedCounts[table]);
    await expect(executeBackfill(repository, config(), async () => "hash")).rejects.toThrow(/goals/);
    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.assignNullOwnership).not.toHaveBeenCalled();
  });

  it("lets the transaction wrapper roll back on a verification error", async () => {
    const { repository } = fakeRepository({ nulls: 1 });
    let committed = false;
    const transaction = async () => {
      await executeBackfill(repository, config(), async () => "hash");
      committed = true;
    };
    await expect(transaction()).rejects.toThrow(/Residual NULL/);
    expect(committed).toBe(false);
  });

  it("aborts when transfer pairs have different non-null owners", async () => {
    const { repository } = fakeRepository({ transferOwnershipConflicts: 1 });
    await expect(executeBackfill(repository, config(), async () => "fake-hash-marker")).rejects.toThrow(/transferId/);
    expect(repository.countTransferOwnershipConflicts).toHaveBeenCalled();
  });
});
