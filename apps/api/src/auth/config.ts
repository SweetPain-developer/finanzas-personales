const DEFAULT_AUTH_COOKIE_NAME = "auth_token";
const DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const MINIMUM_PRODUCTION_JWT_SECRET_LENGTH = 32;

export type AuthConfig = {
  jwtSecret: string;
  cookieName: string;
  cookieSecure: boolean;
  sessionMaxAgeSeconds: number;
};

export function getAuthConfig(): AuthConfig {
  const jwtSecret = process.env.AUTH_JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  const cookieSecure = process.env.AUTH_COOKIE_SECURE === "true";

  if (!jwtSecret) {
    throw new Error("AUTH_JWT_SECRET is required.");
  }

  if (isProduction && jwtSecret.length < MINIMUM_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error("AUTH_JWT_SECRET must be at least 32 characters in production.");
  }

  if (isProduction && !cookieSecure) {
    throw new Error("AUTH_COOKIE_SECURE=true is required when NODE_ENV=production.");
  }

  return {
    jwtSecret,
    cookieName: process.env.AUTH_COOKIE_NAME ?? DEFAULT_AUTH_COOKIE_NAME,
    cookieSecure,
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
