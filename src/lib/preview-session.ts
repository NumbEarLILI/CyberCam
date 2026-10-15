/** The browser keeps a frozen frame when Android takes the camera away. */
export function liveTrackEnded(track: { readyState: string } | null | undefined) {
  return track == null || track.readyState === "ended";
}

/** A stream that was open and then lost. No stream yet means the camera is still starting. */
export function streamNeedsRestart(stream: { getVideoTracks(): { readyState: string }[] } | null) {
  if (!stream) return false;
  return liveTrackEnded(stream.getVideoTracks()[0]);
}
