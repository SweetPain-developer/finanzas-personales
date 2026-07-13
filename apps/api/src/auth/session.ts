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

type AuthUserRecord = CurrentUser & {
  passwordHash: string;
};

const authUserReader = prisma as unknown as {
  user: {
    findUnique(args: { where: { email: string } }): Promise<AuthUserRecord | null>;
  };
};

export async function loginWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await authUserReader.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new AuthenticationError("Invalid email or password.");
  }

  return toCurrentUser(user);
}

export function createSessionToken(user: CurrentUser) {
  const config = getAuthConfig();

  return jwt.sign(
    { sub: user.id, email: user.email, displayName: user.displayName },
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
    const payload = jwt.verify(token, getAuthConfig().jwtSecret);
    const user = getUserFromPayload(payload);

    if (!user) {
      return null;
    }

    return user;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return null;
    }

    throw error;
  }
}

export function setAuthCookie(response: express.Response, token: string) {
  const config = getAuthConfig();

  response.cookie(config.cookieName, token, {
    httpOnly: true,
    maxAge: config.sessionMaxAgeSeconds * 1000,
    sameSite: "strict",
    secure: config.cookieSecure,
  });
}

export function clearAuthCookie(response: express.Response) {
  const config = getAuthConfig();

  response.cookie(config.cookieName, "", {
    httpOnly: true,
    maxAge: 0,
    sameSite: "strict",
    secure: config.cookieSecure,
  });
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

function getUserFromPayload(payload: string | JwtPayload): CurrentUser | null {
  if (
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    !(typeof payload.displayName === "string" || payload.displayName === null)
  ) {
    return null;
  }

  return {
    id: payload.sub,
    email: payload.email,
    displayName: payload.displayName,
  };
}

function toCurrentUser(user: { id: string; email: string; displayName: string | null }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}
