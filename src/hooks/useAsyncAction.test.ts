import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsyncAction } from "./useAsyncAction";

describe("useAsyncAction", () => {
  it("starts idle with no error", () => {
    const { result } = renderHook(() => useAsyncAction());
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("flags pending while the action runs and resolves to its value", async () => {
    const { result } = renderHook(() => useAsyncAction());
    let resolve!: (value: string) => void;
    let promise!: Promise<string | undefined>;
    act(() => {
      promise = result.current.run(
        () =>
          new Promise<string>((r) => {
            resolve = r;
          }),
      );
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolve("done");
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
    await expect(promise).resolves.toBe("done");
  });

  it("captures a failed action's error as a string and resolves to undefined", async () => {
    const { result } = renderHook(() => useAsyncAction());
    let promise!: Promise<string | undefined>;
    await act(async () => {
      promise = result.current.run(async () => {
        throw new Error("boom");
      });
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe("boom");
    await expect(promise).resolves.toBeUndefined();
  });

  it("ignores a run while another is still in flight, and allows the next one after", async () => {
    const { result } = renderHook(() => useAsyncAction());
    let resolve!: () => void;
    const first = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    act(() => {
      void result.current.run(first);
    });

    const second = vi.fn(async () => "second");
    await act(async () => {
      await result.current.run(second);
    });
    expect(second).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolve();
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);

    let third!: Promise<string | undefined>;
    await act(async () => {
      third = result.current.run(second);
    });
    expect(second).toHaveBeenCalledTimes(1);
    await expect(third).resolves.toBe("second");
  });

  it("clears a previous error when a new run starts", async () => {
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      await result.current.run(async () => {
        throw new Error("first fails");
      });
    });
    expect(result.current.error).toBe("first fails");

    await act(async () => {
      await result.current.run(async () => "ok");
    });
    expect(result.current.error).toBeNull();
  });

  it("reset clears the captured error", async () => {
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      await result.current.run(async () => {
        throw new Error("boom");
      });
    });
    expect(result.current.error).toBe("boom");

    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });
});
