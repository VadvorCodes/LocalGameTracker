import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { localCoverMock } from "../test/apiMock";
import CoverImage from "./CoverImage";

beforeEach(() => {
  localCoverMock.mockReset().mockResolvedValue(null);
});

describe("CoverImage", () => {
  it("shows a static placeholder when there is no URL, without a cache round-trip", () => {
    render(<CoverImage url={null} alt="Cover art" />);
    expect(screen.getByText("No cover art")).toBeInTheDocument();
    expect(screen.queryByText("Cover art")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(localCoverMock).not.toHaveBeenCalled();
  });

  it("renders the resolved local cover", async () => {
    localCoverMock.mockResolvedValue("asset://localhost/cached.jpg");
    render(<CoverImage url="https://example.com/a.jpg" alt="Hollow Knight" />);
    await waitFor(() =>
      expect(screen.getByAltText("Hollow Knight")).toHaveAttribute(
        "src",
        "asset://localhost/cached.jpg",
      ),
    );
  });

  it("falls back to the remote URL when nothing resolves", async () => {
    localCoverMock.mockResolvedValue(null);
    render(<CoverImage url="https://example.com/a.jpg" alt="Hollow Knight" />);
    await waitFor(() =>
      expect(screen.getByAltText("Hollow Knight")).toHaveAttribute(
        "src",
        "https://example.com/a.jpg",
      ),
    );
  });

  it("swaps to a placeholder showing the alt text when the image errors", async () => {
    localCoverMock.mockResolvedValue("asset://localhost/cached.jpg");
    render(<CoverImage url="https://example.com/a.jpg" alt="Hollow Knight" />);
    const img = await screen.findByAltText("Hollow Knight");
    fireEvent.error(img);
    expect(screen.getByText("Hollow Knight")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("re-resolves when the URL changes", async () => {
    localCoverMock.mockResolvedValue("asset://localhost/one.jpg");
    const { rerender } = render(<CoverImage url="https://example.com/1.jpg" alt="x" />);
    await waitFor(() =>
      expect(screen.getByAltText("x")).toHaveAttribute("src", "asset://localhost/one.jpg"),
    );

    localCoverMock.mockResolvedValue("asset://localhost/two.jpg");
    rerender(<CoverImage url="https://example.com/2.jpg" alt="x" />);
    await waitFor(() =>
      expect(screen.getByAltText("x")).toHaveAttribute("src", "asset://localhost/two.jpg"),
    );
    expect(localCoverMock).toHaveBeenCalledTimes(2);
  });
});
