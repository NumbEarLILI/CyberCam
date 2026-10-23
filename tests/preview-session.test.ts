import { describe, expect, it } from "vitest";
import { liveTrackEnded, streamNeedsRestart } from "../src/lib/preview-session";

describe("live preview resume", () => {
  it("reopens when the camera track has been taken away", () => {
    expect(liveTrackEnded(null)).toBe(true);
    expect(liveTrackEnded(undefined)).toBe(true);
    expect(liveTrackEnded({ readyState: "ended" })).toBe(true);
    expect(liveTrackEnded({ readyState: "live" })).toBe(false);
  });

  it("does not restart a camera that has not opened yet", () => {
    expect(streamNeedsRestart(null)).toBe(false);
    expect(streamNeedsRestart({ getVideoTracks: () => [{ readyState: "live" }] })).toBe(false);
    expect(streamNeedsRestart({ getVideoTracks: () => [{ readyState: "ended" }] })).toBe(true);
    expect(streamNeedsRestart({ getVideoTracks: () => [] })).toBe(true);
  });
});
