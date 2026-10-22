import { render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "../src/app/router";

// Spec 11.1, word for word: the design is CC BY 4.0, so the credit names the work, its author, the license and the changes.
const DESIGN_CREDIT =
  'UI adapted from "POS System Web UI" by Abubakar Sherazi (Figma Community), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: blue accent, new brand, sari-sari screens and content, icons.';

function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("credits (spec 11.1)", () => {
  it("credits the UI design word for word, with a link to its license", async () => {
    openAt("/credits");
    expect(await screen.findByRole("heading", { level: 1, name: "Credits" })).toBeInTheDocument();
    const design = screen.getByRole("region", { name: "Design" });
    const credit = within(design).getByText((_, element) => element?.tagName === "P" && element.textContent === DESIGN_CREDIT);
    expect(within(credit).getByRole("link", { name: "https://creativecommons.org/licenses/by/4.0/" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("credits the Lucide icons and the Poppins font with their licenses", async () => {
    openAt("/credits");
    const icons = await screen.findByRole("region", { name: "Icons" });
    expect(icons).toHaveTextContent("Lucide");
    expect(within(icons).getByRole("link", { name: "ISC License" })).toHaveAttribute("href", "https://lucide.dev/license");
    const font = screen.getByRole("region", { name: "Font" });
    expect(font).toHaveTextContent("Poppins");
    expect(within(font).getByRole("link", { name: "SIL Open Font License 1.1" })).toHaveAttribute("href", "https://openfontlicense.org/");
  });

  it("says the 3D tindahan is made in code, and credits the libraries it and the barcode scanner use", async () => {
    openAt("/credits");
    const scene = await screen.findByRole("region", { name: "3D tindahan" });
    expect(scene).toHaveTextContent("no downloaded models");
    expect(within(scene).getByRole("link", { name: "three.js" })).toHaveAttribute("href", "https://github.com/mrdoob/three.js/blob/dev/LICENSE");
    const scanner = screen.getByRole("region", { name: "Barcode scanning" });
    expect(within(scanner).getByRole("link", { name: "Apache License 2.0" })).toHaveAttribute("href", "https://github.com/zxing-js/library/blob/master/LICENSE");
  });
});

describe("a page that does not exist", () => {
  it("says so and links home", async () => {
    openAt("/no-such-page");
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });
});
