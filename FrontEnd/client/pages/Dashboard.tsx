import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDataSync } from '@/hooks/useDataQueries';
import { useSignalR } from '@/hooks/useSignalR';
import { usePlayers, useUnits, useSituations } from '@/hooks/useDataQueries';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff } from 'lucide-react';

/**
 * Root dashboard layout.
 * - Initialises SignalR connection
 * - Wires up real-time query invalidation
 * - Renders the top status bar + child routes
 */
export default function Dashboard() {
  const { state } = useSignalR();
  useDataSync();
  const navigate = useNavigate();
  const location = useLocation();

  // Prefetch all data
  usePlayers();
  useUnits();
  useSituations();

  const connected = state === 'connected';

  // Stats
  const { data: units } = useUnits();
  const { data: situations } = useSituations();
  const activeUnits = units?.filter(u => u.status !== 'Code 7' && u.status !== 'Unassigned').length ?? 0;
  const criticalSits = situations?.filter(s => s.isActive && s.type?.toLowerCase() === 'panic').length ?? 0;
  const codeSeven = units?.filter(u => u.status === 'Code 7').length ?? 0;

  const tabs = [
    { path: '/', label: 'Карта' },
    { path: '/board', label: 'Доска' },
    { path: '/management', label: 'Управление' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Status bar */}
      <header className="h-12 border-b border-border/50 bg-card/50 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold tracking-tight">SAPD Dispatch</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-emerald-400">{activeUnits} активных юнитов</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-rose-400">{criticalSits} критических</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-amber-400">{codeSeven} на перерыве</span>
        </div>
        <div className="flex items-center gap-4">
          <nav className="flex gap-1">
            {tabs.map(t => (
              <button key={t.path} onClick={() => navigate(t.path)}
                className={cn("px-3 py-1 text-xs rounded-md transition-colors",
                  location.pathname === t.path ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </nav>
          {connected ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400"><Wifi className="w-3 h-3" /> Online</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-400"><WifiOff className="w-3 h-3" /> Polling</span>
          )}
          <span className="text-xs text-muted-foreground">{new Date().toLocaleTimeString('ru-RU')}</span>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
