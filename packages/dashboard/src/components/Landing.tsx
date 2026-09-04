import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ShieldCheck, Coins, Workflow, Fingerprint, Github, ArrowRight, Wallet, Lock, Eye,
  BadgeDollarSign, CheckCircle2, ExternalLink, ArrowUpRight, Network, Receipt, Cpu,
} from 'lucide-react';

const SOCIALS = [
  { label: 'GitHub', url: 'https://github.com/agentpay/agentpay', icon: Github },
  { label: 'X', url: '', icon: null },
  { label: 'Discord', url: '', icon: null },
];
const GITHUB_URL = 'https://github.com/agentpay/agentpay';
const CIPHERMIT_URL = 'https://github.com/Bosun-Josh121/ciphermit';

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { el.classList.add('ap-in'); io.unobserve(el); }
      }),
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`ap-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-900/30 ring-1 ring-white/10">
        <BadgeDollarSign size={16} className="text-white" />
      </div>
      <span className="text-[15px] font-bold tracking-tight text-white">AgentPay</span>
      <span className="hidden sm:inline-flex text-[10px] font-medium tracking-widest uppercase px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/20 ml-1">Stellar</span>
    </div>
  );
}

const PILLARS = [
  {
    icon: BadgeDollarSign, tint: 'from-teal-500/15 to-transparent', ring: 'text-teal-300', border: 'border-teal-800/40',
    tag: 'Budget-enforced',
    title: 'Spend limits that stick',
    body: 'Every dollar is held in a non-custodial vault that enforces the budget on-chain. No overspend, no custodial risk, no trust required.',
  },
  {
    icon: Fingerprint, tint: 'from-amber-500/12 to-transparent', ring: 'text-amber-300', border: 'border-amber-800/30',
    tag: 'Privately settled',
    title: 'Rules you keep to yourself',
    body: 'Your spending policy is enforced and proven without being revealed. Budgets, payees and amounts stay private — only compliance is proven.',
  },
  {
    icon: Network, tint: 'from-sky-500/12 to-transparent', ring: 'text-sky-300', border: 'border-sky-800/30',
    tag: 'Open economy',
    title: 'Any service can earn',
    body: 'An open registry of AI agents, specialists and businesses paid per-step in USDC via x402 and MPP. If it has a Stellar wallet, it can join.',
  },
];

const STATS = [
  { k: 'Non-custodial', v: 'Your keys, your funds' },
  { k: 'USDC on Stellar', v: 'Testnet live' },
  { k: 'x402 + MPP', v: 'Two payment rails' },
  { k: '7 categories', v: '24 sample services' },
];

const STEPS = [
  { icon: Wallet, title: 'Fund your vault', body: 'Connect a Stellar wallet and deposit USDC. The contract holds it — not us.' },
  { icon: Coins, title: 'Set the limit', body: 'State the task and the max budget. The vault locks the amount and guarantees a refund of the remainder.' },
  { icon: Workflow, title: 'Agents execute', body: 'An orchestrator breaks work into steps and pays the best service for each step, inside the budget.' },
  { icon: Receipt, title: 'Verify & withdraw', body: 'Track every release, review the result, and withdraw unused funds anytime.' },
];

type OfferStatus = 'live' | 'beta' | 'next';
const OFFERINGS: { icon: typeof Wallet; name: string; status: OfferStatus; body: string }[] = [
  { icon: Wallet, name: 'AgentVault', status: 'live', body: 'Non-custodial Soroban vault: deposits, budget locks, per-step releases, refunds and multi-asset support.' },
  { icon: Network, name: 'Service marketplace', status: 'live', body: 'Discover AI agents, human specialists and business services. Filter by category, sort by rating or price.' },
  { icon: ShieldCheck, name: 'Private policies', status: 'beta', body: 'Zero-knowledge spending rules — enforced on-chain, never revealed. Built on the CipherMit engine.' },
  { icon: Cpu, name: 'Agent SDK', status: 'next', body: 'Add safe, budget-capped spending to any app or agent in a handful of calls.' },
  { icon: Workflow, name: 'MCP server', status: 'next', body: 'Stellar MCP: let any AI agent discover and pay for services under a policy.' },
  { icon: Receipt, name: 'On-chain registry', status: 'next', body: 'Verifiable discovery and reputation anchored on Soroban.' },
];
const STATUS: Record<OfferStatus, { label: string; cls: string }> = {
  live: { label: 'Live', cls: 'bg-teal-500/10 text-teal-300 border-teal-500/25' },
  beta: { label: 'Beta', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  next: { label: 'Next', cls: 'bg-white/5 text-slate-400 border-white/10' },
};

export function Landing({ onLaunch }: { onLaunch: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const launch = (
    <button
      onClick={onLaunch}
      className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 transition-all"
    >
      Open dashboard
      <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );

  return (
    <div className="min-h-screen bg-[#080e1e] text-slate-200 overflow-x-hidden">
      <header className={`fixed top-0 inset-x-0 z-40 transition-all ${scrolled ? 'bg-[#080e1e]/80 backdrop-blur-xl border-b border-white/[0.06] shadow-lg shadow-black/20' : 'bg-transparent'}`}>
        <nav className="max-w-6xl mx-auto px-5 h-[64px] flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex items-center gap-6 text-sm">
            <a href="#capabilities" className="text-slate-400 hover:text-white transition-colors">Capabilities</a>
            <a href="#marketplace" className="text-slate-400 hover:text-white transition-colors">Marketplace</a>
            <a href="#flow" className="text-slate-400 hover:text-white transition-colors">How it flows</a>
            <a href="#privacy" className="text-slate-400 hover:text-white transition-colors">Privacy</a>
          </div>
          <div className="flex items-center gap-3">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
              <Github size={16} /> <span className="hidden lg:inline">GitHub</span>
            </a>
            {launch}
          </div>
        </nav>
      </header>

      {/* Hero — split layout, distinct from original centered hero */}
      <section className="relative pt-28 pb-16 px-5">
        <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="ap-grid absolute inset-0" />
          <div className="ap-orb absolute -top-20 -left-20 w-[42rem] h-[42rem] rounded-full bg-teal-600/15 blur-[130px]" />
          <div className="ap-orb absolute top-16 -right-32 w-[36rem] h-[36rem] rounded-full bg-amber-500/10 blur-[120px]" style={{ animationDelay: '4s' }} />
          <div className="ap-orb absolute bottom-0 left-1/2 w-[30rem] h-[30rem] rounded-full bg-sky-500/10 blur-[110px]" style={{ animationDelay: '2s' }} />
        </div>

        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live on Stellar Testnet · USDC · Non-custodial
              </span>
            </Reveal>
            <Reveal delay={70}>
              <h1 className="mt-5 text-4xl sm:text-[2.95rem] font-extrabold tracking-tight text-white leading-[1.02] text-balance">
                Give agents
                <br />
                <span className="ap-gradient-text">a budget they can’t break.</span>
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-4 text-base sm:text-[17px] text-slate-400 max-w-xl leading-relaxed">
                AgentPay is the budget-enforced rail for autonomous work on Stellar. Lock USDC in AgentVault, let orchestrators pay specialists per step, and prove policy compliance without revealing the policy.
              </p>
            </Reveal>
            <Reveal delay={210}>
              <div className="mt-7 flex items-center gap-3 flex-wrap">
                {launch}
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors">
                  <Github size={15} /> Star on GitHub <ArrowUpRight size={13} className="opacity-60" />
                </a>
              </div>
            </Reveal>
            <Reveal delay={280}>
              <div className="mt-6 flex flex-wrap gap-2">
                {STATS.map(s => (
                  <span key={s.k} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs">
                    <CheckCircle2 size={12} className="text-teal-400" />
                    <span className="text-slate-200 font-medium">{s.k}</span>
                    <span className="text-slate-500">· {s.v}</span>
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right — vault preview card, distinct illustration */}
          <Reveal delay={120}>
            <div className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 backdrop-blur overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-transparent to-amber-500/10 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/20 flex items-center justify-center">
                      <Lock size={14} className="text-teal-300" />
                    </div>
                    <span className="text-sm font-semibold text-white">AgentVault</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Live</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">USDC · Stellar</span>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Deposited', value: '$1,240.00', sub: 'total' },
                    { label: 'Locked', value: '$85.00', sub: 'active task' },
                    { label: 'Available', value: '$1,155.00', sub: 'withdrawable' },
                  ].map(b => (
                    <div key={b.label} className="rounded-2xl border border-white/10 bg-[#0a1226] p-3">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{b.label}</div>
                      <div className="mt-1 text-sm font-bold text-white font-mono">{b.value}</div>
                      <div className="text-[11px] text-slate-500">{b.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-[#0a1226] p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Task #42 · Research report</span>
                    <span className="text-amber-300 font-medium">Budget $12.00</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[
                      { step: 'Step 1 · Web search', cost: '$0.45', state: 'paid' },
                      { step: 'Step 2 · Analysis', cost: '$1.20', state: 'paid' },
                      { step: 'Step 3 · Draft report', cost: '$2.10', state: 'pending' },
                    ].map(r => (
                      <div key={r.step} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-slate-300"><span className={`w-1.5 h-1.5 rounded-full ${r.state==='paid'?'bg-emerald-400':'bg-amber-400 animate-pulse'}`} />{r.step}</span>
                        <span className="font-mono text-slate-200">{r.cost}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-[42%] bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full" />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                    <span>$1.65 released</span><span>$10.35 remaining</span>
                  </div>
                </div>

                <p className="mt-4 text-xs text-slate-500 flex items-center gap-1.5">
                  <Eye size={12} className="text-slate-400" /> Spending policy enforced but never revealed
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Pillars — staggered, teal/amber/sky */}
      <section id="capabilities" className="px-5 py-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl">
            <p className="text-xs uppercase tracking-widest font-semibold text-teal-300">Why AgentPay</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Budget rails, not blank checks.
            </h2>
            <p className="mt-2 text-slate-400">Three guarantees for every autonomous payment.</p>
          </Reveal>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div className={`relative h-full rounded-2xl border ${p.border} bg-white/[0.03] p-6 overflow-hidden ap-card-hover transition-all`}>
                  <div className={`absolute inset-0 bg-gradient-to-b ${p.tint} pointer-events-none`} />
                  <div className="relative">
                    <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                      <p.icon size={19} className={p.ring} />
                    </div>
                    <p className="mt-4 text-[11px] uppercase tracking-widest font-semibold text-slate-500">{p.tag}</p>
                    <h3 className="mt-1 text-[17px] font-semibold text-white">{p.title}</h3>
                    <p className="mt-2 text-sm text-slate-400 leading-relaxed">{p.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* What AgentPay offers — 6 cards */}
      <section className="px-5 py-16 border-t border-white/[0.06] bg-white/[0.015]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Everything in the rail</h2>
            <p className="mt-3 text-slate-400">Vault and marketplace are live on testnet. Private policies and SDK are next.</p>
          </Reveal>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {OFFERINGS.map((o, i) => {
              const st = STATUS[o.status];
              return (
                <Reveal key={o.name} delay={(i % 3) * 70}>
                  <div className="h-full rounded-2xl border border-white/10 bg-[#0f1d33]/60 p-6 ap-card-hover transition-all">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                        <o.icon size={17} className="text-slate-200" />
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold text-white">{o.name}</h3>
                    <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{o.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Marketplace — asymmetric */}
      <section id="marketplace" className="px-5 py-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          <Reveal>
            <p className="text-xs uppercase tracking-widest font-semibold text-sky-300">Marketplace</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Hire humans and agents, pay by the step.
            </h2>
            <p className="mt-3 text-slate-400 leading-relaxed">
              Browse services across Data, Research, Finance, Compliance and more. The vault pays per step in USDC so the platform never custodies your funds, and any service with a Stellar wallet can list in minutes.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {[
                'Filter by 7 categories + provider type (AI, human, business)',
                'Sort by reputation, price or latency — reputation is on-chain',
                'x402 and MPP — the same rails work for agents and humans',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-slate-300">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-500/15 border border-teal-500/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={11} className="text-teal-300" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              {launch}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors">
                Explore registry <ArrowUpRight size={14} />
              </a>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="rounded-3xl border border-white/10 bg-[#0f1d33] p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest font-semibold text-slate-400">Sample catalog</p>
                <span className="text-xs text-slate-500 font-mono">24 services · USDC</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { name: 'Stellar Oracle', cat: 'Data & Oracles', price: '$0.05', rep: '4.9' },
                  { name: 'Web Intel', cat: 'Web & Research', price: '$0.30', rep: '4.7' },
                  { name: 'Risk Scanner', cat: 'Risk & Compliance', price: '$0.80', rep: '4.8' },
                  { name: 'Report Writer', cat: 'Business Services', price: '$1.10', rep: '4.9' },
                ].map(s => (
                  <div key={s.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[11px] text-slate-500 uppercase tracking-wider">{s.cat}</div>
                    <div className="mt-1 text-sm font-semibold text-white">{s.name}</div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-mono text-teal-300">{s.price}/call</span>
                      <span className="flex items-center gap-1 text-amber-300">★ {s.rep}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                {['Data & Oracles','AI & Analysis','Web & Research','Finance & DeFi','Risk & Compliance','Human Services','Business Services'].map(c => (
                  <span key={c} className="text-[11px] rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">{c}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it flows — horizontal timeline */}
      <section id="flow" className="px-5 py-16 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <Reveal className="max-w-2xl">
            <p className="text-xs uppercase tracking-widest font-semibold text-amber-300">How it flows</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-white tracking-tight">Four steps, no custody.</h2>
          </Reveal>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 80}>
                <div className="relative h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                      <s.icon size={17} className="text-teal-300" />
                    </div>
                    <span className="text-2xl font-bold text-white/10">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-white">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{s.body}</p>
                  {i < 3 && <div className="hidden lg:block absolute top-1/2 -right-2.5 w-5 h-[1px] bg-white/10" />}
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <div className="mt-8 rounded-2xl border border-teal-500/20 bg-teal-500/5 px-5 py-4 flex items-center gap-3 text-sm text-teal-100">
              <ShieldCheck size={18} className="text-teal-300 shrink-0" />
              The platform never holds your money. AgentVault is the only custodian — and it can’t overspend.
            </div>
          </Reveal>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="px-5 py-16 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto text-center">
          <Reveal>
            <div className="inline-flex w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 items-center justify-center">
              <Fingerprint size={22} className="text-teal-300" />
            </div>
            <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Proven private. Not publicly revealed.
            </h2>
            <p className="mt-3 text-slate-400 leading-relaxed max-w-2xl mx-auto">
              Typical agent-payment tools publish your budget, allowed payees and every payment for the world to see. AgentPay proves that spending obeyed your policy without revealing the policy, the payees or the totals.
              Enforcement is on-chain, visibility is yours to keep.
            </p>
            <p className="mt-4 text-sm text-slate-500">
              Powered by the zero-knowledge engine live on Stellar testnet as{' '}
              <a href={CIPHERMIT_URL} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 inline-flex items-center gap-1">
                CipherMit <ExternalLink size={11} />
              </a>
              {' '}— integrating it into AgentVault is our current build.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300">
              <Lock size={12} className="text-slate-400" /> Policy commitment is a 32-byte hash — opaque on-chain
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-16 border-t border-white/[0.06]">
        <Reveal className="max-w-4xl mx-auto">
          <div className="relative rounded-[28px] border border-white/10 overflow-hidden p-8 sm:p-12 text-center">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-teal-600/15 via-transparent to-amber-500/10" />
            <div className="absolute inset-0 -z-10 opacity-40" style={{ background: 'radial-gradient(600px 200px at 50% 0%, rgba(20,184,166,0.15), transparent)' }} />
            <h2 className="text-2xl sm:text-[32px] font-extrabold text-white tracking-tight">
              Put a governor on autonomous spend.
            </h2>
            <p className="mt-3 text-slate-300 max-w-xl mx-auto">
              Connect a Freighter wallet, deposit test USDC, and watch an orchestrated task pay for itself — step by step, within budget.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
              {launch}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors">
                <Github size={15} /> View source
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">Stellar Testnet · test assets have no real value</p>
          </div>
        </Reveal>
      </section>

      <footer className="px-5 py-10 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-xs text-slate-600">Budget-enforced · Privately settled · Built on Stellar</span>
          </div>
          <div className="flex items-center gap-4">
            {SOCIALS.filter((s) => s.url && s.icon).map((s) => {
              const Icon = s.icon!;
              return (
                <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="text-slate-500 hover:text-white transition-colors" aria-label={s.label}>
                  <Icon size={17} />
                </a>
              );
            })}
            <a href={CIPHERMIT_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">CipherMit</a>
            <button onClick={onLaunch} className="text-xs font-medium text-teal-400 hover:text-teal-300 transition-colors">Open dashboard →</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
