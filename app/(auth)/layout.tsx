import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="ezp-grid-lines pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center" aria-label="EzPickle home">
          <Logo className="h-9 w-auto" />
        </Link>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
