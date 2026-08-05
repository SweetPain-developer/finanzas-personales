import { describe, expect, it } from "vitest";

import { createLoginRateLimiter } from "./loginProtection.js";

describe("login rate limiter", () => {
  it("blocks after repeated failures and unlocks after the block period", () => {
    let now = 0;
    const limiter = createLoginRateLimiter({ windowMs: 60_000, maxAttempts: 2, blockMs: 30_000 }, () => now);

    limiter.recordFailure("ip-1");
    limiter.recordFailure("ip-1");
    expect(limiter.check("ip-1")).toEqual({ allowed: false, retryAfterSeconds: 30 });

    now = 30_000;
    expect(limiter.check("ip-1")).toEqual({ allowed: true });
  });

  it("expires failures outside the rolling window", () => {
    let now = 0;
    const limiter = createLoginRateLimiter({ windowMs: 10_000, maxAttempts: 2, blockMs: 30_000 }, () => now);

    limiter.recordFailure("ip-1");
    now = 10_000;
    expect(limiter.check("ip-1")).toEqual({ allowed: true });
    limiter.recordFailure("ip-1");
    expect(limiter.check("ip-1")).toEqual({ allowed: true });
  });

  it("clears failures after a successful login", () => {
    const limiter = createLoginRateLimiter({ windowMs: 60_000, maxAttempts: 2, blockMs: 30_000 }, () => 0);

    limiter.recordFailure("ip-1");
    limiter.recordSuccess("ip-1");
    limiter.recordFailure("ip-1");
    expect(limiter.check("ip-1")).toEqual({ allowed: true });
  });
});
