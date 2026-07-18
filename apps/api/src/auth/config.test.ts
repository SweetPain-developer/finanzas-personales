import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAuthConfig } from "./config.js";

const environmentKeys = ["AUTH_JWT_SECRET", "AUTH_COOKIE_SECURE", "NODE_ENV"] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof environmentKeys)[number], string | undefined>;

function restoreEnvironment() {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("getAuthConfig", () => {
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-only-auth-secret-with-32-characters";
    delete process.env.AUTH_COOKIE_SECURE;
    delete process.env.NODE_ENV;
  });

  afterEach(restoreEnvironment);

  it.each([undefined, "false"])("rejects production when AUTH_COOKIE_SECURE is %s", (cookieSecure) => {
    process.env.NODE_ENV = "production";

    if (cookieSecure === undefined) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = cookieSecure;
    }

    expect(() => getAuthConfig()).toThrow("AUTH_COOKIE_SECURE=true is required when NODE_ENV=production.");
  });

  it("accepts production only when AUTH_COOKIE_SECURE is true", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_JWT_SECRET = "a-production-secret-with-at-least-32-chars";
    process.env.AUTH_COOKIE_SECURE = "true";

    expect(getAuthConfig().cookieSecure).toBe(true);
  });

  it("rejects a short JWT secret in production", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_JWT_SECRET = "too-short-secret";
    process.env.AUTH_COOKIE_SECURE = "true";

    expect(() => getAuthConfig()).toThrow(
      "AUTH_JWT_SECRET must be at least 32 characters in production.",
    );
  });

  it("accepts a JWT secret with the minimum production length", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_JWT_SECRET = "12345678901234567890123456789012";
    process.env.AUTH_COOKIE_SECURE = "true";

    expect(getAuthConfig().jwtSecret).toHaveLength(32);
  });

  it.each([undefined, "false"])("keeps local AUTH_COOKIE_SECURE behavior optional when it is %s", (cookieSecure) => {
    if (cookieSecure === undefined) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = cookieSecure;
    }

    expect(getAuthConfig().cookieSecure).toBe(cookieSecure === "true");
  });
});
