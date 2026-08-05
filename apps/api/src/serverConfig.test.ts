import { describe, expect, it } from "vitest";

import { getServerConfig } from "./serverConfig.js";

describe("getServerConfig", () => {
  it("uses PORT and an explicit HOST", () => {
    expect(getServerConfig({ PORT: "4310", HOST: "127.0.0.1" })).toEqual({ port: 4310, host: "127.0.0.1" });
  });

  it("binds production by default on all interfaces for managed web services", () => {
    expect(getServerConfig({ NODE_ENV: "production" })).toEqual({ port: 3001, host: "0.0.0.0" });
  });

  it("keeps local development bound to loopback by default", () => {
    expect(getServerConfig({})).toEqual({ port: 3001, host: "127.0.0.1" });
  });

  it("rejects an invalid PORT instead of starting on an unexpected port", () => {
    expect(() => getServerConfig({ PORT: "not-a-port" })).toThrow("PORT must be an integer between 1 and 65535.");
  });
});
