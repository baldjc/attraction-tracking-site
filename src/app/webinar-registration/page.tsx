"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const ACCENT = "#d3753d";
const DARK_BG = "#1A1A1A";
const LIGHT_BG = "#FAFAF8";
const CARD_BG = "#F5F4F0";

interface WebinarConfig {
  date: string;
  time: string;
  name: string;
  link: string;
  addEventCalendar: string;
  price: string;
  spotsAvailable: boolean;
  registrationOpen: boolean;
}

const DEFAULT_CONFIG: WebinarConfig = {
  date: "May 14th 2026",
  time: "11:00 AM MST",
  name: "5 YouTube Mistakes Making You Invisible to Clients",
  link: "#",
  addEventCalendar: "#",
  price: "Absolutely FREE!",
  spotsAvailable: true,
  registrationOpen: true,
};

const CABINET = "'Cabinet Grotesk', 'Outfit', sans-serif";

function CtaButton({
  label = "YES! REGISTER MY SPOT NOW!",
  onOpen,
  spots = true,
}: {
  label?: string;
  onOpen: () => void;
  spots?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onOpen}
        style={{ backgroundColor: "#6ba3c7", fontFamily: CABINET }}
        className="inline-block text-white font-bold text-lg rounded-lg px-12 py-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] cursor-pointer"
      >
        {label}
      </button>
      {spots && (
        <p
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: ACCENT, letterSpacing: "0.1em" }}
        >
          LIMITED SPOTS AVAILABLE
        </p>
      )}
    </div>
  );
}

function RegistrationModal({
  config,
  onClose,
}: {
  config: WebinarConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName || !form.email) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/webinar-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.push("/webinar-thank-you");
      } else {
        setError("Something went wrong. Please try again.");
        setSubmitting(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-[480px] p-10 relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-5 text-2xl text-gray-400 hover:text-gray-700 transition-colors leading-none"
        >
          ×
        </button>
        <h2
          className="text-3xl font-bold text-[#1A1A1A] mb-1"
          style={{ fontFamily: CABINET }}
        >
          Reserve Your Free Spot
        </h2>
        <p className="text-sm font-semibold mb-6" style={{ color: ACCENT }}>
          {config.date} at {config.time}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1A1A1A] mb-1">
              Full Name <span style={{ color: ACCENT }}>*</span>
            </label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Your full name"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1A1A1A] outline-none focus:border-[#6ba3c7] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1A1A1A] mb-1">
              Email <span style={{ color: ACCENT }}>*</span>
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="your@email.com"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1A1A1A] outline-none focus:border-[#6ba3c7] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1A1A1A] mb-1">
              Cell Phone <span style={{ color: ACCENT }}>*</span>
            </label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+1 (555) 000-0000"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-[#1A1A1A] outline-none focus:border-[#6ba3c7] transition-colors"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-lg text-white text-base font-bold transition-all disabled:opacity-60"
            style={{ backgroundColor: "#6ba3c7", fontFamily: CABINET }}
          >
            {submitting ? "Registering…" : "REGISTER NOW — IT'S FREE"}
          </button>
          <p className="text-center text-xs text-gray-400">
            We&apos;ll send you a confirmation and reminder before the event.
          </p>
        </form>
      </div>
    </div>
  );
}

const MISTAKES = [
  {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 mx-auto">
        <circle cx="28" cy="28" r="16" stroke="#d3753d" strokeWidth="3" />
        <line x1="40" y1="40" x2="54" y2="54" stroke="#d3753d" strokeWidth="3" strokeLinecap="round" />
        <polyline points="20,28 26,34 36,22" stroke="#d3753d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: "MISTAKE #1",
    title: "Not Seeing the YouTube Opportunity",
    desc: "Countless industry leaders claim that YouTube is the #1 way to grow your brand and build clients attracted to your business.",
  },
  {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 mx-auto">
        <path d="M32 8L36 20H50L39 28L43 40L32 32L21 40L25 28L14 20H28Z" stroke="#d3753d" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    ),
    label: "MISTAKE #2",
    title: "Not Using AI in Your Business and Content",
    desc: "Learn how to leverage AI tools to create compelling content efficiently, even with your busy schedule as a business owner.",
  },
  {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 mx-auto">
        <circle cx="32" cy="32" r="20" stroke="#d3753d" strokeWidth="3" />
        <path d="M32 22v12" stroke="#d3753d" strokeWidth="3" strokeLinecap="round" />
        <circle cx="32" cy="42" r="2" fill="#d3753d" />
      </svg>
    ),
    label: "MISTAKE #3",
    title: "Not Knowing What Makes Your Content Suck",
    desc: "You don't know the reason people aren't watching your videos. It could be a few simple tweaks to drive more views and leads.",
  },
  {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 mx-auto">
        <circle cx="32" cy="24" r="12" stroke="#d3753d" strokeWidth="3" />
        <path d="M14 52c0-9.9 8.1-18 18-18s18 8.1 18 18" stroke="#d3753d" strokeWidth="3" strokeLinecap="round" />
        <path d="M26 20l4 4 8-8" stroke="#d3753d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: "MISTAKE #4",
    title: "Not Attracting Your Perfect Client",
    desc: "Master the art of attracting your ideal local clients while naturally repelling the tire-kickers and bargain hunters.",
  },
  {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 mx-auto">
        <circle cx="16" cy="32" r="6" stroke="#d3753d" strokeWidth="3" />
        <circle cx="48" cy="16" r="6" stroke="#d3753d" strokeWidth="3" />
        <circle cx="48" cy="48" r="6" stroke="#d3753d" strokeWidth="3" />
        <line x1="22" y1="29" x2="42" y2="19" stroke="#d3753d" strokeWidth="2" />
        <line x1="22" y1="35" x2="42" y2="45" stroke="#d3753d" strokeWidth="2" />
      </svg>
    ),
    label: "MISTAKE #5",
    title: "Not Having a Proven, Repeatable Strategy",
    desc: "Develop your systematic approach to creating content that positions you as the local expert and attracts premium clients.",
  },
];

export default function WebinarRegistrationPage() {
  const [config, setConfig] = useState<WebinarConfig>(DEFAULT_CONFIG);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch("/api/webinar-config")
      .then((r) => r.json())
      .then((d) => setConfig((c) => ({ ...c, ...d })))
      .catch(() => {});
  }, []);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <>
      {modalOpen && (
        <RegistrationModal config={config} onClose={closeModal} />
      )}

      {/* ── 1. HERO ─────────────────────────────────────────────────────── */}
      <section
        style={{ backgroundColor: DARK_BG }}
        className="py-24 px-6 text-center"
      >
        <p
          className="text-white text-[13px] font-semibold uppercase mb-6"
          style={{ letterSpacing: "0.12em" }}
        >
          Stop Being Invisible to Your Dream Clients
        </p>
        <h1
          className="text-white font-extrabold leading-[1.1] mb-6 mx-auto"
          style={{
            fontFamily: CABINET,
            fontSize: "clamp(34px, 5vw, 62px)",
            maxWidth: "880px",
          }}
        >
          <span style={{ color: ACCENT }}>5 YouTube Mistakes</span> Making You
          Invisible to Clients and Costing You Millions
        </h1>
        <p
          className="mx-auto mb-8 leading-relaxed"
          style={{
            color: "rgba(255,255,255,0.72)",
            fontSize: "17px",
            maxWidth: "720px",
          }}
        >
          Join Jared Chamberlain for this powerful, FREE masterclass where
          he&apos;ll show you exactly how to transform your YouTube strategy to
          attract clients instead of chasing them.
        </p>
        <p
          className="font-semibold mb-10 text-base"
          style={{ color: ACCENT }}
        >
          Date: {config.date} &nbsp;||&nbsp; Time: {config.time} &nbsp;||&nbsp;
          Price: {config.price}
        </p>
        <CtaButton onOpen={openModal} spots={config.spotsAvailable} />
      </section>

      {/* ── 2. PROBLEM / EMPATHY ────────────────────────────────────────── */}
      <section style={{ backgroundColor: LIGHT_BG }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-center font-extrabold text-[#1A1A1A] mb-16"
            style={{
              fontFamily: CABINET,
              fontSize: "clamp(28px, 4vw, 46px)",
            }}
          >
            It&apos;s Time to{" "}
            <span style={{ color: ACCENT }}>Stop Chasing Clients</span> and
            Start Attracting Them
          </h2>

          <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
            {/* Photo placeholder */}
            <div
              className="rounded-2xl overflow-hidden shadow-lg aspect-[4/5] w-full"
              style={{ backgroundColor: "#e8e0d8" }}
            >
              {/* Replace with: <img src="/jared-laptop.jpg" alt="Jared Chamberlain at laptop" className="w-full h-full object-cover" /> */}
              <div className="w-full h-full flex items-center justify-center text-[#9a8a7a] text-sm font-medium">
                [Jared at laptop photo]
              </div>
            </div>

            {/* Questions */}
            <div>
              <h3
                className="font-bold text-[#1A1A1A] mb-8"
                style={{ fontFamily: CABINET, fontSize: "24px" }}
              >
                Let me ask you something honestly
              </h3>
              <div className="space-y-5">
                {[
                  "When was the last time you felt confident that your marketing was actually working?",
                  "Are you tired of throwing money at ads that cost more every month?",
                  "Frustrated with calling leads who don't know who you are, except they are the ones that signed up through your ads?",
                  "Fed up with networking events that eat up your time but only connect you with one person at a time?",
                ].map((q, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5"
                      style={{ backgroundColor: ACCENT }}
                    >
                      ?
                    </div>
                    <p className="text-[#4a4a4a] text-[15px] leading-relaxed">
                      {q}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Body copy */}
          <div
            className="mx-auto space-y-6 text-[#2a2a2a]"
            style={{ maxWidth: "800px", fontSize: "16px", lineHeight: "1.8" }}
          >
            <p>
              Deep down, you already know the truth. Your business deserves
              better than expensive ads, unreliable algorithms, and slow
              networking. You&apos;re meant to have clients seeking YOU out,
              ready to pay premium rates because they trust you and see you as
              the expert.
            </p>
            <p>
              But here&apos;s what&apos;s really keeping you stuck: it&apos;s
              not lack of talent or opportunity — it&apos;s making the wrong
              moves on YouTube that keep you invisible to the clients who need
              you most.
            </p>
            <p>
              <strong>
                What you might not realise is how the right YouTube strategy
                changes everything.
              </strong>{" "}
              When you finally step into your power as a local authority,
              everything shifts.
            </p>
            <p>
              Clients who once scrolled past your content suddenly can&apos;t
              wait to work with you. Competitors who dismissed your &apos;little
              YouTube channel&apos; start asking how you&apos;re booking so many
              premium clients. And your business grows without the constant
              stress of chasing leads.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. THE ALTERNATIVE ──────────────────────────────────────────── */}
      <section style={{ backgroundColor: CARD_BG }} className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl p-12 shadow-md text-center">
            <h2
              className="font-bold mb-4"
              style={{
                fontFamily: CABINET,
                fontSize: "36px",
                color: ACCENT,
              }}
            >
              The alternative?
            </h2>
            <div
              className="mx-auto mb-8"
              style={{
                width: "60px",
                height: "3px",
                backgroundColor: "#6ba3c7",
                borderRadius: "2px",
              }}
            />
            <div
              className="space-y-5 text-[#555] mx-auto"
              style={{ fontSize: "16px", lineHeight: "1.8", maxWidth: "600px" }}
            >
              <p>
                Staying where you are, watching your marketing budget disappear
                while your competitors figure out what you&apos;re missing.
                People sense when you&apos;re struggling to get noticed. They
                feel the desperation in your outreach. And worst of all — so do
                you.
              </p>
              <p>
                This isn&apos;t about learning a few video tricks or posting
                more content. This is about transformation!
              </p>
              <p>
                Stepping into the version of yourself who attracts $100,000+ in
                new business annually through YouTube. Who creates valuable
                content that positions you as THE local expert. Who builds
                wealth by helping people find you instead of chasing them down.
                The path to that reality is clearer than you think. But first,
                you need to stop making the mistakes that keep you invisible.
              </p>
              <p>
                <strong>
                  That&apos;s exactly what this free training is designed to do.
                </strong>
              </p>
            </div>
            <div className="mt-10">
              <CtaButton onOpen={openModal} spots={config.spotsAvailable} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. WHAT YOU'LL DISCOVER ─────────────────────────────────────── */}
      <section style={{ backgroundColor: DARK_BG }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-center font-extrabold text-white mb-16"
            style={{
              fontFamily: CABINET,
              fontSize: "clamp(28px, 4vw, 46px)",
            }}
          >
            <span style={{ color: ACCENT }}>What You&apos;ll Discover</span> in
            This Free Training
          </h2>

          {/* 3+2 grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {MISTAKES.slice(0, 3).map((m, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-8 text-center shadow-sm"
              >
                {m.icon}
                <p
                  className="text-xs font-semibold uppercase mt-4 mb-2"
                  style={{ color: ACCENT, letterSpacing: "0.1em" }}
                >
                  {m.label}
                </p>
                <h3
                  className="font-bold text-[#1A1A1A] mb-3"
                  style={{ fontFamily: CABINET, fontSize: "18px" }}
                >
                  {m.title}
                </h3>
                <p className="text-[#555] text-sm leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto mb-14">
            {MISTAKES.slice(3).map((m, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-8 text-center shadow-sm"
              >
                {m.icon}
                <p
                  className="text-xs font-semibold uppercase mt-4 mb-2"
                  style={{ color: ACCENT, letterSpacing: "0.1em" }}
                >
                  {m.label}
                </p>
                <h3
                  className="font-bold text-[#1A1A1A] mb-3"
                  style={{ fontFamily: CABINET, fontSize: "18px" }}
                >
                  {m.title}
                </h3>
                <p className="text-[#555] text-sm leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <CtaButton onOpen={openModal} spots={config.spotsAvailable} />
          </div>
        </div>
      </section>

      {/* ── 5. ABOUT YOUR HOST ──────────────────────────────────────────── */}
      <section style={{ backgroundColor: LIGHT_BG }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          {/* Headshot placeholder */}
          <div
            className="rounded-2xl overflow-hidden shadow-xl aspect-[3/4] w-full"
            style={{ backgroundColor: "#e8e0d8" }}
          >
            {/* Replace with: <img src="/jared-headshot.jpg" alt="Jared Chamberlain" className="w-full h-full object-cover" /> */}
            <div className="w-full h-full flex items-center justify-center text-[#9a8a7a] text-sm font-medium">
              [Jared headshot — arms crossed]
            </div>
          </div>

          <div>
            <h2
              className="font-extrabold text-[#1A1A1A] mb-6"
              style={{
                fontFamily: CABINET,
                fontSize: "clamp(28px, 3.5vw, 42px)",
              }}
            >
              About{" "}
              <span style={{ color: ACCENT }}>Your Host</span>
            </h2>
            <div
              className="space-y-5 text-[#4a4a4a]"
              style={{ fontSize: "16px", lineHeight: "1.8" }}
            >
              <p>
                Meet Jared Chamberlain — built a multi-7-figure local business
                with his wife, dedicated dance dad to two teenage daughters,
                bald longer than he had hair, car enthusiast, and music lover
                who discovered the secret to turning YouTube into a
                client-attraction machine for his own local business.
              </p>
              <p>
                <strong>
                  In the past 4 years, Jared&apos;s YouTube strategy has
                  generated $3,996,258+ in GCI.
                </strong>
              </p>
              <p>
                Jared&apos;s proven systems focus specifically on local exposure
                (not national), work within the time constraints of busy
                business owners, and show you how to do this efficiently and
                effectively with AI — unlike anything you&apos;ll see anywhere
                else.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. THE HARD WAY ─────────────────────────────────────────────── */}
      <section style={{ backgroundColor: DARK_BG }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h2
            className="font-extrabold text-white mb-2"
            style={{
              fontFamily: CABINET,
              fontSize: "clamp(28px, 4vw, 46px)",
            }}
          >
            <span style={{ color: ACCENT }}>You Can Do</span> It the Hard Way...
          </h2>
          <p
            className="text-white font-semibold mb-14"
            style={{ fontSize: "18px" }}
          >
            The Hard Way (Don&apos;t Do This!)
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {[
              "Start a YouTube Channel to reach new people, talking about what you like.",
              "You shoot random content that no one cares about or watches.",
              "You get too busy in your business to stay consistent, don't have a road map and there are no results!",
            ].map((step, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-8 text-center shadow-sm"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-4"
                  style={{ backgroundColor: ACCENT }}
                >
                  {i + 1}
                </div>
                <p
                  className="text-[#444] leading-relaxed"
                  style={{ fontSize: "15px" }}
                >
                  {step}
                </p>
              </div>
            ))}
          </div>

          <p
            className="text-white font-bold mb-8"
            style={{ fontSize: "20px" }}
          >
            Want the easy way? Sign up for the masterclass!
          </p>
          <CtaButton
            label="YES, I WANT THE EASY WAY"
            onOpen={openModal}
            spots={config.spotsAvailable}
          />
        </div>
      </section>

      {/* ── 7. FINAL URGENCY CLOSE ──────────────────────────────────────── */}
      <section style={{ backgroundColor: LIGHT_BG }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-center font-extrabold text-[#1A1A1A] mb-16"
            style={{
              fontFamily: CABINET,
              fontSize: "clamp(28px, 4vw, 44px)",
            }}
          >
            <span style={{ color: ACCENT }}>Don&apos;t Let</span> Another Day
            Pass By Without Taking Action
          </h2>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            {/* Workspace image placeholder */}
            <div
              className="rounded-2xl overflow-hidden shadow-lg aspect-[4/3] w-full"
              style={{ backgroundColor: "#e8e0d8" }}
            >
              {/* Replace with: <img src="/workspace.jpg" alt="Laptop with notebook and coffee" className="w-full h-full object-cover" /> */}
              <div className="w-full h-full flex items-center justify-center text-[#9a8a7a] text-sm font-medium">
                [Laptop + notebook + coffee photo]
              </div>
            </div>

            <div className="space-y-5 text-[#4a4a4a]" style={{ fontSize: "16px", lineHeight: "1.8" }}>
              <p>
                Your dream client-attraction system isn&apos;t going to build
                itself. Every day you wait is another day of expensive ads,
                unpredictable algorithms, and slow networking while your
                competitors figure out what you&apos;re missing.
              </p>
              <p>
                The business owners who are thriving with YouTube were once
                exactly where you are now — talented, passionate, but making the
                same invisible mistakes. They took one simple action that changed
                everything: they showed up to learn the right way.
              </p>
              <p>
                <strong>Now it&apos;s your turn.</strong>
              </p>
              <div className="pt-4">
                <CtaButton
                  label="RESERVE MY FREE SPOT NOW"
                  onOpen={openModal}
                  spots={config.spotsAvailable}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. FOOTER ───────────────────────────────────────────────────── */}
      <footer
        style={{ backgroundColor: DARK_BG }}
        className="py-8 text-center"
      >
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
          © 2026 Jared Chamberlain — All Rights Reserved
        </p>
      </footer>
    </>
  );
}
