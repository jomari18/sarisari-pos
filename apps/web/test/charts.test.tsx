import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarSpark } from "../src/features/reports/BarSpark";
import { HourlyChart } from "../src/features/reports/HourlyChart";
import { TrendChart } from "../src/features/reports/TrendChart";

const heights = (image: HTMLElement) => [...image.querySelectorAll("rect")].map((bar) => Number(bar.getAttribute("height")));

describe("BarSpark", () => {
  it("is one labelled image with a bar per value; the tallest fills it and an empty day keeps a stub", () => {
    render(<BarSpark values={[0, 500, 1000]} label="Sales for the last 3 days, highest ₱10.00 on Wednesday" />);
    const image = screen.getByRole("img", { name: "Sales for the last 3 days, highest ₱10.00 on Wednesday" });
    const [empty, half, full] = heights(image);
    expect(heights(image)).toHaveLength(3);
    expect(full).toBeGreaterThan(half!);
    expect(half).toBeGreaterThan(empty!);
    expect(empty).toBeGreaterThan(0);
  });
});

describe("HourlyChart", () => {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hour === 18 ? 8 : hour === 9 ? 2 : 0,
    salesCentavos: hour === 18 ? 120_000 : hour === 9 ? 3_000 : 0,
  }));

  it("draws all 24 hours and names the busiest", () => {
    render(<HourlyChart buckets={buckets} />);
    const image = screen.getByRole("img", { name: "Sales by hour. Busiest: 6 PM, ₱1,200.00 from 8 sales." });
    expect(image.querySelectorAll("rect")).toHaveLength(24);
  });

  it("says so when nothing sold", () => {
    render(<HourlyChart buckets={buckets.map((bucket) => ({ ...bucket, count: 0, salesCentavos: 0 }))} />);
    expect(screen.getByRole("img", { name: "Sales by hour. No sales on this day." })).toBeInTheDocument();
  });
});

describe("TrendChart", () => {
  const days = [
    { date: "2026-10-19", count: 0, salesCentavos: 0 },
    { date: "2026-10-20", count: 3, salesCentavos: 13_200 },
    { date: "2026-10-21", count: 3, salesCentavos: 12_400 },
  ];

  it("draws the days as one line and sums them up in its label", () => {
    render(<TrendChart days={days} />);
    const image = screen.getByRole("img", { name: "Sales for the last 3 days: ₱256.00 in total, highest ₱132.00 on Oct 20." });
    expect(image.querySelector("path[data-series='sales']")?.getAttribute("d")).toMatch(/^M/);
  });

  it("says so when nothing sold", () => {
    render(<TrendChart days={days.map((day) => ({ ...day, count: 0, salesCentavos: 0 }))} />);
    expect(screen.getByRole("img", { name: "Sales for the last 3 days: no sales yet." })).toBeInTheDocument();
  });
});
