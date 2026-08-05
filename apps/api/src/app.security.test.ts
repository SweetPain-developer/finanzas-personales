import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app, resetLoginRateLimiterForTests } from "./app.js";
import * as session from "./auth/session.js";

describe("login protection", () => {
  beforeEach(() => {
    resetLoginRateLimiterForTests();
    vi.restoreAllMocks();
  });

  it("returns the same public response for an unknown account and a wrong password", async () => {
    vi.spyOn(session, "loginWithPassword")
      .mockRejectedValueOnce(new session.AuthenticationError("Invalid email or password."))
      .mockRejectedValueOnce(new session.AuthenticationError("Invalid email or password."));

    const unknownAccount = await request(app).post("/auth/login").send({ email: "missing@example.com", password: "wrong" }).expect(401);
    resetLoginRateLimiterForTests();
    const wrongPassword = await request(app).post("/auth/login").send({ email: "known@example.com", password: "wrong" }).expect(401);

    expect(unknownAccount.body).toEqual({ error: "Invalid email or password." });
    expect(wrongPassword.body).toEqual(unknownAccount.body);
    expect(unknownAccount.headers["retry-after"]).toBeUndefined();
    expect(wrongPassword.headers["retry-after"]).toBeUndefined();
  });

  it("temporarily blocks the IP after the configured number of failed attempts", async () => {
    vi.spyOn(session, "loginWithPassword").mockRejectedValue(new session.AuthenticationError("Invalid email or password."));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post("/auth/login").send({ email: "user@example.com", password: "wrong" }).expect(401);
    }

    const blocked = await request(app).post("/auth/login").send({ email: "user@example.com", password: "wrong" }).expect(429);
    expect(blocked.body).toEqual({ error: "Too many login attempts. Please try again later." });
    expect(blocked.headers["retry-after"]).toBe("300");
    expect(session.loginWithPassword).toHaveBeenCalledTimes(5);
  });
});

describe("API security headers", () => {
  it("sets non-destructive baseline headers", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });
});
