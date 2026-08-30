import { AnimatePresence, motion } from 'framer-motion';

const EASE_OUT = [0.23, 1, 0.32, 1];

/**
 * Wraps a tab/section's content so switching between them cross-fades with a
 * slight vertical settle instead of an abrupt swap. Keyed by `tabKey` so
 * AnimatePresence treats each section as a distinct element to transition
 * between (mode="wait" avoids the two states overlapping mid-flight).
 */
export default function TabTransition({ tabKey, children }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.22, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
