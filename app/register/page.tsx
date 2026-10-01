"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed.");
        setLoading(false);
        return;
      }
      // Auto-login after registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Account created but sign-in failed. Please log in manually.");
        setLoading(false);
        return;
      }
      router.push("/");
    } catch {
      setError("An unexpected error occurred.");
      setLoading(false);
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
          <p className="text-text-dim text-sm mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5 uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent transition-colors"
              placeholder="Your name"
            />
          </div>
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
              placeholder="Minimum 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5 uppercase tracking-wider">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent transition-colors"
              placeholder="Repeat your password"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="vault-gradient text-on-primary font-bold text-sm uppercase tracking-widest py-3 rounded-xl shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 mt-1"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-text-dim mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
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
