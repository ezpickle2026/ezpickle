"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Wind, Home } from "lucide-react";
import { Badge } from "./ui/primitives";
import { peso } from "@/lib/utils";

export function CourtCard(props: {
  name: string;
  number: number;
  description?: string | null;
  indoor: boolean;
  surface: string;
  status: string;
  hourlyPrice: number;
  amenities: string[];
  imageUrl?: string | null;
}) {
  const unavailable = props.status !== "AVAILABLE";

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="group h-full overflow-hidden rounded-2xl border border-white/10 bg-ink-card transition-colors hover:border-pickle-500/40 hover:shadow-glow"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-soft">
        {props.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.imageUrl}
            alt={props.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="ezp-grid-lines grid size-full place-items-center text-5xl font-extrabold text-white/8">
            {props.number}
          </div>
        )}
        <div className="absolute left-3 top-3">
          <Badge tone={unavailable ? "amber" : "green"}>
            {unavailable ? props.status.toLowerCase() : "available"}
          </Badge>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">{props.name}</h3>
          <span className="text-sm font-bold text-pickle-400">
            {peso(props.hourlyPrice)}
            <span className="text-xs font-medium text-white/35">/hr</span>
          </span>
        </div>

        <p className="mt-1.5 line-clamp-2 min-h-[2.4rem] text-[13px] leading-snug text-white/45">
          {props.description ?? `${props.surface.toLowerCase()} surface`}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/40">
          <span className="inline-flex items-center gap-1">
            {props.indoor ? <Home size={12} aria-hidden /> : <Wind size={12} aria-hidden />}
            {props.indoor ? "Indoor" : "Outdoor"}
          </span>
          {props.amenities.slice(0, 2).map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>

        <Link
          href="/book"
          className="mt-4 block rounded-full bg-white/5 py-2 text-center text-[13px] font-semibold text-white/70 transition group-hover:bg-pickle-500 group-hover:text-ink"
        >
          Book this court
        </Link>
      </div>
    </motion.article>
  );
}
