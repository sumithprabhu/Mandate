import { Link } from "react-router-dom";
import { motion, MotionConfig } from "motion/react";
import { ArrowRight, Send, Lock, KeyRound } from "lucide-react";

import { FloatingNav } from "../components/landing/floating-nav";
import { Button } from "../components/landing/button";
import { Card } from "../components/landing/card";
import { Badge } from "../components/landing/badge";
import { ProductTabs } from "../components/landing/product-tabs";
import { AnimatedGradient } from "../components/landing/animated-gradient";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../components/landing/accordion";
import "../landing-tailwind.css";
import "../landing.css";

const CANONICAL_GATE = "0x8DAa03bACaa88a660F29AbCeB1a72cCD0ac50637";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const steps = [
  {
    number: "01",
    icon: Send,
    text: "An operator proposes an ownership transfer or a permission escalation for an agent.",
  },
  {
    number: "02",
    icon: Lock,
    text: "The request sits blocked on the agent's PermissionGate. Nothing has happened on chain yet.",
  },
  {
    number: "03",
    icon: KeyRound,
    text: "An approver reviews it and signs with a physically connected Ledger. Only then does it execute.",
  },
];

const faqs = [
  {
    q: "What is Mandate?",
    a: "A way to give an on-chain agent an identity (ERC-8004) and a human-readable ENS name, then require a second, hardware-held signature before its ownership or permissions can change.",
  },
  {
    q: "What does \"gated\" actually mean?",
    a: "Every ownership transfer or permission change goes through a PermissionGate contract first. It sits blocked as Pending until an approver signs it — nothing executes until then, and it can be rejected instead.",
  },
  {
    q: "Do I need a Ledger to use this?",
    a: "You need one to act as the approver — the second signature. MetaMask with a Ledger connected works the same as any wallet from the site's side; you don't need to talk to the Ledger directly in the browser.",
  },
  {
    q: "Who can propose a change to my agent?",
    a: "Only the operator address you registered with — enforced on chain by the PermissionGate contract, not by this website.",
  },
  {
    q: "What happens if I reject a proposed action?",
    a: "It's marked Rejected on chain and can never execute. Rejecting needs no signature at all — it's a direct call from the approver's wallet.",
  },
  {
    q: "Is this on mainnet?",
    a: "No — everything here runs on Sepolia, Ethereum's public test network. Test ETH has no real value; get some from a Sepolia faucet to try it yourself.",
  },
  {
    q: "What's ERC-8004?",
    a: "The identity standard this project registers agents under — a way for an on-chain agent to have its own persistent, ownable identity, separate from any single wallet.",
  },
];

export function HomePage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing bg-white font-sans text-brand-black">
        <FloatingNav />

        <div className="landing-band flex min-h-screen flex-col items-center justify-center gap-16 px-7 pt-24 pb-16">
          <motion.div
            className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            <motion.h1 variants={fadeUp} className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
              A second signature, in hardware, before an agent's owner can change.
            </motion.h1>
            <motion.p variants={fadeUp} className="max-w-xl text-base text-brand-text-dim sm:text-lg">
              Mandate gives on-chain agents an ERC-8004 identity and an ENS name, then puts ownership transfers and
              permission escalations behind a PermissionGate. Nothing executes until an approver signs with a
              physically connected Ledger.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-2 flex gap-3">
              <Button asChild>
                <Link to="/agents">
                  View agents
                  <ArrowRight size={16} strokeWidth={2} />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`https://sepolia.etherscan.io/address/${CANONICAL_GATE}`} target="_blank" rel="noreferrer">
                  View contract on Etherscan
                </a>
              </Button>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex justify-center"
          >
            <ProductTabs />
          </motion.div>
        </div>

        <section id="how-it-works" className="mx-auto max-w-5xl px-7 py-28">
          {/* tokens.css sets a global, unlayered `h1,h2,h3,h4 { margin: 0 }` -- unlayered
              rules always beat Tailwind's layered utilities regardless of value, so mb-*
              directly on the h2 gets silently zeroed. Wrapping it in a plain div (not
              targeted by that rule) sidesteps the conflict instead of fighting it. */}
          <div className="mb-20">
            <h2 className="text-2xl font-extrabold">How Mandate works</h2>
          </div>
          <motion.div
            className="grid gap-8 sm:grid-cols-3"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
          >
            {steps.map((step) => (
              <motion.div key={step.number} variants={fadeUp} whileHover={{ y: -4 }}>
                <Card className="h-full p-8 transition-shadow hover:shadow-[0_8px_24px_rgba(24,30,21,0.08)]">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-mint">
                    <step.icon size={20} strokeWidth={1.5} className="text-brand-black" />
                  </div>
                  <div className="mb-3 text-xs font-bold text-brand-text-dim">{step.number}</div>
                  <p className="text-brand-text-dim">{step.text}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-7 py-28">
          <div className="mb-16">
            <h2 className="text-2xl font-extrabold">Frequently asked</h2>
          </div>
          <Accordion type="single" collapsible className="flex flex-col gap-4">
            {faqs.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="relative overflow-hidden border-t border-brand-border bg-brand-black py-20">
          <AnimatedGradient />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 px-7 text-center">
            <Badge className="bg-white text-brand-black">Get started</Badge>
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">Ready to see your agents?</h2>
            <p className="max-w-md text-white/70">
              Every agent, its gate, and its full action history, live from the chain and the subgraph.
            </p>
            <Button asChild size="default" className="mt-2 bg-white text-brand-black hover:bg-white/90">
              <Link to="/agents">
                Open the dashboard
                <ArrowRight size={16} strokeWidth={2} />
              </Link>
            </Button>
          </div>
        </section>

        <footer className="landing-footer">
          <span>Mandate — ERC-8004 identity, ENS naming, hardware-gated permission changes.</span>
          <a href={`https://sepolia.etherscan.io/address/${CANONICAL_GATE}`} target="_blank" rel="noreferrer">
            Canonical PermissionGate
          </a>
        </footer>
      </div>
    </MotionConfig>
  );
}
