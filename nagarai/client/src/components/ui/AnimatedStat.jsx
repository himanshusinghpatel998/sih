import { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from './Card';

function useCountUp(target, { duration = 1.1, decimals = 0, active }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controls = animate(0, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [target, active]);
  return value.toFixed(decimals);
}

/**
 * A KPI stat tile that counts up into view once, per emil-design-eng /
 * animate guidance: one orchestrated moment, not scattered effects.
 */
export default function AnimatedStat({
  icon: Icon,
  label,
  value,
  decimals = 0,
  suffix = '',
  tone = 'brand',
  delta,
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const display = useCountUp(Number(value) || 0, { decimals, active: inView });

  const toneClasses = {
    brand: 'text-brand-600 dark:text-brand-400 bg-brand-500/10',
    signal: 'text-signal-600 dark:text-signal-400 bg-signal-500/10',
    danger: 'text-danger-600 dark:text-danger-400 bg-danger-500/10',
    success: 'text-success-600 dark:text-success-400 bg-success-500/10',
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <Card className="relative overflow-hidden p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="font-mono-data mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {display}
              <span className="text-lg text-muted-foreground">{suffix}</span>
            </p>
            {delta != null && (
              <p
                className={cn(
                  'mt-1 text-xs font-medium',
                  delta >= 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
                )}
              >
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs. yesterday
              </p>
            )}
          </div>
          {Icon && (
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
              <Icon className="h-5 w-5" strokeWidth={2} />
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
