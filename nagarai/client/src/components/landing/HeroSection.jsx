import { useEffect, useState } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { buttonVariants } from '../ui/Button';
import { Separator } from '../ui/separator';
import AnimatedCounter from '../ui/AnimatedCounter';
import HeroVisual from './HeroVisual';
import MagneticButton from './MagneticButton';
import { getPublicStats } from '../../services/publicStats';
import { cn } from '../../lib/utils';

const EASE_OUT = [0.23, 1, 0.32, 1];
const headline = ['Waste, predicted', 'before it piles up.'];

export default function HeroSection() {
  const [stats, setStats] = useState(null);
  const [tiltEnabled, setTiltEnabled] = useState(false);

  useEffect(() => {
    getPublicStats().then(setStats);
    setTiltEnabled(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(50);
  const spotlightX = useSpring(mouseX, { damping: 30, stiffness: 60 });
  const spotlightY = useSpring(mouseY, { damping: 30, stiffness: 60 });

  const handlePointerMove = (e) => {
    if (!tiltEnabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(((e.clientX - rect.left) / rect.width) * 100);
    mouseY.set(((e.clientY - rect.top) / rect.height) * 100);
  };

  const spotlightBackground = useMotionTemplate`radial-gradient(600px circle at ${spotlightX}% ${spotlightY}%, var(--color-brand-500) 0%, transparent 70%)`;

  return (
    <section onPointerMove={handlePointerMove} className="relative overflow-hidden px-6 pb-24 pt-40 sm:pt-48">
      {/* Ambient background: dot grid + drifting blobs + cursor spotlight */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
          style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
        {[
          { size: 380, top: '-15%', left: '-10%', delay: 0, color: 'var(--color-brand-500)' },
          { size: 300, top: '45%', left: '82%', delay: 1.4, color: 'var(--color-accent-500)' },
          { size: 220, top: '78%', left: '8%', delay: 2.6, color: 'var(--color-brand-400)' },
        ].map((b, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full opacity-20 blur-3xl"
            style={{ width: b.size, height: b.size, top: b.top, left: b.left, backgroundColor: b.color }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 8, repeat: Infinity, delay: b.delay, ease: 'easeInOut' }}
          />
        ))}
        <motion.div className="absolute inset-0 opacity-[0.05]" style={{ background: spotlightBackground }} />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2">
        <div>
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm"
          >
            <Sparkles className="h-3 w-3 text-brand-500" />
            Live prediction engine, running now
          </motion.div>

          <h1 className="max-w-[680px] text-4xl font-bold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
            {headline.map((line, i) => (
              <motion.span
                key={line}
                className="block"
                style={{
                  backgroundImage: 'linear-gradient(90deg, var(--foreground), var(--color-brand-500))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
                initial={{ opacity: 0, y: 28, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.75, delay: 0.1 + i * 0.1, ease: EASE_OUT }}
              >
                {line}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35, ease: EASE_OUT }}
            className="mt-6 max-w-[680px] text-lg text-muted-foreground"
          >
            NagarAI scores every bin and block for overflow risk, dispatches collectors before
            complaints happen, and rewards citizens for keeping their campus clean.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.48, ease: EASE_OUT }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <MagneticButton className="inline-block">
              <Link to="/login" className={cn(buttonVariants({ size: 'lg' }), 'group rounded-full shadow-lg shadow-brand-500/20')}>
                Sign in to NagarAI
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </MagneticButton>
            <a href="#how-it-works" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'rounded-full')}>
              See how it works
            </a>
          </motion.div>

          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6, ease: EASE_OUT }}
              className="mt-10 flex max-w-md items-center rounded-2xl border border-border/60 bg-card/40 py-4 backdrop-blur-sm"
            >
              {[
                { label: 'bins tracked', value: stats.bins },
                { label: 'blocks covered', value: stats.blocks },
                { label: 'complaints resolved', value: stats.resolved },
              ].map((s, i) => (
                <div key={s.label} className="flex flex-1 items-center">
                  {i > 0 && <Separator orientation="vertical" className="mr-4 h-8" />}
                  <div>
                    <div className="font-display text-2xl font-bold text-foreground">
                      <AnimatedCounter value={s.value} />
                    </div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>

        <HeroVisual enabled={tiltEnabled} />
      </div>
    </section>
  );
}
