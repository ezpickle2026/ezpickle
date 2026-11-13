"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, VideoOff } from "lucide-react";
import { useBrand } from "@/components/brand";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export type CamStreamType = "HLS" | "MP4" | "MJPEG" | "EMBED";

/**
 * Pickle Cam player. Plays HLS (via hls.js where the browser has no native
 * support), MP4, MJPEG and vendor iframe embeds, with the business logo and
 * name on a rail down the side of the picture. Fullscreen enlarges the whole
 * frame, so the branding stays on screen there too.
 */
export function CamPlayer({
  src,
  type,
  poster,
  live = false,
  caption,
  className,
}: {
  src: string;
  type: CamStreamType;
  poster?: string | null;
  live?: boolean;
  caption?: string;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => setFailed(false), [src]);

  // HLS: Safari plays .m3u8 natively, everyone else needs hls.js.
  useEffect(() => {
    const el = video.current;
    if (!el || type !== "HLS") return;
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = src;
      return;
    }
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    void import("hls.js").then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        setFailed(true);
        return;
      }
      const instance = new Hls({ lowLatencyMode: live });
      instance.on(Hls.Events.ERROR, (_e, data) => data.fatal && setFailed(true));
      instance.loadSource(src);
      instance.attachMedia(el);
      hls = instance;
    });
    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [src, type, live]);

  useEffect(() => {
    const onChange = () => {
      // The browser's own video fullscreen would hide the branding: swap it
      // for fullscreen on the whole frame instead.
      if (document.fullscreenElement && document.fullscreenElement === video.current) {
        void document.exitFullscreen().then(() => frame.current?.requestFullscreen?.());
        return;
      }
      setFullscreen(document.fullscreenElement === frame.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen?.();
  }

  const isVideo = type === "HLS" || type === "MP4";

  return (
    <div
      ref={frame}
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10",
        fullscreen && "rounded-none ring-0",
        className,
      )}
    >
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-white/55">
          <VideoOff size={28} aria-hidden />
          {live ? "The live feed isn't reachable right now." : "This video couldn't be played."}
        </div>
      ) : isVideo ? (
        <video
          ref={video}
          key={src}
          src={type === "MP4" ? src : undefined}
          poster={poster ?? undefined}
          controls
          controlsList="nofullscreen"
          playsInline
          autoPlay={live}
          muted={live}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-contain"
        />
      ) : type === "MJPEG" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={caption ?? "Court camera"}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-contain"
        />
      ) : (
        <iframe
          key={src}
          src={src}
          title={caption ?? "Court camera"}
          allow="autoplay; fullscreen; picture-in-picture"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full border-0"
        />
      )}

      <BrandRail live={live} caption={caption} />

      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 rounded-full bg-black/55 p-2 text-white/80 opacity-100 backdrop-blur transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        aria-label={fullscreen ? "Exit full screen" : "Full screen"}
      >
        {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
    </div>
  );
}

/** Logo + business name down the left edge. Never blocks clicks on the video. */
function BrandRail({ live, caption }: { live: boolean; caption?: string }) {
  const { businessName, logoUrl } = useBrand();
  const name = businessName.trim() || "EzPickle";
  const custom = logoUrl !== "" && logoUrl !== "/logo.png";

  return (
    <div
      className="pointer-events-none absolute bottom-12 left-0 top-0 flex w-11 flex-col items-center gap-2 bg-gradient-to-r from-black/75 via-black/40 to-transparent py-2 sm:w-16 sm:gap-3 sm:py-4"
      aria-hidden
    >
      {custom ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-8 rounded-md object-contain sm:size-10" />
      ) : (
        <Logo showWordmark={false} className="scale-75 sm:scale-110" />
      )}
      <span
        className="min-h-0 flex-1 overflow-hidden whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/90 drop-shadow sm:text-[13px] sm:tracking-[0.22em]"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {name}
        {caption ? <span className="hidden font-semibold text-pickle-400 sm:inline"> · {caption}</span> : null}
      </span>
      <span
        className={cn(
          "rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider sm:text-[10px]",
          live ? "animate-pulse bg-red-500 text-white" : "bg-pickle-500 text-ink",
        )}
      >
        {live ? "Live" : "Cam"}
      </span>
    </div>
  );
}
