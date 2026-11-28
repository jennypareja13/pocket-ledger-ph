import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartStyle, getSafeChartId, type ChartConfig } from "@/components/ui/chart";

describe("ChartStyle CSS allowlist", () => {
  it.each([
    "#abc",
    "#aabbcc",
    "rgb(23, 105, 117)",
    "rgba(23, 105, 117, 0.5)",
    "rgb(23 105 117 / 16%)",
    "hsl(180, 50%, 40%)",
    "hsl(180 50% 40%)",
    "hsl(var(--chart-1))",
    "var(--chart-1)",
  ])("accepts a supported CSS color: %s", (color) => {
    const { container } = render(<ChartStyle id="chart-safe" config={{ income: { color } }} />);

    expect(container.querySelector("style")?.textContent).toContain(`--color-income: ${color};`);
  });

  it("drops a malicious color instead of injecting it into the style element", () => {
    const malicious =
      "red; }</style><script>window.__pwned = true</script><style>body { color: red";
    const { container } = render(
      <ChartStyle id="chart-safe" config={{ income: { color: malicious } }} />,
    );

    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("__pwned");
  });

  it("drops unsafe chart keys that could inject CSS declarations", () => {
    const config = {
      "income; } body { color: red": { color: "#123456" },
    } as ChartConfig;
    const { container } = render(<ChartStyle id="chart-safe" config={config} />);

    expect(container.querySelector("style")).toBeNull();
  });

  it("rejects unsafe ids passed directly to ChartStyle", () => {
    const { container } = render(
      <ChartStyle
        id={'chart-safe"] { body { color: red } /*'}
        config={{ income: { color: "#123456" } }}
      />,
    );

    expect(container.querySelector("style")).toBeNull();
  });

  it("replaces an unsafe container id with a generated safe id", () => {
    expect(getSafeChartId('bad"] { body { color: red } /*', ":r0:")).toBe("chart-r0");
    expect(getSafeChartId("safe-id_1", ":r0:")).toBe("chart-safe-id_1");
  });
});
