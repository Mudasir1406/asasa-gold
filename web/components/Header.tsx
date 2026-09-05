import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * Header
 *
 * The Asasa wordmark and, when a handler is supplied, the "Reviewer tools"
 * button that opens the demo-controls drawer.
 *
 * Props
 * - `onOpenTools` — opens the reviewer drawer. When omitted the button is
 *   not rendered, so the header stays honest about what is wired up.
 */
export interface HeaderProps {
  onOpenTools?: () => void;
}

export function Header({ onOpenTools }: HeaderProps) {
  return (
    <header className="border-b border-ink/6 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2 rounded-field">
          <span className="font-display text-xl font-semibold tracking-tight text-forest">
            Asasa
          </span>
          <span className="text-sm font-medium text-ink-muted">Gold</span>
        </Link>
        {onOpenTools && (
          <Button variant="secondary" size="sm" onClick={onOpenTools}>
            Reviewer tools
          </Button>
        )}
      </div>
    </header>
  );
}
