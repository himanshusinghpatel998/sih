import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { User, Truck, Lock, ArrowRight } from 'lucide-react';

const EASE_OUT = [0.23, 1, 0.32, 1];

const ROLES = [
  { icon: User, title: 'Citizen', text: 'Report an issue, scan a bin, track it to resolution.' },
  { icon: Truck, title: 'Collector', text: "See your block's priority queue, not a random list." },
  { icon: Lock, title: 'Admin', text: 'Watch prediction accuracy and staffing load in one command center.' },
];

export default function RoleStrip() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto grid max-w-6xl gap-6 [perspective:1200px] sm:grid-cols-3">
        {ROLES.map((role, i) => (
          <motion.div
            key={role.title}
            initial={{ opacity: 0, y: 32, rotateX: 20 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, delay: i * 0.12, ease: EASE_OUT }}
            style={{ transformStyle: 'preserve-3d' }}
            className="group relative rounded-2xl p-px"
          >
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-500/40 via-transparent to-accent-500/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <Link
              to="/login"
              className="relative block h-full rounded-2xl border border-border bg-card p-6 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-1"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-110 group-hover:rotate-3 dark:text-accent-400">
                <role.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{role.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{role.text}</p>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Sign in <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
