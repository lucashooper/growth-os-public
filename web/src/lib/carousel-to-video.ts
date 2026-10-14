/**
 * Turn carousel slide data-URLs into a short silent video for TikTok Inbox upload
 * (video.upload → /v2/post/publish/inbox/video/init/).
 *
 * TikTok requires: 23–60 FPS, ≥3s duration, min 360px, WebM/MP4.
 * @see https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
 */
export async function encodeSlidesToVideoBlob(
  dataUrls: string[],
  opts?: { secondsPerSlide?: number; width?: number; height?: number },
): Promise<{ blob: Blob; contentType: string; filename: string; durationSec: number }> {
  if (!dataUrls.length) throw new Error("No slides to encode");

  // TikTok rejects <23 FPS (frame_rate_check_failed). Keep a constant 30.
  const width = opts?.width ?? 720;
  const height = opts?.height ?? 1280;
  const fps = 30;
  const minDurationSec = 3.5;
  const maxDurationSec = 58;
  const requested =
    (opts?.secondsPerSlide ?? 2.5) * dataUrls.length;
  const totalDuration = Math.min(
    maxDurationSec,
    Math.max(minDurationSec, requested),
  );
  const secondsPerSlide = totalDuration / dataUrls.length;
  const totalFrames = Math.round(totalDuration * fps);

  const images = await Promise.all(
    dataUrls.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () =>
            reject(new Error("Failed to decode slide for video"));
          img.src = src;
        }),
    ),
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas unavailable for video encode");

  function paintSlide(img: HTMLImageElement) {
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, width, height);
    const scale = Math.min(
      width / img.naturalWidth,
      height / img.naturalHeight,
    );
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx!.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  }

  // Prime first frame before captureStream so the track has content
  paintSlide(images[0]!);

  const stream = canvas.captureStream(fps);
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack && "contentHint" in videoTrack) {
    try {
      (videoTrack as MediaStreamTrack & { contentHint: string }).contentHint =
        "motion";
    } catch {
      /* ignore */
    }
  }

  const mimeCandidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  const mimeType =
    mimeCandidates.find(
      (m) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    ) || "";
  if (!mimeType) {
    throw new Error(
      "This browser cannot encode video for TikTok drafts. Try Chrome/Edge.",
    );
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));
  });

  recorder.start(100);

  const frameMs = 1000 / fps;
  const start = performance.now();
  for (let frame = 0; frame < totalFrames; frame++) {
    const slideIndex = Math.min(
      images.length - 1,
      Math.floor(frame / (secondsPerSlide * fps)),
    );
    paintSlide(images[slideIndex]!);

    // Request a new frame from captureStream when available (Chrome)
    const canvasWithCapture = canvas as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    void canvasWithCapture;

    const target = start + (frame + 1) * frameMs;
    const wait = target - performance.now();
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  // Hold last frame a beat so MediaRecorder flushes
  await new Promise((r) => setTimeout(r, frameMs * 2));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await stopped;

  const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
  if (blob.size < 1000) {
    throw new Error("Encoded video was empty — try again in Chrome");
  }
  const contentType = blob.type || "video/webm";
  const filename = contentType.includes("mp4")
    ? "inbox-draft.mp4"
    : "inbox-draft.webm";
  return { blob, contentType, filename, durationSec: totalDuration };
}
