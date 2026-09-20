import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-sm tracking-widest text-pickle-400">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Out of bounds</h1>
      <p className="mt-2 max-w-sm text-sm text-white/50">
        We couldn&rsquo;t find that page. It may have been moved, or the link may be out of date.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/">
          <Button>Back home</Button>
        </Link>
        <Link href="/book">
          <Button variant="secondary">Book a court</Button>
        </Link>
      </div>
    </div>
  );
}
