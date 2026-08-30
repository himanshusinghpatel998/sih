import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function LandingFooter() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2 text-foreground">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 text-white">
            <Sparkles className="h-3 w-3" />
          </div>
          <span className="text-sm font-semibold font-display">NagarAI</span>
          <span className="text-sm text-muted-foreground">Predictive municipal sanitation intelligence</span>
        </div>
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">
          Sign in
        </Link>
      </div>
    </footer>
  );
}
