import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12 text-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
