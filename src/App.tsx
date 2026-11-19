import { useState } from 'react';
import { StudioAuthProvider, useStudioAuth } from './contexts/StudioAuthContext.tsx';
import { PublicPortal } from './components/PublicPortal.tsx';
import { StudioShell } from './components/StudioShell.tsx';

function RootRouter() {
  const { studioUser, loading } = useStudioAuth();
  const [forcePublic, setForcePublic] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0D12] text-gray-300 flex items-center justify-center text-sm">
        Initializing Elder&apos;sVeil Anime Studio...
      </div>
    );
  }

  const isMember = studioUser && studioUser.role !== 'GUEST';
  if (isMember && !forcePublic) {
    return <StudioShell onExitToPublic={() => setForcePublic(true)} />;
  }

  return <PublicPortal onEnterStudio={() => setForcePublic(false)} />;
}

export default function App() {
  return (
    <StudioAuthProvider>
      <RootRouter />
    </StudioAuthProvider>
  );
}
