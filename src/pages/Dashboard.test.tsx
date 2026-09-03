import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("recharts", () => {
  const stub = (name: string) =>
    function Stub({
      children,
      ...props
    }: {
      children?: React.ReactNode;
    } & Record<string, unknown>) {
      return (
        <div data-chart={name} data-props={JSON.stringify(props)}>
          {children}
        </div>
      );
    };
  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    BarChart: stub("BarChart"),
    Bar: stub("Bar"),
    Cell: stub("Cell"),
    XAxis: stub("XAxis"),
    YAxis: stub("YAxis"),
    Tooltip: stub("Tooltip"),
    Legend: stub("Legend"),
    LineChart: stub("LineChart"),
    Line: stub("Line"),
    CartesianGrid: stub("CartesianGrid"),
    RadarChart: stub("RadarChart"),
    Radar: stub("Radar"),
    PolarGrid: stub("PolarGrid"),
    PolarAngleAxis: stub("PolarAngleAxis"),
    PolarRadiusAxis: stub("PolarRadiusAxis"),
  };
});

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock, localCoverMock } from "../test/apiMock";
import { useApp } from "../store";
import Dashboard from "./Dashboard";
import { defaultSettings, makeAnalytics, makeMini, makeProfile } from "../test/utils";

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/game/:id" element={<div>detail-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function chart(container: HTMLElement, name: string) {
  const el = container.querySelector(`[data-chart="${name}"]`);
  return el ? (JSON.parse(el.getAttribute("data-props")!) as Record<string, unknown>) : null;
}

beforeEach(() => {
  localCoverMock.mockReset().mockResolvedValue(null);
  apiMock.getAnalytics.mockReset().mockResolvedValue(makeAnalytics());
  useApp.setState({
    profile: makeProfile(),
    profileLoading: false,
    settings: defaultSettings(),
  });
});

describe("Dashboard — loading and stats", () => {
  it("shows a pulse skeleton while analytics load", () => {
    apiMock.getAnalytics.mockReturnValueOnce(new Promise(() => {}));
    renderDashboard();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("My gaming dashboard")).toBeNull();
  });

  it("requests analytics on mount and renders the four stat cards", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        totalGames: 12,
        favourites: 3,
        totalPlaytimeMinutes: 605,
        avgStars: 3.8,
        avgOverall: 82.44,
      }),
    );
    renderDashboard();
    expect(await screen.findByText("My gaming dashboard")).toBeInTheDocument();
    expect(apiMock.getAnalytics).toHaveBeenCalledWith("both");
    expect(screen.getByText("Games tracked").nextElementSibling).toHaveTextContent("12");
    expect(screen.getByText("Favourites").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Total playtime").nextElementSibling).toHaveTextContent("10h 5m");
    expect(screen.getByText("Avg detailed score").nextElementSibling).toHaveTextContent(
      "82.4 / 100",
    );
  });

  it("shows an em dash for the average score when nothing is rated", async () => {
    renderDashboard();
    expect(await screen.findByText("My gaming dashboard")).toBeInTheDocument();
    expect(screen.getByText("Avg detailed score").nextElementSibling).toHaveTextContent("—");
  });

  it("renders play-status bars as percentages of the total", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        totalGames: 8,
        statusCounts: [
          { status: "Playing", count: 2 },
          { status: "Completed", count: 6 },
        ],
      }),
    );
    const { container } = renderDashboard();
    await screen.findByText("My gaming dashboard");
    const bars = container.querySelectorAll(".h-full");
    // rows render in fixed order: WantToPlay, Playing, Completed, Dropped
    expect(bars[0]).toHaveStyle({ width: "0%" });
    expect(bars[1]).toHaveStyle({ width: "25%" });
    expect(bars[2]).toHaveStyle({ width: "75%" });
    expect(bars[3]).toHaveStyle({ width: "0%" });
  });
});

describe("Dashboard — conditional sections", () => {
  it("shows the distribution empty state and the onboarding panel when nothing is rated", async () => {
    renderDashboard();
    expect(await screen.findByText("No star ratings yet.")).toBeInTheDocument();
    expect(screen.getByText("Start rating games")).toBeInTheDocument();
    expect(screen.queryByText("Category Profile")).toBeNull();
    // the detailed-score panel lives inside the has-ratings section
    expect(screen.queryByText("No detailed scores yet.")).toBeNull();
    expect(screen.queryByText(/Rating trend/)).toBeNull();
    expect(chart(document.body, "BarChart")).toBeNull();
  });

  it("renders the star distribution with tiered bar colours", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        avgStars: 3.5,
        starDistribution: [
          { x: 1, y: 2 },
          { x: 2, y: 1 },
          { x: 3, y: 0 },
          { x: 4, y: 5 },
          { x: 5, y: 3 },
        ],
      }),
    );
    const { container } = renderDashboard();
    await screen.findByText("My gaming dashboard");
    const barChart = chart(container, "BarChart");
    expect(barChart).not.toBeNull();
    expect(barChart!.data).toHaveLength(5);
    const fills = Array.from(container.querySelectorAll("[data-chart='Cell']")).map(
      (c) => (JSON.parse(c.getAttribute("data-props")!) as { fill: string }).fill,
    );
    expect(fills).toEqual([
      "#fb7185", // 1 → rose
      "#fbbf24", // 2 → amber
      "#fbbf24", // 3 → amber
      "#34d399", // 4 → emerald
      "#34d399", // 5 → emerald
    ]);
  });

  it("renders the radar only when a category average exists", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        avgOverall: 60,
        categoryAverages: { gameplay: 55, story: null, music: null, technical: null },
      }),
    );
    renderDashboard();
    await screen.findByText("My gaming dashboard");
    expect(screen.getByText("Category Profile")).toBeInTheDocument();
    const radar = chart(document.body, "RadarChart");
    expect(radar).not.toBeNull();
    expect((radar!.data as unknown[]).length).toBe(4);
  });

  it("hides detailed-score chart data when every bucket is zero", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        avgOverall: 60,
        // the section needs at least one category average to render at all
        categoryAverages: { gameplay: 50, story: null, music: null, technical: null },
        scoreDistribution: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      }),
    );
    renderDashboard();
    await screen.findByText("My gaming dashboard");
    expect(screen.getByText("No detailed scores yet.")).toBeInTheDocument();
  });

  it("renders trend charts only from two months onward", async () => {
    const trend = [
      { month: "2026-01", avgOverall: 60, avgStars: 3, count: 2 },
      { month: "2026-02", avgOverall: 70, avgStars: 4, count: 3 },
    ];
    const first = renderDashboard();
    await screen.findByText("My gaming dashboard");
    expect(screen.queryByText(/Rating trend/)).toBeNull();
    first.unmount();

    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({ avgOverall: 70, ratingTrend: trend, categoryTrend: trend }),
    );
    const { container } = renderDashboard();
    await screen.findByText("My gaming dashboard");
    expect(screen.getByText(/Rating trend/)).toBeInTheDocument();
    expect(chart(container, "Line")).not.toBeNull();
  });

  it("shows Then vs Now deltas, colour-coded, with em dashes for nulls", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        avgOverall: 60,
        firstVsRecent: {
          firstQuartile: { gameplay: 50, story: 60, music: 40, technical: null },
          recentQuartile: { gameplay: 58, story: 56.5, music: 40.5, technical: 70 },
        },
      }),
    );
    renderDashboard();
    await screen.findByText("My gaming dashboard");
    expect(screen.getByText("+8.0 since you started")).toHaveClass("text-emerald-400");
    expect(screen.getByText("-3.5 since you started")).toHaveClass("text-rose-400");
    expect(screen.getByText("+0.5 since you started")).toHaveClass("text-slate-500");
    // technical: recent 70, first null → delta shows an em dash
    expect(screen.getByText("70.0")).toBeInTheDocument();
  });
});

describe("Dashboard — breakdowns and lists", () => {
  it("renders genre bars sized relative to the biggest genre", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        genreBreakdown: [
          { label: "RPG", count: 10, avgStars: 4, avgOverall: 78.4, totalPlaytime: 100 },
          { label: "Indie", count: 5, avgStars: null, avgOverall: null, totalPlaytime: 50 },
        ],
        recentlyRated: [makeMini({ entryId: 9, name: "Recent Game" })],
      }),
    );
    renderDashboard();
    await screen.findByText("My gaming dashboard");
    // the width style sits on the inner fill div
    expect(screen.getByText("RPG").nextElementSibling!.firstElementChild).toHaveStyle({
      width: "100%",
    });
    expect(screen.getByText("Indie").nextElementSibling!.firstElementChild).toHaveStyle({
      width: "50%",
    });
    expect(screen.getByText("· 78")).toHaveClass("text-emerald-300");

    // clicking a recently-rated game opens its detail page
    fireEvent.click(screen.getByText("Recent Game"));
    expect(screen.getByText("detail-page")).toBeInTheDocument();
  });

  it("ranks by the selected rating mode and refetches analytics", async () => {
    const ranked = makeAnalytics({
      highestRated: [makeMini({ entryId: 1, stars: 5, overall: 90 })],
      lowestRated: [makeMini({ entryId: 2, stars: 1, overall: 20 })],
    });
    apiMock.getAnalytics.mockResolvedValueOnce(ranked).mockResolvedValue(ranked);
    renderDashboard();
    await screen.findByText("My gaming dashboard");
    expect(screen.getByText("needs both ratings")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Rank by ★ simple rating"));
    expect(await screen.findByText("by star rating")).toBeInTheDocument();
    expect(apiMock.getAnalytics).toHaveBeenLastCalledWith("stars");
    // mode "stars": overall values hidden, stars shown
    expect(screen.getByTitle("5 / 5 stars")).toBeInTheDocument();
    expect(screen.queryByText("90.0")).toBeNull();

    fireEvent.click(screen.getByTitle("Rank by ◆ detailed rating"));
    expect(await screen.findByText("by detailed score")).toBeInTheDocument();
    expect(apiMock.getAnalytics).toHaveBeenLastCalledWith("detailed");
    // mode "detailed": stars hidden, overall shown
    expect(screen.queryByTitle("5 / 5 stars")).toBeNull();
    expect(screen.getByText("90.0")).toBeInTheDocument();
  });

  it("shows gut-feeling and on-reflection lists only when non-empty", async () => {
    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        gutFeelingGames: [makeMini({ entryId: 3, name: "Loved It" })],
      }),
    );
    const { unmount } = renderDashboard();
    await screen.findByText("Loved It");
    // the grid shows both panels once either list is non-empty…
    expect(screen.getByText(/Gut-feeling picks/)).toBeInTheDocument();
    expect(screen.getByText(/On-reflection picks/)).toBeInTheDocument();
    // …but only the populated one lists games
    expect(screen.queryByText("Grew On Me")).toBeNull();
    unmount();

    apiMock.getAnalytics.mockResolvedValueOnce(
      makeAnalytics({
        onReflectionGames: [makeMini({ entryId: 4, name: "Grew On Me" })],
      }),
    );
    renderDashboard();
    await screen.findByText("Grew On Me");
    expect(screen.queryByText("Loved It")).toBeNull();
  });

  it("shows an error banner with retry when the initial analytics load fails", async () => {
    apiMock.getAnalytics.mockRejectedValueOnce(new Error("no analytics"));
    renderDashboard();
    const banner = await screen.findByText(/Could not load analytics/);
    expect(banner).toHaveTextContent("no analytics");
    // the error state replaces the skeleton instead of pulsing forever
    expect(document.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByText("Games tracked")).toBeNull();

    // retrying without a remount recovers into the loaded dashboard
    apiMock.getAnalytics.mockResolvedValueOnce(makeAnalytics({ totalGames: 7 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Games tracked")).toBeInTheDocument();
    expect(screen.getByText("Games tracked").nextElementSibling).toHaveTextContent("7");
    expect(apiMock.getAnalytics).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Could not load analytics/)).toBeNull();
  });

  it("surfaces a refetch failure above the already-loaded stats", async () => {
    const ranked = makeAnalytics({
      highestRated: [makeMini({ entryId: 1, stars: 5, overall: 90 })],
      lowestRated: [makeMini({ entryId: 2, stars: 1, overall: 20 })],
    });
    apiMock.getAnalytics.mockResolvedValue(ranked);
    renderDashboard();
    await screen.findByText("My gaming dashboard");
    apiMock.getAnalytics.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByTitle("Rank by ★ simple rating"));
    expect(await screen.findByText(/Could not load analytics/)).toHaveTextContent("boom");
    // the stale analytics stay visible under the banner
    expect(screen.getByText("Games tracked")).toBeInTheDocument();
  });
});
