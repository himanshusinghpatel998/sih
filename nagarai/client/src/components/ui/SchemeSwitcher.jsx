import { Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useScheme } from '../../context/SchemeContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';
import { cn } from '../../lib/utils';

export default function SchemeSwitcher() {
  const { theme } = useTheme();
  const { schemeId, setSchemeId, schemes } = useScheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance — color scheme (testing)</CardTitle>
        <CardDescription>
          {schemes.length} candidate palettes, each contrast-verified for both light and dark mode. Pick one to preview it live across the whole app — nothing is final yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {schemes.map((scheme) => {
            const roles = theme === 'dark' ? scheme.dark : scheme.light;
            const active = schemeId === scheme.id;
            return (
              <button
                key={scheme.id}
                onClick={() => setSchemeId(scheme.id)}
                className={cn(
                  'group relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-[transform,box-shadow,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]',
                  active ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                )}
              >
                <div
                  className="flex h-14 items-center justify-center gap-1.5 rounded-md border"
                  style={{ background: roles.bg, borderColor: roles.border }}
                >
                  <span className="h-5 w-5 rounded-full shadow-sm" style={{ background: roles.primary }} />
                  <span className="h-5 w-5 rounded-full shadow-sm" style={{ background: roles.accent }} />
                  <span className="h-5 w-5 rounded-full border shadow-sm" style={{ background: roles.surface, borderColor: roles.border }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{scheme.name}</p>
                  <p className="text-[10px] text-muted-foreground">{scheme.mood}</p>
                </div>
                {active && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
