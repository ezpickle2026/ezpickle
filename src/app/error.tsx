"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Technical detail stays in the console/monitoring, never on screen.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-white">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-white/50">
        That&rsquo;s on us. Try again in a moment — if it keeps happening, give the front desk a
        call and we&rsquo;ll sort it out.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
