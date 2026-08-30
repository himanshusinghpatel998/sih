import NumberFlow from '@number-flow/react';

export default function AnimatedCounter({ value, className }) {
  return <NumberFlow value={value} className={className} transformTiming={{ duration: 900, easing: 'cubic-bezier(0.23,1,0.32,1)' }} />;
}
