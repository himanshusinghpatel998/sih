const ITEMS = [
  'Predictive scoring', 'Live bin sensors', 'Collector dispatch', 'Citizen reports',
  'Eco store rewards', 'Command center', 'Closed loop', 'Event aware',
];

function Track() {
  return (
    <div className="flex shrink-0 items-center gap-8 pr-8">
      {ITEMS.map((item) => (
        <div key={item} className="flex items-center gap-8 whitespace-nowrap">
          <span className="font-display text-xl font-semibold text-muted-foreground/50">{item}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500/40" />
        </div>
      ))}
    </div>
  );
}

export default function MarqueeStrip() {
  return (
    <div className="overflow-hidden border-y border-border py-6 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
      <div className="flex w-max animate-marquee">
        <Track />
        <Track />
      </div>
    </div>
  );
}
