import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

vi.mock("../lib/themes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/themes")>();
  return { ...actual, applyTheme: vi.fn(actual.applyTheme) };
});

import { applyTheme, CUSTOM_THEME_ID } from "../lib/themes";
import CustomThemeEditor from "./CustomThemeEditor";

const applyThemeMock = vi.mocked(applyTheme);

// Deterministic rAF: queue callbacks and flush them explicitly, so the test
// does not depend on how jsdom schedules frames under fake timers.
let rafQueue: (FrameRequestCallback | null)[];
function flushRaf() {
  const pending = rafQueue;
  rafQueue = [];
  pending.forEach((cb) => cb?.(16));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.style.cssText = "";
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length - 1;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafQueue[id] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CustomThemeEditor", () => {
  it("shows the initial colours on both pickers", () => {
    const { container } = render(
      <CustomThemeEditor initial={{ base: "#0b0e14", accent: "#5b7cfa" }} onSettle={() => {}} />,
    );
    const pickers = container.querySelectorAll<HTMLInputElement>('input[type="color"]');
    expect(pickers[0].value).toBe("#0b0e14");
    expect(pickers[1].value).toBe("#5b7cfa");
    expect(container.textContent).toContain("#0b0e14");
    expect(container.textContent).toContain("#5b7cfa");
  });

  it("previews via a coalesced frame and settles once 400ms after the last change", () => {
    const onSettle = vi.fn();
    const { container } = render(
      <CustomThemeEditor initial={{ base: "#0b0e14", accent: "#5b7cfa" }} onSettle={onSettle} />,
    );
    const base = container.querySelector<HTMLInputElement>('input[type="color"]')!;

    fireEvent.change(base, { target: { value: "#102030" } });

    // live preview is rAF-coalesced: not applied until a frame runs
    expect(applyThemeMock).not.toHaveBeenCalled();
    flushRaf();
    expect(applyThemeMock).toHaveBeenCalledTimes(1);
    expect(applyThemeMock).toHaveBeenCalledWith(CUSTOM_THEME_ID, {
      base: "#102030",
      accent: "#5b7cfa",
    });
    expect(document.documentElement.style.getPropertyValue("--surface-950")).toBe("16 32 48");

    // not settled yet
    expect(onSettle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith({ base: "#102030", accent: "#5b7cfa" });
  });

  it("debounces rapid changes into a single settle with the final colours", () => {
    const onSettle = vi.fn();
    const { container } = render(
      <CustomThemeEditor initial={{ base: "#0b0e14", accent: "#5b7cfa" }} onSettle={onSettle} />,
    );
    const [base, accent] = container.querySelectorAll<HTMLInputElement>('input[type="color"]');

    fireEvent.change(base, { target: { value: "#111111" } });
    vi.advanceTimersByTime(200);
    fireEvent.change(accent, { target: { value: "#ff0000" } });
    flushRaf();
    vi.advanceTimersByTime(200);
    expect(onSettle).not.toHaveBeenCalled(); // the second change restarted the timer

    vi.advanceTimersByTime(200);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith({ base: "#111111", accent: "#ff0000" });
    expect(applyThemeMock).toHaveBeenLastCalledWith(CUSTOM_THEME_ID, {
      base: "#111111",
      accent: "#ff0000",
    });
  });

  it("drops a pending settle when unmounted", () => {
    const onSettle = vi.fn();
    const { container, unmount } = render(
      <CustomThemeEditor initial={{ base: "#0b0e14", accent: "#5b7cfa" }} onSettle={onSettle} />,
    );
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="color"]')!, {
      target: { value: "#111111" },
    });
    unmount();
    flushRaf();
    vi.advanceTimersByTime(1000);
    expect(onSettle).not.toHaveBeenCalled();
    expect(applyThemeMock).not.toHaveBeenCalled();
  });

  it("disables the pickers when disabled", () => {
    const { container } = render(
      <CustomThemeEditor
        initial={{ base: "#0b0e14", accent: "#5b7cfa" }}
        onSettle={() => {}}
        disabled
      />,
    );
    container.querySelectorAll<HTMLInputElement>('input[type="color"]').forEach((input) => {
      expect(input).toBeDisabled();
    });
    expect(container.firstElementChild).toHaveClass("pointer-events-none");
  });
});
