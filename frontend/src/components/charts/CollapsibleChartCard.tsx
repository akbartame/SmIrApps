import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardHeader } from '../common/Card';
import type { ReactNode } from 'react';

export function CollapsibleChartCard({
  title,
  subtitle,
  right,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left hover:opacity-75 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-display font-semibold text-[15px] text-ink tracking-tight">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-ink-faint mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 ml-2">
            {right}
            <ChevronDown
              className={`w-5 h-5 text-ink transition-transform flex-shrink-0 ${
                isOpen ? 'rotate-0' : '-rotate-90'
              }`}
              aria-hidden
            />
          </div>
        </div>
      </button>

      {/* Show hint on mobile if collapsed */}
      {!isOpen && (
        <div className="md:hidden mt-3 p-2 bg-accent-soft rounded text-[11px] text-accent-strong">
          💡 Putar device ke landscape untuk melihat grafik dengan lebih lebar
        </div>
      )}

      {/* Chart content */}
      {isOpen && <div className="mt-4">{children}</div>}
    </Card>
  );
}