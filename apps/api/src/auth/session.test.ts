import { describe, expect, it, vi } from "vitest";

import { clearAuthCookie, setAuthCookie } from "./session.js";

describe("auth cookie contract", () => {
  it("sets the configured security attributes and expiry", () => {
    vi.stubEnv("AUTH_JWT_SECRET", "test-only-auth-secret-with-32-characters");
    vi.stubEnv("AUTH_COOKIE_SECURE", "true");
    vi.stubEnv("AUTH_COOKIE_DOMAIN", "example.test");
    vi.stubEnv("AUTH_COOKIE_SAME_SITE", "strict");
    vi.stubEnv("AUTH_SESSION_MAX_AGE_SECONDS", "900");

    const response = { cookie: vi.fn() };
    setAuthCookie(response as never, "token-value");

    expect(response.cookie).toHaveBeenCalledWith("auth_token", "token-value", {
      httpOnly: true,
      maxAge: 900_000,
      sameSite: "strict",
      secure: true,
      domain: "example.test",
    });
  });

  it("clears the same cookie scope with an immediate expiry", () => {
    vi.stubEnv("AUTH_JWT_SECRET", "test-only-auth-secret-with-32-characters");
    vi.stubEnv("AUTH_COOKIE_SECURE", "false");
    vi.stubEnv("AUTH_COOKIE_DOMAIN", "example.test");
    vi.stubEnv("AUTH_COOKIE_SAME_SITE", "lax");

    const response = { cookie: vi.fn() };
    clearAuthCookie(response as never);

    expect(response.cookie).toHaveBeenCalledWith("auth_token", "", {
      httpOnly: true,
      maxAge: 0,
      sameSite: "lax",
      secure: false,
      domain: "example.test",
    });
  });
});
