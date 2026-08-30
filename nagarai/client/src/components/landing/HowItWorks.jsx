import { motion } from 'framer-motion';
import { Camera, Cpu, Truck } from 'lucide-react';

const EASE_OUT = [0.23, 1, 0.32, 1];

const STEPS = [
  {
    icon: Camera,
    title: 'Report or detect',
    text: 'A citizen flags a bin, or an IoT sensor crosses a fill threshold.',
  },
  {
    icon: Cpu,
    title: 'Predict and prioritize',
    text: 'The XGBoost engine scores overflow risk per bin and ranks collection priority.',
  },
  {
    icon: Truck,
    title: 'Resolve and reward',
    text: 'The nearest collector is dispatched, and the reporting citizen earns points toward the eco store.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="mb-16 text-center text-2xl font-bold sm:text-3xl"
        >
          How it works
        </motion.h2>
        <div className="relative grid gap-10 sm:grid-cols-3 sm:gap-6">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 }}
            className="absolute left-[16.5%] right-[16.5%] top-6 hidden h-px origin-left bg-gradient-to-r from-brand-500 via-border to-border sm:block"
          />
          {STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: i * 0.15, ease: EASE_OUT }}
              className="group relative flex flex-col items-center text-center sm:items-start sm:text-left"
            >
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-brand-600 shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-1 group-hover:border-brand-500/40 dark:text-brand-400">
                <step.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
