"use client";

import { GL } from "@/components/gl";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
      <GL hovering />
      <div className="pointer-events-none absolute inset-0 bg-black/70" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />

      <main className="flex-1 flex items-start justify-center px-6 pt-48 pb-20 relative z-10">
        <div className="relative w-full max-w-md">
          <div
            className="absolute inset-0 -z-10 pointer-events-none rounded-3xl border border-white/20 opacity-30 blur-[90px]"
            style={{ background: "rgba(255,255,255,0.1)" }}
            aria-hidden="true"
          />
          <div className="relative rounded-3xl border border-white/10 shadow-[0_0_25px_rgba(255,255,255,0.05)] overflow-hidden">
            <div
              className="absolute inset-0 bg-white/20 opacity-30"
              style={{
                backdropFilter: "blur(60px)",
                WebkitBackdropFilter: "blur(60px)",
              }}
              aria-hidden="true"
            />
            <div className="relative p-8 font-mono text-sm text-white/80">
              <div className="space-y-3 text-center text-white">
                <h1 className="text-4xl font-semibold font-sentient tracking-tight">Sign in</h1>
                <p className="text-xs text-white/50">
                  Use your company credentials to access the point cloud viewer and asset tools.
                </p>
              </div>

              <form className="space-y-6 mt-6" action="#" method="post">
                <div className="space-y-4">
                  <label
                    htmlFor="email"
                    className="font-mono text-[11px] uppercase tracking-[0.4em] text-white/60"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="you@rescan.com"
                    className="w-full bg-white/5 border border-white/20 rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 placeholder:text-white/30"
                  />
                </div>

                <div className="space-y-4">
                  <label
                    htmlFor="password"
                    className="font-mono text-[11px] uppercase tracking-[0.4em] text-white/60"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/20 rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 placeholder:text-white/30"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded-md bg-white text-black font-semibold tracking-[0.3em] uppercase text-xs transition transform hover:-translate-y-0.5 hover:bg-white/90"
                >
                  Sign In
                </button>
              </form>

              <p className="text-xs text-center text-white/50 mt-6">
                Need an account? <span className="text-white">Contact your REscan admin.</span>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
