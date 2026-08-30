import { motion } from 'framer-motion';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

const EASE_OUT = [0.23, 1, 0.32, 1];

const FAQS = [
  {
    q: 'Do I need to install anything?',
    a: 'No. NagarAI runs in the browser, on any device connected to the campus network — nothing to download.',
  },
  {
    q: 'Is my complaint tied to my name, or anonymous?',
    a: "Complaints are tied to your account, so you and the assigned collector can see status updates and follow up. It isn't posted publicly or shared outside the collection team handling it.",
  },
  {
    q: 'How accurate are the predictions?',
    a: 'The prediction engine is scored continuously against real collection outcomes rather than a single advertised number, since accuracy shifts with weather, events, and season.',
  },
  {
    q: 'What do reward points get me?',
    a: 'Points earned from reports and bin scans are redeemable in the Eco Store for real items.',
  },
  {
    q: 'Who creates collector accounts?',
    a: 'Citizens self-register. Collector accounts are created by an admin, so field access stays controlled.',
  },
  {
    q: 'Does this work on a collector’s phone in the field?',
    a: 'Yes, the collector portal is responsive and built for quick use on a phone while out on a route.',
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <motion.h2
          initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="mb-8 text-center text-2xl font-bold sm:text-3xl"
        >
          Frequently asked questions
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          <Accordion type="single" collapsible defaultValue="item-0">
            {FAQS.map((item, i) => (
              <AccordionItem key={item.q} value={`item-${i}`}>
                <AccordionTrigger className="text-base font-medium hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
