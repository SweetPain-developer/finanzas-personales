const DEFAULT_AUTH_COOKIE_NAME = "auth_token";
const DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const DEFAULT_AUTH_ALLOWED_ORIGIN = "http://localhost:5173";
const DEFAULT_AUTH_COOKIE_SAME_SITE = "strict" as const;
const DEFAULT_AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS = 300;
const MINIMUM_PRODUCTION_JWT_SECRET_LENGTH = 32;

export type AuthCookieSameSite = "strict" | "lax" | "none";

export type AuthConfig = {
  jwtSecret: string;
  cookieName: string;
  cookieSecure: boolean;
  cookieDomain?: string;
  cookieSameSite: AuthCookieSameSite;
  sessionMaxAgeSeconds: number;
  allowedOrigins: string[];
  loginRateLimit: {
    windowMs: number;
    maxAttempts: number;
    blockMs: number;
  };
};

export type CorsConfig = {
  allowedOrigins: string[];
  credentials: true;
};

export type LoginRateLimitConfig = {
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
};

export function getLoginRateLimitConfig(env: NodeJS.ProcessEnv = process.env): LoginRateLimitConfig {
  return {
    windowMs: parsePositiveInteger(env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS) * 1000,
    maxAttempts: parsePositiveInteger(env.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS, DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS),
    blockMs: parsePositiveInteger(env.AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS, DEFAULT_AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS) * 1000,
  };
}

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

  const cookieSameSite = parseCookieSameSite(process.env.AUTH_COOKIE_SAME_SITE);

  if (cookieSameSite === "none" && !cookieSecure) {
    throw new Error("AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true.");
  }

  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  const corsConfig = getCorsConfig();

  return {
    jwtSecret,
    cookieName: process.env.AUTH_COOKIE_NAME ?? DEFAULT_AUTH_COOKIE_NAME,
    cookieSecure,
    ...(cookieDomain ? { cookieDomain } : {}),
    cookieSameSite,
    sessionMaxAgeSeconds: parseSessionMaxAgeSeconds(process.env.AUTH_SESSION_MAX_AGE_SECONDS),
    allowedOrigins: corsConfig.allowedOrigins,
    loginRateLimit: getLoginRateLimitConfig(),
  };
}

export function getCorsConfig(env: NodeJS.ProcessEnv = process.env): CorsConfig {
  const configuredOrigins = env.AUTH_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!configuredOrigins?.length) {
    if (env.NODE_ENV === "production") {
      throw new Error("AUTH_ALLOWED_ORIGINS is required in production.");
    }

    return { allowedOrigins: [DEFAULT_AUTH_ALLOWED_ORIGIN], credentials: true };
  }

  if (env.NODE_ENV === "production" && configuredOrigins.includes("*")) {
    throw new Error("AUTH_ALLOWED_ORIGINS must not contain a wildcard in production.");
  }

  return { allowedOrigins: configuredOrigins, credentials: true };
}

function parseCookieSameSite(value: string | undefined): AuthCookieSameSite {
  if (!value) {
    return DEFAULT_AUTH_COOKIE_SAME_SITE;
  }

  if (value === "strict" || value === "lax" || value === "none") {
    return value;
  }

  throw new Error("AUTH_COOKIE_SAME_SITE must be strict, lax, or none.");
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSessionMaxAgeSeconds(value: string | undefined) {
  if (!value) {
    return DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("AUTH_SESSION_MAX_AGE_SECONDS must be a positive integer.");
  }

  if (parsed > DEFAULT_AUTH_SESSION_MAX_AGE_SECONDS) {
    throw new Error("AUTH_SESSION_MAX_AGE_SECONDS must not exceed 28800 seconds.");
  }

  return parsed;
}
