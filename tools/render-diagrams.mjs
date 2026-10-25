// Renders docs/diagrams/*.png from Mermaid definitions, as in the other portfolio projects.
// Run: node tools/render-diagrams.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const diagrams = {
  "context-diagram": `flowchart LR
    O(["Owner (may-ari)"]) -- "products, prices, restocks,<br/>credit limits, staff" --> S(("ZariZari"))
    S -- "dashboard, reports,<br/>needs review" --> O
    B(["Bantay"]) -- "sales, scans, utang payments,<br/>new suki" --> S
    S -- "receipts, suki balances,<br/>sync status" --> B
    V(["Visitor"]) -- "Try the demo" --> S
    S -- "a demo store for 24 hours<br/>and its two logins" --> V
    G(["GitHub Actions"]) -- "daily cleanup" --> S
    S -- "queries through Prisma" --> D[("Neon PostgreSQL")]
    D -- "rows" --> S`,
  "data-flow-diagram": `flowchart TB
    V(["Visitor"]) -- "Try the demo" --> P7(("P7 · Demo store"))
    P7 -- "two logins" --> V
    P7 -- "a new store, seeded<br/>with a month of data" --> D1[("D1 · Users and sessions")]
    B(["Bantay"]) -- "username, PIN" --> P1(("P1 · Sign in"))
    O(["Owner"]) -- "username, password" --> P1
    P1 <-- "users, sessions" --> D1
    B -- "cart and payment" --> P2(("P2 · Record a sale"))
    P2 -- "receipt" --> B
    P2 -- "offline: the sale and its id" --> D0[("Outbox on the device")]
    D0 -- "oldest first" --> P3(("P3 · Sync once"))
    P3 -- "each sale by its id" --> P2
    P2 -- "sale and lines" --> D2[("D2 · Sales")]
    P2 -- "stock movements" --> D3[("D3 · Products and stock")]
    P2 -- "utang charge" --> D4[("D4 · Suki and ledger")]
    P7 -.-> D2 & D3 & D4
    B -- "utang payment" --> P5(("P5 · Utang"))
    P5 -- "payment" --> D4
    O -- "products, prices,<br/>restocks, counts" --> P4(("P4 · Inventory"))
    P4 -- "products, movements" --> D3
    D2 & D3 & D4 --> P6(("P6 · Reports<br/>and review"))
    P6 -- "today's numbers,<br/>flagged sales" --> O2(["Owner"])`,
  flowchart: `flowchart TD
    A([Start]) --> B[Search, tap or scan products]
    B --> C{"Product found?"}
    C -- "No, owner" --> C1[Add it to the products] --> B
    C -- "No, bantay" --> C2[Sell it as a custom item] --> D
    C -- Yes --> D[Charge]
    D --> E{"How does the suki pay?"}
    E -- Cash --> F[Cash received, sukli shown]
    E -- GCash --> G[Reference, if any]
    E -- Utang --> H{"Within the suki's limit?"}
    H -- No --> H1[Refused: over the limit] --> E
    H -- Yes --> I
    F --> I{"Online?"}
    G --> I
    I -- Yes --> J[The API records the sale once by its id:<br/>stock goes down, utang is charged]
    I -- No --> K[Kept on the device,<br/>receipt says Pending sync]
    K --> L[Back online: sent in order] --> J
    J --> M{"Anything to check?"}
    M -- "stock below zero, custom item,<br/>price changed, over the limit" --> M1[Flagged in the owner's Needs review] --> N
    M -- No --> N[Receipt: print or share]
    N --> Z([End])`,
};

// Poppins, the app's typeface, embedded so Mermaid measures the labels with the font it draws them in.
const font = readFileSync(new URL("../node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff2", import.meta.url)).toString("base64");

mkdirSync("docs/diagrams", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });

for (const [name, definition] of Object.entries(diagrams)) {
  await page.setContent(`<!doctype html><meta charset="utf-8">
    <style>@font-face { font-family: Poppins; src: url(data:font/woff2;base64,${font}) format("woff2"); }</style>
    <body style="margin:0;padding:32px;background:#fff;font-family:Poppins,Arial,sans-serif">
    <pre class="mermaid">${definition.replace(/</g, "&lt;")}</pre>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
    <script>
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "base",
        themeVariables: { fontFamily: "Poppins, Arial, sans-serif", primaryColor: "#dbeafe", primaryBorderColor: "#2563eb",
          primaryTextColor: "#111315", lineColor: "#475569", fontSize: "16px",
          edgeLabelBackground: "#ffffff", clusterBkg: "#f8fafc", clusterBorder: "#94a3b8" },
        flowchart: { htmlLabels: true, curve: "basis" } });
      document.fonts.load("16px Poppins").then(() => mermaid.run()).then(() => (document.body.dataset.done = "1"));
    </script></body>`);
  await page.waitForFunction(() => document.body.dataset.done === "1");
  await page.locator("pre.mermaid svg").screenshot({ path: `docs/diagrams/${name}.png` });
  console.log(`wrote docs/diagrams/${name}.png`);
}
await browser.close();
