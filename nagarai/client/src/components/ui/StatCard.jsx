import { motion } from 'framer-motion';
import { Card } from './Card';

export default function StatCard({ icon: Icon, value, label, borderColor }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="flex items-center gap-3 p-4" style={borderColor ? { borderTopColor: borderColor, borderTopWidth: 3 } : {}}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          {Icon && <Icon className="h-5 w-5" strokeWidth={2} />}
        </div>
        <div className="min-w-0">
          <p className="font-mono-data text-xl font-semibold text-foreground">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </Card>
    </motion.div>
  );
}
