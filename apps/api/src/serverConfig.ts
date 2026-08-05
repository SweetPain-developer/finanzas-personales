const DEFAULT_PORT = 3001;
const DEFAULT_LOCAL_HOST = "127.0.0.1";
const DEFAULT_PRODUCTION_HOST = "0.0.0.0";

export type ServerConfig = {
  port: number;
  host: string;
};

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const rawPort = env.PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const configuredHost = env.HOST?.trim();
  const host = configuredHost || (env.NODE_ENV === "production" ? DEFAULT_PRODUCTION_HOST : DEFAULT_LOCAL_HOST);

  return { port, host };
}
