// Controls the device's torch (flashlight) via the MediaStreamTrack API.
// Torch support is NOT universal — desktop browsers and iOS Safari
// generally don't expose it; most Android Chrome/rear cameras do.
// Every function here is defensive: if unsupported, they no-op safely
// rather than throwing, so calling code never needs try/catch of its own.

export function getVideoTrack(stream) {
  if (!stream) return null;
  const tracks = stream.getVideoTracks();
  return tracks.length > 0 ? tracks[0] : null;
}

export function isTorchSupported(track) {
  if (!track || typeof track.getCapabilities !== "function") return false;
  try {
    const capabilities = track.getCapabilities();
    return !!capabilities.torch;
  } catch {
    return false; // some browsers throw on getCapabilities() itself
  }
}

export async function setTorch(track, on) {
  if (!isTorchSupported(track)) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: !!on }] });
    return true;
  } catch (err) {
    console.error("⚡ Flashlight toggle failed:", err);
    return false;
  }
}
