import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDataSync, usePlayers, useUnits, useSituations } from '@/hooks/useDataQueries';
import { useSignalR } from '@/hooks/useSignalR';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { state } = useSignalR();
  useDataSync();
  const navigate = useNavigate();
  const loc = useLocation();

  const { data: players } = usePlayers();
  const { data: units } = useUnits();
  const { data: situations } = useSituations();

  const [clock, setClock] = useState('');
  useEffect(() => { const i = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: false })), 500); return () => clearInterval(i); }, []);

  const online = state === 'connected';
  const active = units?.filter(u => u.status !== 'Code 7').length ?? 0;
  const total = units?.length ?? 0;
  const crit = situations?.filter(s => s.isActive && s.type?.toLowerCase() === 'panic').length ?? 0;

  const tabs = [
    { path: '/', label: 'TERMINAL' },
    { path: '/db', label: 'DATABASE' },
  ];

  return (
    <div className="h-screen flex flex-col bg-[#020304] text-[#33ff66] overflow-hidden">
      {/* ── TOP BAR ── */}
      <header className="h-[34px] shrink-0 flex items-center justify-between px-4 bg-[#0a1018] border-b border-[#003d10] text-[10px] tracking-[2px] uppercase">
        <div className="flex items-center gap-6">
          <span className="text-[#33ff66] tracking-[3px] text-[11px]">LSPD // DISPATCH TERMINAL v2.0</span>
          <span className="text-[#5a9a5a] text-[10px]">SAN ANDREAS NETWORK</span>
        </div>
        <div className="flex items-center gap-6 text-[#5a9a5a] text-[10px]">
          <span>UNITS <span className="text-[#33ff66]">{active}</span>/{total}</span>
          <span>CRITICAL <span className={crit > 0 ? 'text-[#ff2020]' : 'text-[#33ff66]'}>{crit}</span></span>
          <span className="flex items-center gap-1">
            <span className={cn('w-[5px] h-[5px] inline-block', online ? 'bg-[#00e5ff] animate-pulse' : 'bg-[#ff2020]')} />
            <span className={online ? 'text-[#00e5ff]' : 'text-[#ff2020]'}>{online ? 'SRV:ONLINE' : 'SRV:OFFLINE'}</span>
          </span>
          <span className="text-[#33ff66] text-[13px] tracking-[1px]">{clock}</span>
        </div>
      </header>

      {/* ── MAIN 3-COLUMN ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Unit Roster */}
        <aside className="w-[260px] shrink-0 border-r border-[#003d10] flex flex-col bg-[#060a0e]">
          <div className="h-[28px] shrink-0 flex items-center px-3 bg-[#0a1018] border-b border-[#003d10] text-[10px] tracking-[2px] uppercase text-[#5a9a5a]">
            <span>UNIT ROSTER</span>
            <span className="ml-auto text-[#33ff66]">{active}/{total}</span>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {(units ?? []).map(u => (
              <div key={u.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1 text-[10px] cursor-pointer border-l-[3px] border-transparent',
                  u.status === 'Code 7' ? 'opacity-30 pointer-events-none' : 'hover:bg-[#33ff66]/[0.04]',
                  loc.pathname === `/?unit=${u.id}` && 'bg-[#33ff66]/[0.06] border-l-[#33ff66]'
                )}
                onClick={() => navigate(`/?unit=${u.id}`)}>
                <span className={cn('w-[6px] h-[6px] shrink-0',
                  u.status === 'Code 0' ? 'bg-[#ff2020] shadow-[0_0_8px_#ff2020]' :
                  u.status === 'Code 1' ? 'bg-[#ff2020]' :
                  u.status === 'Code 3' ? 'bg-[#33ff66] shadow-[0_0_6px_#33ff66]' :
                  u.status === 'Code 2' ? 'bg-[#ffaa00]' :
                  u.status === 'Code 7' ? 'bg-[#1a2a1a]' : 'bg-[#5a9a5a]')} />
                <span className="text-[#33ff66]">{u.marking}</span>
                <span className={cn('text-[10px]',
                  u.status === 'Code 0' ? 'text-[#ff2020]' :
                  u.status?.startsWith('Code 1') ? 'text-[#ff2020]' :
                  u.status === 'Code 3' ? 'text-[#33ff66]' : 'text-[#5a9a5a]')}>
                  {u.status || 'UNASSIGNED'}
                </span>
              </div>
            ))}
          </div>
          {/* Unit Detail */}
          <div className="shrink-0 border-t border-[#003d10] p-3 text-[10px] space-y-1 bg-[#060a0e] max-h-[200px] overflow-auto">
            <div className="text-[#5a9a5a] text-[10px] uppercase tracking-[2px] mb-2">UNIT DETAIL</div>
            {units?.find(u => loc.search.includes(u.id)) ? (() => {
              const u = units.find(x => loc.search.includes(x.id))!;
              return <>
                <div className="text-[#33ff66] text-[12px] tracking-[1px]">▸ {u.marking}</div>
                <div className="text-[#5a9a5a] text-[10px]">━━━━━━━━━━━━━━━━━━</div>
                <div className="flex justify-between"><span className="text-[#5a9a5a]">STATUS</span><span className="text-[#33ff66]">{u.status}</span></div>
                <div className="flex justify-between"><span className="text-[#5a9a5a]">CREW</span><span className="text-[#33ff66]">{u.playerCount}</span></div>
                <div className="flex justify-between"><span className="text-[#5a9a5a]">SITUATION</span><span className="text-[#33ff66]">{u.situationId?.substring(0,8) ?? 'NONE'}</span></div>
                <div className="text-[#5a9a5a] text-[10px]">━━━━━━━━━━━━━━━━━━</div>
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {['TRACK','MSG','ASSIGN','EDIT'].map(a => (
                    <button key={a} className="text-[10px] border border-[#003d10] text-[#5a9a5a] hover:text-[#33ff66] hover:border-[#33ff66] px-2 py-1 text-left">[F{a === 'TRACK' ? '1' : a === 'MSG' ? '2' : a === 'ASSIGN' ? '3' : '4'}] {a}</button>
                  ))}
                </div>
              </>;
            })() : (
              <div className="text-[#5a9a5a] italic text-[10px]">SELECT A UNIT</div>
            )}
          </div>
        </aside>

        {/* CENTER: Map */}
        <main className="flex-1 flex flex-col bg-[#010203] overflow-hidden">
          <div className="h-[28px] shrink-0 flex items-center px-3 bg-[#0a1018] border-b border-[#003d10] text-[10px] tracking-[2px] uppercase text-[#5a9a5a]">
            <span>TACTICAL MAP — SAN ANDREAS</span>
            <span className="ml-auto text-[#5a9a5a]">{clock}Z</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>

        {/* RIGHT: Situations */}
        <aside className="w-[300px] shrink-0 border-l border-[#003d10] flex flex-col bg-[#060a0e]">
          <div className="h-[28px] shrink-0 flex items-center px-3 bg-[#0a1018] border-b border-[#003d10] text-[10px] tracking-[2px] uppercase text-[#5a9a5a]">
            <span>SITUATIONS</span>
            <span className="ml-auto text-[#ff2020]">{crit} CRITICAL</span>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {(situations ?? []).filter(s => s.isActive).map(s => {
              const level = s.metadata?.priority === 'Critical' ? 'danger' : s.metadata?.priority === 'High' ? 'warn' : 'dim';
              const borderColor = level === 'danger' ? 'border-l-[#ff2020]' : level === 'warn' ? 'border-l-[#ffaa00]' : 'border-l-[#007a1f]';
              return (
                <div key={s.id} className={cn('border-l-[3px] px-2 py-1.5 text-[10px] cursor-pointer hover:bg-[#33ff66]/[0.04] bg-[#060a0e]',
                  borderColor, level === 'danger' && 'bg-[#ff2020]/[0.04]')}>
                  <div className="flex justify-between items-start">
                    <span className="text-[#5a9a5a] text-[10px]">{new Date(s.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                    <span className={cn('text-[10px] uppercase tracking-[2px]', level === 'danger' ? 'text-[#ff2020]' : level === 'warn' ? 'text-[#ffaa00]' : 'text-[#007a1f]')}>{s.metadata?.priority ?? 'MOD'}</span>
                  </div>
                  <div className="text-[#33ff66] text-[10px] uppercase">{s.metadata?.title || s.type}</div>
                  <div className="text-[#5a9a5a] text-[10px]">{s.locationName || s.metadata?.location || 'UNKNOWN'} · {s.units?.length ?? 0} UNITS</div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* ── BOTTOM: Radio ── */}
      <footer className="h-[190px] shrink-0 border-t border-[#003d10] bg-[#060a0e] flex flex-col">
        <div className="h-[28px] shrink-0 flex items-center px-3 bg-[#0a1018] border-b border-[#003d10] text-[10px] tracking-[2px] uppercase text-[#5a9a5a]">
          <span>RADIO COMMUNICATIONS</span>
          <span className="ml-auto text-[#007a1f]">CH: TAC-1</span>
        </div>
        <div className="flex-1 overflow-auto p-2 text-[10px] space-y-0.5">
          <div className="text-[#5a9a5a]"><span className="text-[#5a9a5a]">21:47:25</span> <span className="text-[#00e5ff]">[3-LINCOLN-2]</span> <span className="text-[#007a1f]">On scene — officer down. Need backup NOW.</span></div>
          <div className="text-[#5a9a5a]"><span className="text-[#5a9a5a]">21:47:28</span> <span className="text-[#33ff66]">[DISPATCH]</span> <span className="text-[#007a1f]">Copy. All available units respond Code 3.</span></div>
          <div className="text-[#5a9a5a]"><span className="text-[#5a9a5a]">21:47:32</span> <span className="text-[#00e5ff]">[3-ADAM-55]</span> <span className="text-[#007a1f]">En route. ETA 3 minutes.</span></div>
        </div>
        <div className="h-[32px] shrink-0 flex items-center px-3 border-t border-[#003d10] bg-[#0a1018]">
          <span className="text-[#007a1f] text-[11px] mr-2">&gt;</span>
          <input className="flex-1 bg-transparent border-none outline-none text-[#33ff66] text-[10px] placeholder:text-[#003d10]" placeholder="TYPE MESSAGE..." />
          <button className="border border-[#003d10] text-[#5a9a5a] text-[10px] px-3 py-0.5 hover:text-[#33ff66] hover:border-[#33ff66]">SEND</button>
        </div>
      </footer>

      {/* ── STATUS BAR ── */}
      <div className="h-[24px] shrink-0 flex items-center px-4 bg-[#0a1018] border-t border-[#003d10] text-[10px] text-[#5a9a5a] tracking-[1px]">
        <span>SYS: {clock} » <span className="text-[#007a1f]">DB SYNC OK</span></span>
        <span className="mx-2 text-[#003d10]">|</span>
        <span>{new Date().toISOString().split('T')[1]?.split('.')[0] ?? ''} » <span className="text-[#007a1f]">UNITS REFRESHED</span></span>
        <span className="mx-2 text-[#003d10]">|</span>
        <span>CONNECTED: <span className={online ? 'text-[#33ff66]' : 'text-[#ff2020]'}>DISPATCH_SERVER_01</span></span>
      </div>
    </div>
  );
}
