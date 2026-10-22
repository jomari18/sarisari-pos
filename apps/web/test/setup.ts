import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { offlineDb } from "../src/offline/db";

// jsdom has no layout, so it cannot scroll; the router scrolls a new page to its top (a test spies on this).
if (typeof window !== "undefined") window.scrollTo = () => {};

// Testing Library only cleans up by itself when test globals are on; they are off here.
afterEach(async () => {
  cleanup();
  // Each test starts with an empty device: no saved catalog, nothing queued.
  await Promise.all([offlineDb.outbox.clear(), offlineDb.catalogs.clear()]);
});
