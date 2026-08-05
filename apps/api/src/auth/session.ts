import type express from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { prisma } from "../prisma.js";
import { getAuthConfig } from "./config.js";
import { verifyPassword } from "./password.js";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export class AuthenticationError extends Error {}

// Keep password verification work comparable when the email does not exist.
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$otuGJANt1UyT+MhsrUAhLA$2qM9xl5NiANFCjD1Yf+JOSIefRdUL6zllLHlOyUw4tU";

type AuthUserRecord = CurrentUser & {
  passwordHash: string;
  sessionVersion?: number;
};

const authUserReader = prisma as unknown as {
  user: {
      findUnique(args: { where: { email: string } | { id: string } }): Promise<AuthUserRecord | null>;
      updateMany(args: { where: { id: string; sessionVersion: number }; data: { sessionVersion: { increment: number } } }): Promise<{ count: number }>;
  };
};

export async function loginWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await authUserReader.user.findUnique({ where: { email: normalizedEmail } });

  const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);

  if (!user || !passwordMatches) {
    throw new AuthenticationError("Invalid email or password.");
  }

  return { ...toCurrentUser(user), sessionVersion: getSessionVersion(user) };
}

export function createSessionToken(user: CurrentUser & { sessionVersion?: number }) {
  const config = getAuthConfig();

  return jwt.sign(
    { sub: user.id, email: user.email, displayName: user.displayName, sessionVersion: getSessionVersion(user) },
    config.jwtSecret,
    { expiresIn: config.sessionMaxAgeSeconds },
  );
}

export async function resolveCurrentUser(request: express.Request): Promise<CurrentUser | null> {
  const token = readCookie(request.headers.cookie, getAuthConfig().cookieName);

  if (!token) {
    return null;
  }

  try {
    const payload = getSessionClaims(jwt.verify(token, getAuthConfig().jwtSecret));

    if (!payload) {
      return null;
    }

    const user = await authUserReader.user.findUnique({ where: { id: payload.sub } });
    if (!user || getSessionVersion(user) !== payload.sessionVersion) {
      return null;
    }

    return toCurrentUser(user);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return null;
    }

    throw error;
  }
}

export async function revokeCurrentSession(request: express.Request) {
  const token = readCookie(request.headers.cookie, getAuthConfig().cookieName);

  if (!token) {
    return;
  }

  try {
    const payload = getSessionClaims(jwt.verify(token, getAuthConfig().jwtSecret));
    if (!payload) {
      return;
    }

    await authUserReader.user.updateMany({
      where: { id: payload.sub, sessionVersion: payload.sessionVersion },
      data: { sessionVersion: { increment: 1 } },
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return;
    }

    throw error;
  }
}

export function setAuthCookie(response: express.Response, token: string) {
  const config = getAuthConfig();

  response.cookie(config.cookieName, token, {
    ...authCookieOptions(config),
    maxAge: config.sessionMaxAgeSeconds * 1000,
  });
}

export function clearAuthCookie(response: express.Response) {
  const config = getAuthConfig();

  response.cookie(config.cookieName, "", {
    ...authCookieOptions(config),
    maxAge: 0,
  });
}

function authCookieOptions(config: ReturnType<typeof getAuthConfig>) {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  } as const;
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const cookie = cookies.find((entry) => entry.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch (error) {
    if (error instanceof URIError) {
      return null;
    }

    throw error;
  }
}

type SessionClaims = { sub: string; email: string; displayName: string | null; sessionVersion: number };

function getSessionClaims(payload: string | JwtPayload): SessionClaims | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    typeof payload.email !== "string" ||
    payload.email.length === 0 ||
    !(typeof payload.displayName === "string" || payload.displayName === null) ||
    !Number.isInteger(payload.sessionVersion) ||
    (payload.sessionVersion as number) < 0
  ) {
    return null;
  }

  return {
    sub: payload.sub,
    email: payload.email,
    displayName: payload.displayName,
    sessionVersion: payload.sessionVersion as number,
  };
}

function getSessionVersion(user: { sessionVersion?: number }) {
  return Number.isInteger(user.sessionVersion) && (user.sessionVersion as number) >= 0 ? user.sessionVersion as number : 0;
}

function toCurrentUser(user: { id: string; email: string; displayName: string | null }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}
