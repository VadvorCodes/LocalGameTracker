import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

vi.mock("../../api", async () => {
  const m = await import("../../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { localCoverMock } from "../../test/apiMock";
import SwipeCard from "./SwipeCard";
import { firePointer, makePoolItem } from "../../test/utils";
import type { RerateDecision } from "../../types";

beforeEach(() => {
  localCoverMock.mockReset();
  localCoverMock.mockResolvedValue(null);
});

function renderCard(overrides: { exitRequest?: RerateDecision | null } = {}) {
  const onDecided = vi.fn();
  const onDragX = vi.fn();
  const item = makePoolItem({
    name: "Hollow Knight",
    starRating: 4.5,
    computedOverall: 87.7,
    playtimeMinutes: 125,
    genres: ["Metroidvania", "Indie", "Action", "Adventure", "RPG"],
  });
  const view = render(
    <SwipeCard
      item={item}
      exitRequest={overrides.exitRequest ?? null}
      onDecided={onDecided}
      onDragX={onDragX}
    />,
  );
  const card = view.container.querySelector<HTMLElement>(".card")!;
  return { onDecided, onDragX, card, view, item };
}

/** Drag from x0 to x1 and release. */
function drag(card: HTMLElement, x0: number, x1: number) {
  firePointer(card, "pointerdown", x0, 200);
  firePointer(card, "pointermove", x0 + Math.round((x1 - x0) / 2), 200);
  firePointer(card, "pointermove", x1, 200);
  firePointer(card, "pointerup", x1, 200);
}

function transitionEnd(card: HTMLElement, propertyName: string) {
  const evt = new Event("transitionend", { bubbles: true });
  Object.defineProperty(evt, "propertyName", { value: propertyName });
  fireEvent(card, evt);
}

describe("SwipeCard rendering", () => {
  it("shows name, status, gut stars, detailed score, playtime and first 4 genres", () => {
    const { card } = renderCard();
    expect(card.textContent).toContain("Hollow Knight");
    expect(card.textContent).toContain("Playing");
    expect(card.querySelector('[title="4.5 / 5 stars"]')).toBeInTheDocument();
    expect(card.textContent).toContain("87.7/100");
    expect(card.textContent).toContain("2h 5m");
    expect(card.textContent).toContain("Metroidvania · Indie · Action · Adventure");
    expect(card.textContent).not.toContain("RPG");
  });

  it("says 'no detailed score' when computedOverall is null", () => {
    const item = makePoolItem({ computedOverall: null });
    const { container } = render(<SwipeCard item={item} exitRequest={null} onDecided={() => {}} />);
    expect(container.textContent).toContain("no detailed score");
  });
});

describe("SwipeCard drag decisions", () => {
  it("does not commit below the 110px threshold and springs back", () => {
    const { card, onDecided, onDragX } = renderCard();
    drag(card, 300, 300 - 109); // 109px left — one pixel short
    expect(onDecided).not.toHaveBeenCalled();
    expect(card.style.transform).toBe("translateX(0px) rotate(0deg)");
    expect(onDragX).toHaveBeenLastCalledWith(0);
  });

  it("commits 'rerate' at exactly -110px (boundary inclusive)", () => {
    const { card, onDecided } = renderCard();
    drag(card, 300, 300 - 110);
    expect(card.style.transform).toContain("translateX(-700px)");
    transitionEnd(card, "transform");
    expect(onDecided).toHaveBeenCalledWith("rerate");
  });

  it("commits 'keep' past +110px", () => {
    const { card, onDecided } = renderCard();
    drag(card, 300, 300 + 200);
    expect(card.style.transform).toContain("translateX(700px)");
    expect(card.style.transform).toContain("rotate(16deg)");
    transitionEnd(card, "transform");
    expect(onDecided).toHaveBeenCalledWith("keep");
  });

  it("ignores pointerup when no drag started", () => {
    const { card, onDecided, onDragX } = renderCard();
    firePointer(card, "pointerup", 300, 200);
    expect(onDecided).not.toHaveBeenCalled();
    expect(onDragX).not.toHaveBeenCalled();
  });

  it("reports drag position through onDragX while moving", () => {
    const { card, onDragX } = renderCard();
    firePointer(card, "pointerdown", 300, 200);
    firePointer(card, "pointermove", 260, 200);
    expect(onDragX).toHaveBeenLastCalledWith(-40);
    firePointer(card, "pointermove", 330, 200);
    expect(onDragX).toHaveBeenLastCalledWith(30);
  });

  it("does not start a new drag while flying out", () => {
    const { card, onDragX } = renderCard();
    drag(card, 300, 450); // commit keep
    const transform = card.style.transform;
    firePointer(card, "pointerdown", 300, 200);
    firePointer(card, "pointermove", 100, 200);
    expect(card.style.transform).toBe(transform); // unchanged
    expect(onDragX).toHaveBeenLastCalledWith(700); // from the fly-out, not the move
  });
});

describe("SwipeCard programmatic decisions", () => {
  it("flies out on an exitRequest and reports the direction", () => {
    const { card, onDecided, onDragX, view } = renderCard();
    view.rerender(
      <SwipeCard
        item={makePoolItem({ name: "Hollow Knight" })}
        exitRequest="rerate"
        onDecided={onDecided}
        onDragX={onDragX}
      />,
    );
    expect(card.style.transform).toContain("translateX(-700px)");
    expect(onDragX).toHaveBeenCalledWith(-700);
    transitionEnd(card, "transform");
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(onDecided).toHaveBeenCalledWith("rerate");
  });

  it("does not fly again when the decision changes mid-flight", () => {
    const { card, onDecided, view } = renderCard();
    view.rerender(
      <SwipeCard
        item={makePoolItem()}
        exitRequest="keep"
        onDecided={onDecided}
        onDragX={() => {}}
      />,
    );
    view.rerender(
      <SwipeCard
        item={makePoolItem()}
        exitRequest="rerate"
        onDecided={onDecided}
        onDragX={() => {}}
      />,
    );
    expect(card.style.transform).toContain("translateX(700px)"); // still flying keep
    transitionEnd(card, "transform");
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(onDecided).toHaveBeenCalledWith("keep");
  });

  it("commits the decision exactly once, ignoring non-transform transitions", () => {
    const { card, onDecided } = renderCard();
    drag(card, 300, 450);
    transitionEnd(card, "opacity"); // e.g. the opacity change also transitions
    transitionEnd(card, "transform");
    transitionEnd(card, "transform");
    expect(onDecided).toHaveBeenCalledTimes(1);
  });

  it("does not react to a transition end while not flying", () => {
    const { card, onDecided } = renderCard();
    // spring-back after a short drag also ends a transform transition
    drag(card, 300, 320);
    transitionEnd(card, "transform");
    expect(onDecided).not.toHaveBeenCalled();
  });
});
