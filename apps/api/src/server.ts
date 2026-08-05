import { app } from "./app.js";
import { getServerConfig } from "./serverConfig.js";

const { port, host } = getServerConfig();

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
