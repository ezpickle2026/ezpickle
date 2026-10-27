"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Slide = {
  id: string;
  url: string;
  title?: string | null;
  caption?: string | null;
};

/**
 * Facility slideshow. Images come from the database via /api/facility-images —
 * nothing here is hardcoded. Crossfade plus a slow Ken Burns push, both
 * disabled when the visitor prefers reduced motion.
 */
export function Slideshow({ slides, interval = 6000 }: { slides: Slide[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();

  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (paused || reduced || slides.length < 2) return;
    const timer = setInterval(() => go(1), interval);
    return () => clearInterval(timer);
  }, [paused, reduced, slides.length, interval, go]);

  if (slides.length === 0) return null;
  const slide = slides[index];

  return (
    <div
      className="group relative aspect-[16/10] w-full overflow-hidden rounded-3xl border border-white/10 bg-ink-card sm:aspect-[16/7]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Facility photos"
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0, scale: reduced ? 1 : 1.0 }}
          animate={{ opacity: 1, scale: reduced ? 1 : 1.05 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.9, ease: "easeInOut" },
            scale: { duration: interval / 1000 + 1, ease: "linear" },
          }}
          className="absolute inset-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.url}
            alt={slide.title ?? "EzPickle facility"}
            className="size-full object-cover"
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${slide.id}-text`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            {slide.title && (
              <h3 className="text-xl font-bold tracking-tight sm:text-2xl">{slide.title}</h3>
            )}
            {slide.caption && (
              <p className="mt-1 max-w-lg text-sm text-white/65">{slide.caption}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-ink/60 text-white/80 opacity-0 backdrop-blur transition hover:bg-ink/80 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 sm:left-5"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-ink/60 text-white/80 opacity-0 backdrop-blur transition hover:bg-ink/80 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 sm:right-5"
          >
            <ChevronRight size={20} />
          </button>

          <div className="absolute right-5 top-5 flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-6 bg-pickle-500" : "w-1.5 bg-white/40 hover:bg-white/70",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
