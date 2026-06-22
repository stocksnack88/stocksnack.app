"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function SignOutButton({ redirectTo = "/" }: { redirectTo?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-xs tracking-widest transition-colors"
      style={{ color: "rgba(0,255,65,0.5)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#00ff41")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(0,255,65,0.5)")}
    >
      {redirectTo === "/login" ? "SIGN OUT AND SWITCH ACCOUNT →" : "SIGN OUT"}
    </button>
  );
}
