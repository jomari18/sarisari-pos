import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { logger } from "./logger.js";

const config = loadConfig(process.env);
const app = createApp({ config, db: createDb(config.DATABASE_URL) });

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "ZariZari API listening");
});
