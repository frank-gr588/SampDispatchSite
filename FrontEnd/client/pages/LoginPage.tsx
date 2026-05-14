import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [badge, setBadge] = useState('');
  const [pass, setPass] = useState('');
  const [stage, setStage] = useState<'idle' | 'loading' | 'granted'>('idle');
  const [loadText, setLoadText] = useState('');
  const navigate = useNavigate();

  const handleAuth = () => {
    if (!badge || !pass) return;
    setStage('loading');
    const steps = [
      'INITIALIZING CONNECTION...',
      'LOADING UNIT DATABASE...',
      'AUTHENTICATING OPERATOR...',
      'ACCESS GRANTED',
    ];
    let i = 0;
    const iv = setInterval(() => {
      setLoadText(steps[i]);
      i++;
      if (i >= steps.length) {
        clearInterval(iv);
        setTimeout(() => navigate('/'), 600);
      }
    }, 800);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#020304]">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'radial-gradient(circle, #33ff66 1px, transparent 1px)',
        backgroundSize: '32px 32px'
      }} />

      <div className="relative w-[420px] border border-[#003d10] bg-[#060a0e] p-0">
        {/* Header */}
        <div className="border-b border-[#003d10] bg-[#0a1018] px-4 py-3">
          <div className="text-[#33ff66] text-[12px] tracking-[3px] uppercase">LSPD DISPATCH SYSTEM</div>
          <div className="text-[#5a9a5a] text-[10px] tracking-[2px] uppercase mt-1">// ACCESS CONTROL</div>
        </div>

        <div className="p-4 space-y-4">
          {stage === 'idle' && (
            <>
              <div className="space-y-1">
                <label className="text-[#5a9a5a] text-[10px] uppercase tracking-[2px]">BADGE ID</label>
                <input value={badge} onChange={e => setBadge(e.target.value)}
                  className="w-full bg-[#020304] border border-[#007a1f] text-[#33ff66] text-[11px] px-3 py-2 outline-none focus:border-[#33ff66] focus:shadow-[0_0_8px_#33ff6630] placeholder:text-[#003d10] uppercase tracking-[1px]"
                  placeholder="[ ENTER BADGE ]" />
              </div>
              <div className="space-y-1">
                <label className="text-[#5a9a5a] text-[10px] uppercase tracking-[2px]">PASSWORD</label>
                <input type="password" value={pass} onChange={e => setPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  className="w-full bg-[#020304] border border-[#007a1f] text-[#33ff66] text-[11px] px-3 py-2 outline-none focus:border-[#33ff66] focus:shadow-[0_0_8px_#33ff6630] placeholder:text-[#003d10]"
                  placeholder="[ •••••••• ]" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleAuth}
                  className="flex-1 border border-[#007a1f] bg-[#003d10] text-[#33ff66] text-[10px] uppercase tracking-[2px] py-2 hover:bg-[#007a1f] hover:text-[#020304] transition-colors">
                  AUTHENTICATE
                </button>
                <button className="border border-[#003d10] text-[#5a9a5a] text-[10px] uppercase tracking-[2px] px-4 py-2 hover:text-[#33ff66] hover:border-[#33ff66]">
                  NEW OPERATOR
                </button>
              </div>
            </>
          )}

          {stage === 'loading' && (
            <div className="py-8 text-center">
              <div className="text-[#33ff66] text-[10px] tracking-[2px] uppercase animate-pulse">{loadText}</div>
              <div className="mt-3 flex justify-center gap-1">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-[8px] h-[2px] bg-[#33ff66] animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#003d10] px-4 py-2 flex justify-between text-[10px] text-[#5a9a5a] uppercase tracking-[1px]">
          <span>SERVER: RP_CITY_01 // <span className="text-[#33ff66]">ONLINE</span></span>
          <span>LAST LOGIN: {new Date().toISOString().replace('T', ' ').substring(0, 19)}</span>
        </div>
      </div>
    </div>
  );
}
