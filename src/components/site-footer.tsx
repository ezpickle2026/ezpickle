import Link from "next/link";
import { Logo } from "./logo";
import { getSettings } from "@/lib/settings";
import { formatTimeLabel } from "@/lib/time";

export async function SiteFooter() {
  const settings = await getSettings();

  return (
    <footer id="contact" className="border-t border-white/10 bg-ink-soft">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/50">
            Courts, Open Play and league nights in {settings.address.split(",")[0]}. Book online,
            pay with GCash, Maya or card, and just show up and play.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">Visit</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/50">
            <li>{settings.address}</li>
            <li>
              <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="hover:text-pickle-300">
                {settings.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${settings.email}`} className="hover:text-pickle-300">
                {settings.email}
              </a>
            </li>
            <li>
              Open daily {formatTimeLabel(settings.openingMin)} – {formatTimeLabel(settings.closingMin)}
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">Play</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/50">
            <li>
              <Link href="/book" className="hover:text-pickle-300">
                Book a court
              </Link>
            </li>
            <li>
              <Link href="/open-play" className="hover:text-pickle-300">
                Open Play
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-pickle-300">
                My bookings
              </Link>
            </li>
            <li>
              <Link href="/register" className="hover:text-pickle-300">
                Create an account
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {settings.businessName}. All rights reserved.</p>
          <p>All times shown in Philippine Standard Time (Asia/Manila).</p>
        </div>
      </div>
    </footer>
  );
}
