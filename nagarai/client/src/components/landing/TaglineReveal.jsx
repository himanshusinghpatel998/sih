import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

const EASE_OUT = [0.23, 1, 0.32, 1];
const TEXT =
  "Most cities react to overflow after residents complain. NagarAI closes the loop before it opens, predicting pressure block by block, so a truck is already on the way.";

export default function TaglineReveal() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.92, 1, 0.92]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.4, 1, 1, 0.4]);

  const words = TEXT.split(' ');

  return (
    <section ref={ref} className="px-6 py-32">
      <motion.p
        style={{ scale, opacity }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
        transition={{ staggerChildren: 0.035 }}
        className="mx-auto max-w-[680px] text-3xl font-semibold leading-tight tracking-tight [perspective:800px] sm:text-4xl lg:text-5xl"
      >
        {words.map((word, i) => (
          <motion.span
            key={i}
            variants={{
              hidden: {
                opacity: 0.25,
                y: 18,
                rotateX: 35,
                filter: 'blur(6px)',
                color: 'color-mix(in srgb, var(--foreground) 30%, transparent)',
              },
              visible: {
                opacity: 1,
                y: 0,
                rotateX: 0,
                filter: 'blur(0px)',
                color: 'var(--foreground)',
              },
            }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="mr-[0.28em] inline-block will-change-transform"
          >
            {word}
          </motion.span>
        ))}
      </motion.p>
    </section>
  );
}
