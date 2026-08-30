import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

export default function CursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const x = useSpring(useMotionValue(0), { damping: 25, stiffness: 200, mass: 0.5 });
  const y = useSpring(useMotionValue(0), { damping: 25, stiffness: 200, mass: 0.5 });

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnabled(fine && !reduced);
    if (!fine || reduced) return;
    const handleMove = (e) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      style={{ left: x, top: y }}
      className="pointer-events-none fixed z-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl"
    />
  );
}
