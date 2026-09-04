import { useMemo } from "react";
import {
  BarChart,
  CartesianGrid,
  Legend,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cssColor, themeVars } from "../../lib/themes";
import { useApp } from "../../store";

/** Slate tick colour shared by every dashboard axis (cartesian and radar). */
export const AXIS_TICK_COLOR = "#64748b";

const axisTick = (fontSize: number) => ({ fill: AXIS_TICK_COLOR, fontSize });

/**
 * Fixed good/mid/bad series colours, deliberately NOT derived from the theme:
 * the accent can be any colour the user picks (e.g. green) and must not blend
 * into a sentiment the chart is trying to show.
 */
export const SERIES_POSITIVE = "#34d399";
export const SERIES_CAUTION = "#fbbf24";
export const SERIES_NEGATIVE = "#fb7185";

/** Pixel height of the plot area; Empty states mirror it so panels don't jump. */
export const CHART_HEIGHT = 220;

const Y_AXIS_TICK = axisTick(11);
const LEGEND_STYLE = { fontSize: 11 };

/**
 * Chart colours derived from the active preset (not getComputedStyle — that
 * races applyTheme's DOM write and lags one render behind a theme switch).
 * Shared by ChartFrame's boilerplate and the page's own series colours.
 */
export function useChartPalette() {
  const settings = useApp((s) => s.settings);
  return useMemo(() => {
    const vars = themeVars(settings.theme, settings.customTheme);
    const tooltipBg = cssColor(vars, "--surface-800");
    const tooltipBorder = cssColor(vars, "--surface-600");
    return {
      /** Series stroke/fill (bars, lines, radar). */
      accent: cssColor(vars, "--accent-500"),
      /** CartesianGrid stroke. */
      grid: cssColor(vars, "--surface-700"),
      /** Radar web stroke. */
      polarGrid: cssColor(vars, "--surface-600"),
      tooltipStyle: {
        background: tooltipBg,
        border: `1px solid ${tooltipBorder}`,
        borderRadius: 8,
        fontSize: 12,
        color: "#e2e8f0",
      },
    };
  }, [settings.theme, settings.customTheme]);
}

type ChartFrameProps = {
  /** Which cartesian skeleton to render. */
  kind: "bar" | "line";
  data: unknown[];
  /** X-axis dataKey. */
  xKey: string;
  children: React.ReactNode;
  /** X-axis tick font size (default 11). */
  xTickFontSize?: number;
  /** X-axis label interval — skips crowded ticks (score distribution). */
  xInterval?: number;
  /** Round Y ticks to whole numbers (count axes). */
  yWholeNumbers?: boolean;
  /** Fixed Y domain for percentage axes. */
  yDomain?: [number, number];
  /** Draw a CartesianGrid behind the series (line charts). */
  grid?: boolean;
  /** Show a compact Legend under the chart. */
  legend?: boolean;
  /** Pixel height of the plot (default 220). */
  height?: number;
};

/**
 * Theme-configured home for the dashboard's cartesian charts: responsive box,
 * axis ticks, tooltip and (optionally) grid + legend, so each usage only
 * states its data, its axes and its series.
 */
export function ChartFrame({
  kind,
  data,
  xKey,
  children,
  xTickFontSize = 11,
  xInterval,
  yWholeNumbers,
  yDomain,
  grid = false,
  legend = false,
  height = CHART_HEIGHT,
}: ChartFrameProps) {
  const palette = useChartPalette();
  const Chart = kind === "line" ? LineChart : BarChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data}>
        {grid && <CartesianGrid stroke={palette.grid} />}
        <XAxis dataKey={xKey} tick={axisTick(xTickFontSize)} interval={xInterval} />
        <YAxis allowDecimals={!yWholeNumbers} domain={yDomain} tick={Y_AXIS_TICK} />
        <Tooltip contentStyle={palette.tooltipStyle} />
        {legend && <Legend wrapperStyle={LEGEND_STYLE} />}
        {children}
      </Chart>
    </ResponsiveContainer>
  );
}

export default ChartFrame;
