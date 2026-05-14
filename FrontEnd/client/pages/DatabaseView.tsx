import { useState } from "react";
import { usePlayers, useUnits, useSituations } from "@/hooks/useDataQueries";
import { cn } from "@/lib/utils";

type DbTab = 'units' | 'incidents' | 'operators';

export default function DatabaseView() {
  const [tab, setTab] = useState<DbTab>('units');
  const [search, setSearch] = useState('');
  const { data: units } = useUnits();
  const { data: situations } = useSituations();
  const { data: players } = usePlayers();

  const tabs: { key: DbTab; label: string }[] = [
    { key: 'units', label: 'UNITS' },
    { key: 'incidents', label: 'INCIDENTS' },
    { key: 'operators', label: 'OPERATORS' },
  ];

  const filteredUnits = (units ?? []).filter(u =>
    !search || u.marking.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSituations = (situations ?? []).filter(s =>
    !search || (s.type ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.metadata?.title ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredPlayers = (players ?? []).filter(p =>
    !search || p.nick.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-[#060a0e]">
      {/* Tab bar */}
      <div className="h-[34px] shrink-0 flex items-center px-4 bg-[#0a1018] border-b border-[#003d10] gap-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-1 text-[10px] uppercase tracking-[2px] border-b-2 transition-colors',
              tab === t.key ? 'border-[#33ff66] text-[#33ff66]' : 'border-transparent text-[#5a9a5a] hover:text-[#007a1f]')}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[#5a9a5a] text-[10px]">SEARCH:</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-[180px] bg-[#020304] border border-[#003d10] text-[#33ff66] text-[10px] px-2 py-0.5 outline-none focus:border-[#33ff66] placeholder:text-[#003d10]"
            placeholder="TYPE..." />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {tab === 'units' && (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-[#0a1018] text-[#5a9a5a] text-[10px] tracking-[1px] uppercase">
                <th className="border border-[#003d10] px-3 py-2 text-left">CALLSIGN</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">STATUS</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">CREW</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">SITUATION</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnits.map(u => (
                <tr key={u.id} className="hover:bg-[#33ff66]/[0.04]">
                  <td className="border border-[#003d10] px-3 py-2 text-[#33ff66]">{u.marking}</td>
                  <td className="border border-[#003d10] px-3 py-2">
                    <span className={cn(u.status === 'Code 0' ? 'text-[#ff2020]' : u.status === 'Code 3' ? 'text-[#33ff66]' : 'text-[#ffaa00]')}>
                      ● {u.status || '—'}
                    </span>
                  </td>
                  <td className="border border-[#003d10] px-3 py-2 text-[#5a9a5a]">{u.playerCount}</td>
                  <td className="border border-[#003d10] px-3 py-2 text-[#007a1f] font-mono text-[10px]">{u.situationId?.substring(0, 8) ?? '—'}</td>
                  <td className="border border-[#003d10] px-3 py-2">
                    <button className="text-[#5a9a5a] text-[10px] hover:text-[#33ff66] mr-2">[EDIT]</button>
                    <button className="text-[#5a9a5a] text-[10px] hover:text-[#00e5ff]">[VIEW]</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'incidents' && (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-[#0a1018] text-[#5a9a5a] text-[10px] tracking-[1px] uppercase">
                <th className="border border-[#003d10] px-3 py-2 text-left">TIME</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">CODE</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">TITLE</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">LEVEL</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">UNITS</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">STATUS</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredSituations.map(s => {
                const level = s.metadata?.priority === 'Critical' ? 'danger' : s.metadata?.priority === 'High' ? 'warn' : 'normal';
                return (
                  <tr key={s.id} className={cn('hover:bg-[#33ff66]/[0.04]', !s.isActive && 'opacity-40')}>
                    <td className="border border-[#003d10] px-3 py-2 text-[#5a9a5a] text-[10px]">
                      {new Date(s.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </td>
                    <td className="border border-[#003d10] px-3 py-2 text-[#33ff66] uppercase">{s.type}</td>
                    <td className="border border-[#003d10] px-3 py-2 text-[#33ff66]">{s.metadata?.title || '—'}</td>
                    <td className="border border-[#003d10] px-3 py-2">
                      <span className={cn('text-[10px] uppercase tracking-[1px]',
                        level === 'danger' ? 'text-[#ff2020]' : level === 'warn' ? 'text-[#ffaa00]' : 'text-[#007a1f]')}>
                        [{s.metadata?.priority ?? 'LOW'}]
                      </span>
                    </td>
                    <td className="border border-[#003d10] px-3 py-2 text-[#5a9a5a]">{s.units?.length ?? 0}</td>
                    <td className="border border-[#003d10] px-3 py-2">
                      {s.isActive
                        ? <span className="text-[#ff2020] animate-pulse">● ACTIVE</span>
                        : <span className="text-[#5a9a5a]">RESOLVED</span>}
                    </td>
                    <td className="border border-[#003d10] px-3 py-2">
                      <button className="text-[#5a9a5a] text-[10px] hover:text-[#33ff66] mr-2">[EDIT]</button>
                      {s.isActive && <button className="text-[#5a9a5a] text-[10px] hover:text-[#ffaa00]">[RESOLVE]</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === 'operators' && (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-[#0a1018] text-[#5a9a5a] text-[10px] tracking-[1px] uppercase">
                <th className="border border-[#003d10] px-3 py-2 text-left">NICK</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">RANK</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">ROLE</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">STATUS</th>
                <th className="border border-[#003d10] px-3 py-2 text-left">LAST SEEN</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map(p => (
                <tr key={p.nick} className="hover:bg-[#33ff66]/[0.04]">
                  <td className="border border-[#003d10] px-3 py-2 text-[#33ff66]">{p.nick}</td>
                  <td className="border border-[#003d10] px-3 py-2 text-[#5a9a5a]">RANK {p.rank}</td>
                  <td className="border border-[#003d10] px-3 py-2 text-[#5a9a5a]">{['OFFICER','SUPERVISOR','SUPER-SUPERVISOR'][p.role]}</td>
                  <td className="border border-[#003d10] px-3 py-2">
                    {p.isAFK ? <span className="text-[#ffaa00]">● AFK</span> : <span className="text-[#33ff66]">● ONLINE</span>}
                  </td>
                  <td className="border border-[#003d10] px-3 py-2 text-[#5a9a5a] text-[10px]">
                    {p.lastUpdate ? new Date(p.lastUpdate).toLocaleTimeString('en-US', { hour12: false }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="h-[28px] shrink-0 flex items-center justify-center gap-4 bg-[#0a1018] border-t border-[#003d10] text-[10px] text-[#5a9a5a]">
        <button className="hover:text-[#33ff66]">&lt; PREV</button>
        <span>PAGE 1 OF 1</span>
        <button className="hover:text-[#33ff66]">NEXT &gt;</button>
      </div>
    </div>
  );
}
