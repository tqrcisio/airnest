import { Link, Outlet, createRootRoute } from '@tanstack/react-router';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@airnest/ui/components/button';
import { useTheme } from '@/lib/theme';

function Shell() {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/dags" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
            airnest
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/dags"
              className="rounded-full px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              activeProps={{ className: 'bg-muted text-foreground' }}
            >
              DAGs
            </Link>
          </nav>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createRootRoute({ component: Shell });
