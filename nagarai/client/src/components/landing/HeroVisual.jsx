import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer, YAxis, LineChart, Line } from 'recharts';
import { CheckCircle2, Gift, AlertTriangle } from 'lucide-react';

const EASE_OUT = [0.23, 1, 0.32, 1];

const RISK_DATA = [
  { h: 0, v: 18 }, { h: 2, v: 14 }, { h: 4, v: 11 }, { h: 6, v: 15 },
  { h: 8, v: 28 }, { h: 10, v: 34 }, { h: 12, v: 46 }, { h: 14, v: 41 },
  { h: 16, v: 52 }, { h: 18, v: 71 }, { h: 20, v: 83 }, { h: 22, v: 58 },
];

const ACCURACY_DATA = [{ v: 78 }, { v: 82 }, { v: 80 }, { v: 86 }, { v: 89 }, { v: 91 }, { v: 91.4 }];

function FloatingCard({ children, className, depth, rotate, delay, floatDuration, mx, my }) {
  const x = useTransform(mx, (v) => v * depth);
  const y = useTransform(my, (v) => v * depth);
  return (
    <motion.div
      style={{ x, y }}
      initial={{ opacity: 0, scale: 0.85, rotate: rotate * 2 }}
      animate={{ opacity: 1, scale: 1, rotate }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
      className={className}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: floatDuration, delay: delay + 0.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export default function HeroVisual({ enabled }) {
  const mx = useSpring(useMotionValue(0), { stiffness: 80, damping: 20 });
  const my = useSpring(useMotionValue(0), { stiffness: 80, damping: 20 });

  const handlePointerMove = (e) => {
    if (!enabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handlePointerLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative hidden aspect-square w-full lg:block"
    >
      {/* Main dashboard card */}
      <motion.div
        style={{ x: useTransform(mx, (v) => v * 10), y: useTransform(my, (v) => v * 10) }}
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: EASE_OUT }}
        className="absolute left-1/2 top-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Citywide overflow risk</div>
            <div className="text-xs text-muted-foreground">Next 24 hours</div>
          </div>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
          </span>
        </div>
        <div className="mt-3 h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={RISK_DATA} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="heroRiskFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 100]} />
              <Area type="monotone" dataKey="v" stroke="var(--color-brand-500)" strokeWidth={2} fill="url(#heroRiskFill)" isAnimationActive animationDuration={1400} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <FloatingCard depth={-24} rotate={-7} delay={0.55} floatDuration={4.5} mx={mx} my={my} className="absolute left-[4%] top-[10%] w-40 rounded-xl border border-border bg-card p-3 shadow-xl">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-danger-600 dark:text-danger-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Bin A-114
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '92%' }}
            transition={{ duration: 1, delay: 1.1, ease: EASE_OUT }}
            className="h-full rounded-full bg-danger-500"
          />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">92% full · flagged</div>
      </FloatingCard>

      <FloatingCard depth={30} rotate={5} delay={0.7} floatDuration={5} mx={mx} my={my} className="absolute right-[2%] top-[6%] flex w-44 items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs font-medium text-foreground shadow-xl">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-500" />
        Collector dispatched · Block C
      </FloatingCard>

      <FloatingCard depth={-18} rotate={4} delay={0.85} floatDuration={4.2} mx={mx} my={my} className="absolute bottom-[16%] left-[0%] w-36 rounded-xl border border-border bg-card p-3 shadow-xl">
        <div className="text-xs font-semibold text-foreground">Accuracy</div>
        <div className="mt-0.5 font-display text-lg font-bold text-brand-600 dark:text-brand-400">91.4%</div>
        <div className="mt-1 h-6 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ACCURACY_DATA}>
              <Line type="monotone" dataKey="v" stroke="var(--color-brand-500)" strokeWidth={1.5} dot={false} isAnimationActive animationDuration={1200} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </FloatingCard>

      <FloatingCard depth={22} rotate={-5} delay={1} floatDuration={4.8} mx={mx} my={my} className="absolute bottom-[6%] right-[8%] flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-medium text-foreground shadow-xl">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-400">
          <Gift className="h-3.5 w-3.5" />
        </div>
        +40 eco points earned
      </FloatingCard>
    </div>
  );
}
