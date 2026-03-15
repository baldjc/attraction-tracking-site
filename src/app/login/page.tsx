"use client";

import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === "code") {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    setStep("code");
    setResendCooldown(60);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length < 6) return;
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      code: fullCode,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid or expired code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every((d) => d !== "")) {
      setTimeout(() => {
        const form = document.getElementById("code-form") as HTMLFormElement;
        form?.requestSubmit();
      }, 50);
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...code];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
    setCode(next);
    const lastFilled = Math.min(pasted.length, 5);
    inputRefs.current[lastFilled]?.focus();
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (res.ok) {
      setResendCooldown(60);
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } else {
      setError("Could not resend code. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f1f1ef] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/logo-icon.png"
            alt=""
            className="h-16 w-16 rounded-2xl object-cover mx-auto mb-4"
          />
          <img
            src="/logo-transparent.png"
            alt="Attraction by Video"
            className="h-10 w-auto object-contain mx-auto"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-[#1e2a38]">Sign in</h2>
                <p className="text-sm text-[#1e2a38]/60 mt-1">
                  Enter your email and we'll send you a login code.
                </p>
              </div>

              {error && (
                <div className="bg-[#ff0033]/10 text-[#ff0033] text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-[#1e2a38] mb-1"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] focus:border-transparent outline-none text-[#1e2a38]"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3dc3ff] hover:bg-[#2bb3ef] text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending code…" : "Send login code"}
              </button>
            </form>
          ) : (
            <form id="code-form" onSubmit={handleVerifyCode} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-[#1e2a38]">Check your email</h2>
                <p className="text-sm text-[#1e2a38]/60 mt-1">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-[#1e2a38]">{email}</span>
                </p>
              </div>

              {error && (
                <div className="bg-[#ff0033]/10 text-[#ff0033] text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#1e2a38] mb-3">
                  Enter your code
                </label>
                <div className="flex gap-2 justify-between" onPaste={handlePaste}>
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(i, e)}
                      className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] focus:border-[#3dc3ff] outline-none text-[#1e2a38] transition-colors"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || code.join("").length < 6}
                className="w-full bg-[#3dc3ff] hover:bg-[#2bb3ef] text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying…" : "Sign in"}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setError(""); setCode(["", "", "", "", "", ""]); }}
                  className="text-sm text-[#1e2a38]/60 hover:text-[#1e2a38] transition-colors"
                >
                  ← Change email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="text-sm text-[#3dc3ff] hover:text-[#2bb3ef] disabled:text-[#1e2a38]/40 disabled:cursor-not-allowed transition-colors"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
