import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadConfig(process.env);
const app = createApp({ config });

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "SariSari POS API listening");
});
