import { Suspense } from "react";
import { enabledProviders } from "@/lib/oauth";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm providers={enabledProviders()} />
    </Suspense>
  );
}
