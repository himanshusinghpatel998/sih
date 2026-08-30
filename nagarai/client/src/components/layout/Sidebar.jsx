import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../utils/helpers';
import { cn } from '../../lib/utils';

export default function Sidebar({ portalName, icon, navItems, activeSection, onNavigate, isOpen, onClose }) {
  const { user, logout } = useAuth();
  const initials = getInitials(user?.name);

  const handleNavClick = (sectionId) => {
    onNavigate(sectionId);
    if (onClose) onClose();
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            {icon || <Sparkles className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">NagarAI</p>
            <p className="truncate text-xs text-muted-foreground">{portalName}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
          {navItems.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  'relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                  active ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {active && (
                  <motion.div layoutId={`sidebar-active-${portalName}`} className="absolute inset-0 rounded-lg bg-primary" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />
                )}
                <span className="relative flex items-center gap-2.5">
                  <span className="text-base leading-none">{item.icon}</span> {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-semibold text-brand-700 dark:text-brand-300">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger-500/10 hover:text-danger-600 dark:hover:text-danger-400"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
