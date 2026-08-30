import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '../ui/Button';
import MagneticButton from './MagneticButton';
import { cn } from '../../lib/utils';

const EASE_OUT = [0.23, 1, 0.32, 1];

export default function FinalCta() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const blobY1 = useTransform(scrollYProgress, [0, 1], [-40, 40]);
  const blobY2 = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section ref={ref} className="px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border bg-card px-8 py-20 text-center"
      >
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            style={{ y: blobY1, top: '-30%', left: '10%', width: 260, height: 260, backgroundColor: 'var(--color-brand-500)' }}
            className="absolute rounded-full opacity-25 blur-3xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            style={{ y: blobY2, top: '20%', left: '70%', width: 220, height: 220, backgroundColor: 'var(--color-accent-500)' }}
            className="absolute rounded-full opacity-25 blur-3xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 7, repeat: Infinity, delay: 1.5, ease: 'easeInOut' }}
          />
        </div>
        <h2 className="relative font-display text-3xl font-bold sm:text-4xl">Ready to see your block&apos;s risk?</h2>
        <p className="relative mt-3 text-muted-foreground">Sign in to check today&apos;s predictions.</p>
        <MagneticButton className="relative mt-8 inline-block">
          <Link to="/login" className={cn(buttonVariants({ size: 'lg' }), 'group rounded-full shadow-lg shadow-brand-500/20')}>
            Sign in to NagarAI
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </MagneticButton>
      </motion.div>
    </section>
  );
}
