import request from "supertest";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_JWT_SECRET = "test-secret-with-enough-entropy";
  process.env.AUTH_COOKIE_SECURE = "false";
});

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("../prisma.js", () => ({
  prisma: prismaMock,
}));

const { app } = await import("../app.js");
const { hashPassword } = await import("./password.js");

describe("auth API", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    process.env.AUTH_JWT_SECRET = "test-secret-with-enough-entropy";
    process.env.AUTH_COOKIE_SECURE = "false";
    delete process.env.AUTH_COOKIE_NAME;
    delete process.env.AUTH_SESSION_MAX_AGE_SECONDS;
  });

  it("keeps health public", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });

  it("logs in with a valid password and stores the JWT in an HTTP-only cookie", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-demo",
      email: "demo@example.com",
      displayName: "Demo User",
      passwordHash: await hashPassword("correct-password"),
    });

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "demo@example.com", password: "correct-password" })
      .expect(200);

    expect(response.body).toEqual({ user: { id: "user-demo", email: "demo@example.com", displayName: "Demo User" } });
    expect(response.headers["set-cookie"]?.[0]).toContain("auth_token=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: "demo@example.com" } });
  });

  it("sets the Secure cookie flag when AUTH_COOKIE_SECURE is true", async () => {
    process.env.AUTH_COOKIE_SECURE = "true";
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-demo",
      email: "demo@example.com",
      displayName: "Demo User",
      passwordHash: await hashPassword("correct-password"),
    });

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "demo@example.com", password: "correct-password" })
      .expect(200);

    expect(response.headers["set-cookie"]?.[0]).toContain("Secure");
  });

  it("rejects invalid credentials without setting an auth cookie", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-demo",
      email: "demo@example.com",
      displayName: "Demo User",
      passwordHash: await hashPassword("correct-password"),
    });

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "demo@example.com", password: "wrong-password" })
      .expect(401);

    expect(response.body).toEqual({ error: "Invalid email or password." });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns the current session from the auth cookie", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-demo",
      email: "demo@example.com",
      displayName: null,
      passwordHash: await hashPassword("correct-password"),
    });

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "demo@example.com", password: "correct-password" })
      .expect(200);

    const response = await request(app)
      .get("/auth/session")
      .set("Cookie", login.headers["set-cookie"])
      .expect(200);

    expect(response.body).toEqual({ user: { id: "user-demo", email: "demo@example.com", displayName: null } });
  });

  it("rejects malformed auth cookies on the session route without a server error", async () => {
    const response = await request(app)
      .get("/auth/session")
      .set("Cookie", "auth_token=%")
      .expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
  });

  it.each([
    ["tampered", "auth_token=not-a-valid-jwt"],
    [
      "expired",
      `auth_token=${jwt.sign(
        { sub: "user-demo", email: "demo@example.com", displayName: null },
        "test-secret-with-enough-entropy",
        { expiresIn: -1 },
      )}`,
    ],
  ])("rejects %s auth cookies on the session route", async (_caseName, cookie) => {
    const response = await request(app)
      .get("/auth/session")
      .set("Cookie", cookie)
      .expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
  });

  it("clears the auth cookie on logout", async () => {
    const response = await request(app).post("/auth/logout").expect(204);

    expect(response.headers["set-cookie"]?.[0]).toContain("auth_token=");
    expect(response.headers["set-cookie"]?.[0]).toContain("Max-Age=0");
  });

  it("rejects unauthenticated financial routes", async () => {
    const response = await request(app).get("/accounts").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
  });

  it("rejects malformed auth cookies on protected financial routes without a server error", async () => {
    const response = await request(app)
      .get("/accounts")
      .set("Cookie", "auth_token=%")
      .expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
  });

  it("rejects invalid auth cookies on protected financial routes", async () => {
    const response = await request(app)
      .get("/accounts")
      .set("Cookie", "auth_token=not-a-valid-jwt")
      .expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
  });
});
