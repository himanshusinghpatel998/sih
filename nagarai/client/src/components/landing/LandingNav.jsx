import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';
import { buttonVariants } from '../ui/Button';
import { cn } from '../../lib/utils';

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

export default function LandingNav() {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > window.innerHeight * 0.6);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed inset-x-0 top-4 z-40 flex justify-center px-4"
    >
      <nav
        className={cn(
          'flex w-full max-w-3xl items-center justify-between gap-4 rounded-full border border-border/60 px-3 py-2 transition-[padding,background-color,box-shadow] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)]',
          condensed ? 'bg-card/80 shadow-lg shadow-black/5 backdrop-blur-xl py-1.5' : 'bg-card/40 backdrop-blur-md'
        )}
      >
        <Link to="/" className="flex items-center gap-2 pl-2 text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-bold font-display">NagarAI</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link to="/login" className={cn(buttonVariants({ size: 'sm' }), 'rounded-full')}>
            Sign in
          </Link>
        </div>
      </nav>
    </motion.div>
  );
}
