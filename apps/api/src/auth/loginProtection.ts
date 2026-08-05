import type express from "express";

import type { LoginRateLimitConfig } from "./config.js";

type AttemptState = {
  failures: number[];
  blockedUntil: number;
};

export type LoginRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export function createLoginRateLimiter(
  config: LoginRateLimitConfig,
  clock: () => number = Date.now,
) {
  const attemptsByIp = new Map<string, AttemptState>();

  function check(ip: string): LoginRateLimitDecision {
    const now = clock();
    const state = attemptsByIp.get(ip);

    if (!state) return { allowed: true };

    if (state.blockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000) };
    }

    prune(state, now, config.windowMs);
    if (state.failures.length === 0) attemptsByIp.delete(ip);
    return { allowed: true };
  }

  function recordFailure(ip: string) {
    const now = clock();
    const state = attemptsByIp.get(ip) ?? { failures: [], blockedUntil: 0 };
    prune(state, now, config.windowMs);
    state.failures.push(now);
    if (state.failures.length >= config.maxAttempts) state.blockedUntil = now + config.blockMs;
    attemptsByIp.set(ip, state);
  }

  function recordSuccess(ip: string) {
    attemptsByIp.delete(ip);
  }

  function reset() {
    attemptsByIp.clear();
  }

  return { check, recordFailure, recordSuccess, reset };
}

export function getLoginRateLimitKey(request: express.Request) {
  return request.ip ?? request.socket.remoteAddress ?? "unknown";
}

function prune(state: AttemptState, now: number, windowMs: number) {
  state.failures = state.failures.filter((timestamp) => now - timestamp < windowMs);
}
