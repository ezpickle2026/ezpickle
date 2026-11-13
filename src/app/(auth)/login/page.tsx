import { Suspense } from "react";
import { enabledProviders } from "@/lib/oauth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm providers={enabledProviders()} />
    </Suspense>
  );
}
