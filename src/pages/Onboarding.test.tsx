import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../api", async () => {
  const m = await import("../test/apiMock");
  return { api: m.apiMock, localCover: m.localCoverMock };
});

import { apiMock } from "../test/apiMock";
import { useApp } from "../store";
import Onboarding from "./Onboarding";
import { makeProfile } from "../test/utils";

beforeEach(() => {
  apiMock.createProfile.mockReset();
  useApp.setState({ profile: null, profileLoading: false });
});

describe("Onboarding", () => {
  it("renders the welcome card with an autofocus username input", () => {
    render(<Onboarding />);
    expect(screen.getByText("Welcome to GameTracker")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Choose a local username")).toHaveFocus();
  });

  it("keeps the submit disabled while the name is empty or whitespace", () => {
    render(<Onboarding />);
    const button = screen.getByRole("button", { name: "Start tracking" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Choose a local username"), {
      target: { value: "   " },
    });
    expect(button).toBeDisabled();
    expect(apiMock.createProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Choose a local username"), {
      target: { value: "alice" },
    });
    expect(button).toBeEnabled();
  });

  it("creates the profile and moves the app past onboarding", async () => {
    const profile = makeProfile({ username: "alice" });
    apiMock.createProfile.mockResolvedValueOnce(profile);
    render(<Onboarding />);
    fireEvent.change(screen.getByPlaceholderText("Choose a local username"), {
      target: { value: "alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    expect(apiMock.createProfile).toHaveBeenCalledWith("alice");
    await vi.waitFor(() => expect(useApp.getState().profile).toEqual(profile));
  });

  it("submits on Enter", async () => {
    apiMock.createProfile.mockResolvedValueOnce(makeProfile({ username: "bob" }));
    render(<Onboarding />);
    const input = screen.getByPlaceholderText("Choose a local username");
    fireEvent.change(input, { target: { value: "bob" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(apiMock.createProfile).toHaveBeenCalledWith("bob");
    await vi.waitFor(() => expect(useApp.getState().profile).not.toBeNull());
  });

  it("shows a Creating… label and locks the form while creating", () => {
    apiMock.createProfile.mockReturnValueOnce(new Promise(() => {}));
    render(<Onboarding />);
    fireEvent.change(screen.getByPlaceholderText("Choose a local username"), {
      target: { value: "carol" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  });

  it("shows an error and re-enables the form when creation fails", async () => {
    apiMock.createProfile.mockRejectedValueOnce(new Error("db locked"));
    render(<Onboarding />);
    fireEvent.change(screen.getByPlaceholderText("Choose a local username"), {
      target: { value: "carol" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));

    expect(await screen.findByText(/db locked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start tracking" })).toBeEnabled();
    expect(useApp.getState().profile).toBeNull();
  });
});
