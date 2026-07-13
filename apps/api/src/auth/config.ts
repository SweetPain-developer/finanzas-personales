const DEFAULT_AUTH_COOKIE_NAME = "auth_token";
const DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type AuthConfig = {
  jwtSecret: string;
  cookieName: string;
  cookieSecure: boolean;
  sessionMaxAgeSeconds: number;
};

export function getAuthConfig(): AuthConfig {
  const jwtSecret = process.env.AUTH_JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("AUTH_JWT_SECRET is required.");
  }

  return {
    jwtSecret,
    cookieName: process.env.AUTH_COOKIE_NAME ?? DEFAULT_AUTH_COOKIE_NAME,
    cookieSecure: process.env.AUTH_COOKIE_SECURE === "true",
    sessionMaxAgeSeconds: parsePositiveInteger(
      process.env.AUTH_SESSION_MAX_AGE_SECONDS,
      DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS,
    ),
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
