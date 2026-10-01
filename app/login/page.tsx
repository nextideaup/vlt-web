"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0e10] flex items-center justify-center px-4">
      <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/brand/vault1-medallion.png"
            alt="Vault 1"
            width={96}
            height={96}
            priority
            className="mb-4"
          />
          <h1 className="font-headline text-2xl font-bold text-accent tracking-widest uppercase">
            Vault 1
          </h1>
          <p className="text-text-dim text-sm mt-1">Obsession, Curated</p>
        </div>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-3 mb-6">
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="flex items-center gap-3 w-full border border-border bg-surface-2 hover:bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-text transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z" />
              <path fill="#34A853" d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2970244 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z" />
              <path fill="#4A90E2" d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z" />
              <path fill="#FBBC05" d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z" />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
            className="flex items-center gap-3 w-full border border-border bg-surface-2 hover:bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-text transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 23 23">
              <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
              <path fill="#f35325" d="M1 1h10v10H1z"/>
              <path fill="#81bc06" d="M12 1h10v10H12z"/>
              <path fill="#05a6f0" d="M1 12h10v10H1z"/>
              <path fill="#ffba08" d="M12 12h10v10H12z"/>
            </svg>
            Continue with Microsoft
          </button>

          <button
            onClick={() => signIn("apple", { callbackUrl: "/" })}
            className="flex items-center gap-3 w-full border border-border bg-surface-2 hover:bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-text transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 814 1000" fill="currentColor">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 497 32 345.8 81.4 252.6c24.5-45.7 68.2-79.4 116.4-79.4 48.9 0 78.8 31.8 148.7 31.8 66.2 0 107.2-31.4 167.8-31.4 56.8 0 107.4 30.1 134.6 76.4zm-296.8-157.3c27.6-34.9 47.2-83.8 47.2-132.7 0-6.9-.5-13.9-1.6-19.8-44.8 1.6-97.9 30.3-129.9 71.3-24.2 28.9-45.9 77.2-45.9 127.1 0 7.6 1 15.1 1.6 17.4 3.1.5 8.2 1.1 13.3 1.1 40 0 90.7-26.5 115.3-64.4z"/>
            </svg>
            Continue with Apple
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-muted">or sign in with email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="vault-gradient text-on-primary font-bold text-sm uppercase tracking-widest py-3 rounded-xl shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 mt-1"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-text-dim mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Register
          </Link>
        </p>

        <p className="text-center text-xs text-text-muted mt-4">
          <Link href="/privacy" className="hover:text-text-dim hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
