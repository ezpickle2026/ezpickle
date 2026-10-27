"use client";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Users } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "./ui/button";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  // Very small parallax: the background drifts slightly slower than the page.
  const bgY = useTransform(scrollY, [0, 600], [0, 90]);

  const step = (delay: number) => ({
    initial: reduced ? {} : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay: reduced ? 0 : delay, ease: EASE },
  });

  return (
    <section className="relative overflow-hidden">
      <motion.div
        style={reduced ? undefined : { y: bgY }}
        className="ezp-parallax pointer-events-none absolute inset-0 -z-10"
        aria-hidden
      >
        <div className="ezp-grid-lines absolute inset-0 opacity-60" />
        <motion.div
          animate={reduced ? undefined : { x: [0, 60, 0], y: [0, -40, 0], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-24 top-10 size-[28rem] rounded-full bg-pickle-500/20 blur-[110px]"
        />
        <motion.div
          animate={reduced ? undefined : { x: [0, -50, 0], y: [0, 50, 0], opacity: [0.25, 0.4, 0.25] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-20 bottom-0 size-[24rem] rounded-full bg-pickle-700/25 blur-[120px]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink" />
      </motion.div>

      <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
        <motion.div
          initial={reduced ? {} : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: reduced ? 0 : 0.2, ease: EASE }}
        >
          <Logo className="scale-110 origin-left" />
        </motion.div>

        <motion.h1
          {...step(0.35)}
          className="mt-7 max-w-3xl text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
        >
          Play Easy.
          <br />
          Play More.
          <br />
          <span className="text-pickle-500">Play EzPickle.</span>
        </motion.h1>

        <motion.p {...step(0.5)} className="mt-6 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
          Four championship courts, live availability, and Open Play nights that sort themselves out.
          Reserve in under a minute and pay with GCash, Maya or card.
        </motion.p>

        <motion.div {...step(0.65)} className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/book">
            <Button size="lg">
              Book a Court
              <ArrowRight size={18} aria-hidden />
            </Button>
          </Link>
          <Link href="/open-play">
            <Button size="lg" variant="secondary">
              <Users size={18} aria-hidden />
              Join Open Play
            </Button>
          </Link>
        </motion.div>

        <motion.dl {...step(0.8)} className="mt-14 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            ["4", "Courts"],
            ["6am–11pm", "Open daily"],
            ["60s", "To book"],
            ["₱400+", "Per hour"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="text-xl font-bold text-pickle-400 sm:text-2xl">{value}</dt>
              <dd className="mt-0.5 text-xs uppercase tracking-wider text-white/40">{label}</dd>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}
