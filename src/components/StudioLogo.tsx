export function StudioCrest({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#131722" stroke="#D97706" strokeWidth="1.5" />
      <path
        d="M24 9L34 23L24 39L14 23L24 9Z"
        stroke="#F59E0B"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M24 9V39" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 24H38" stroke="#9CA3AF" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
      <circle cx="24" cy="23" r="3" fill="#F59E0B" />
    </svg>
  );
}

export function StudioArchitecturalCanvas() {
  return (
    <div className="relative w-full h-full min-h-[320px] rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#131826] via-[#0E121B] to-[#1A1412]">
      <svg
        viewBox="0 0 640 420"
        className="w-full h-full object-cover opacity-80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Elder'sVeil Anime Studio Architectural Production Grid"
      >
        <defs>
          <radialGradient id="amberGlow" cx="72%" cy="32%" r="55%">
            <stop offset="0%" stopColor="#D97706" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0B0D12" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="640" height="420" fill="url(#amberGlow)" />
        {/* Perspective production cel grid */}
        <g stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="1">
          <line x1="0" y1="70" x2="640" y2="70" />
          <line x1="0" y1="140" x2="640" y2="140" />
          <line x1="0" y1="210" x2="640" y2="210" />
          <line x1="0" y1="280" x2="640" y2="280" />
          <line x1="0" y1="350" x2="640" y2="350" />
          <line x1="106" y1="0" x2="106" y2="420" />
          <line x1="212" y1="0" x2="212" y2="420" />
          <line x1="320" y1="0" x2="320" y2="420" />
          <line x1="428" y1="0" x2="428" y2="420" />
          <line x1="534" y1="0" x2="534" y2="420" />
        </g>
        {/* Safe-area cinema frame & registration pegs */}
        <rect x="72" y="54" width="496" height="312" rx="4" stroke="#F59E0B" strokeOpacity="0.45" strokeWidth="1.2" />
        <rect x="104" y="82" width="432" height="256" stroke="#9CA3AF" strokeOpacity="0.22" strokeDasharray="6 4" strokeWidth="1" />
        <circle cx="240" cy="40" r="5" stroke="#F59E0B" strokeOpacity="0.55" strokeWidth="1.2" />
        <circle cx="320" cy="40" r="5" stroke="#F59E0B" strokeOpacity="0.75" strokeWidth="1.2" />
        <circle cx="400" cy="40" r="5" stroke="#F59E0B" strokeOpacity="0.55" strokeWidth="1.2" />
        {/* Stylized torii / mountain horizon silhouette */}
        <path
          d="M104 310 C180 265, 240 278, 315 245 C390 212, 465 252, 536 285 L536 338 L104 338 Z"
          fill="#161C2B"
          stroke="#F59E0B"
          strokeOpacity="0.32"
          strokeWidth="1.2"
        />
        <circle cx="458" cy="146" r="42" stroke="#F59E0B" strokeOpacity="0.5" strokeWidth="1.5" />
        <path d="M298 205L320 165L342 205L320 245Z" stroke="#F59E0B" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/80 to-transparent">
        <p className="text-xs font-mono-tabular tracking-wider text-amber-400">
          UNIFIED 10-DEPARTMENT PRODUCTION ECOSYSTEM
        </p>
        <p className="text-sm text-gray-300 mt-1">
          From feudal Samurai lore &amp; Story manuscripts to 2D/3D Animation, Audio mastering, and Video release.
        </p>
      </div>
    </div>
  );
}
