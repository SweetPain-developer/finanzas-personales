import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAuthConfig, getCorsConfig } from "./config.js";

const environmentKeys = [
  "AUTH_JWT_SECRET",
  "AUTH_COOKIE_SECURE",
  "AUTH_ALLOWED_ORIGINS",
  "AUTH_COOKIE_DOMAIN",
  "AUTH_COOKIE_SAME_SITE",
  "AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS",
  "AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS",
  "AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS",
  "AUTH_SESSION_MAX_AGE_SECONDS",
  "NODE_ENV",
] as const;
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
    process.env.AUTH_ALLOWED_ORIGINS = "http://localhost:5173";
    delete process.env.AUTH_COOKIE_DOMAIN;
    delete process.env.AUTH_COOKIE_SAME_SITE;
    delete process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS;
    delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
    delete process.env.AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS;
    delete process.env.AUTH_SESSION_MAX_AGE_SECONDS;
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

  it("uses the local web origin by default outside production", () => {
    expect(getCorsConfig()).toEqual({
      allowedOrigins: ["http://localhost:5173"],
      credentials: true,
    });
  });

  it("parses explicit origins and cookie settings", () => {
    process.env.AUTH_ALLOWED_ORIGINS = "https://web.example.test, http://localhost:5173";
    process.env.AUTH_COOKIE_DOMAIN = "example.test";
    process.env.AUTH_COOKIE_SAME_SITE = "lax";

    expect(getAuthConfig()).toMatchObject({
      allowedOrigins: ["https://web.example.test", "http://localhost:5173"],
      cookieDomain: "example.test",
      cookieSameSite: "lax",
    });
  });

  it("rejects a missing or wildcard production origin configuration", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_COOKIE_SECURE = "true";
    delete process.env.AUTH_ALLOWED_ORIGINS;

    expect(() => getCorsConfig()).toThrow("AUTH_ALLOWED_ORIGINS is required in production.");

    process.env.AUTH_ALLOWED_ORIGINS = "*";
    expect(() => getCorsConfig()).toThrow("AUTH_ALLOWED_ORIGINS must not contain a wildcard in production.");
  });

  it("rejects insecure SameSite=None cookies", () => {
    process.env.AUTH_COOKIE_SAME_SITE = "none";

    expect(() => getAuthConfig()).toThrow("AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true.");
  });

  it("uses explicit login rate-limit configuration", () => {
    process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS = "30";
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "3";
    process.env.AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS = "120";

    expect(getAuthConfig().loginRateLimit).toEqual({
      windowMs: 30_000,
      maxAttempts: 3,
      blockMs: 120_000,
    });
  });

  it.each(["0", "not-a-number", "28801"])("rejects an unsafe JWT lifetime: %s", (value) => {
    process.env.AUTH_SESSION_MAX_AGE_SECONDS = value;

    expect(() => getAuthConfig()).toThrow();
  });
});
