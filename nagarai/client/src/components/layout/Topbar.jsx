import { useState, useEffect } from 'react';
import { Menu, Clock } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';
import NotificationBell from './NotificationBell';

export default function Topbar({ title, onToggleMenu, rightSlot }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onToggleMenu} className="text-muted-foreground hover:text-foreground lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Clock className="h-3.5 w-3.5" /> {time}
        </span>
        <NotificationBell />
        <ThemeToggle />
        {rightSlot}
      </div>
    </header>
  );
}
