interface ImportMetaEnv {
  /** The API's /health on Render, called directly to wake the free instance (spec 3.1); "/api/health" when unset. */
  readonly VITE_API_WAKE_URL?: string;
}
