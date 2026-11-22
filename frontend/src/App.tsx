import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { MoodProvider } from "./components/MoodProvider";
import Onboarding from "./components/Onboarding";
import { VaultProvider } from "./components/VaultProvider";
import { useNoAutofill } from "./config/useNoAutofill";
import Archive from "./pages/Archive";
import Gate from "./pages/Gate";
import Journal from "./pages/Journal";
import Photos from "./pages/Photos";
import Placeholder from "./pages/Placeholder";
import SideQuestDetail from "./pages/SideQuestDetail";
import SideQuests from "./pages/SideQuests";
import TrackDetail from "./pages/TrackDetail";
import Tracks from "./pages/Tracks";
import Weekly from "./pages/Weekly";
import WakePage from "./pages/WakePage";
import Now from "./pages/Now";
import NowArchive from "./pages/NowArchive";
import MapRoom from "./pages/MapRoom";
import Observatory from "./pages/Observatory";
import Circle from "./pages/Circle";
import ThoughtDetail from "./pages/ThoughtDetail";
import Thoughts from "./pages/Thoughts";
import Privacy from "./pages/Privacy";
import Settings from "./pages/Settings";

// Same floating window the rest of the app lives in, so the lock screen matches.
function GateFrame({ children }: { children: ReactNode }) {
  return (
    <div className="desktop-backdrop h-dvh w-full overflow-hidden lg:p-7 xl:p-9">
      <div className="relative mx-auto flex h-full w-full overflow-hidden bg-bg text-text lg:max-w-[1440px] lg:rounded-[22px] lg:border lg:border-window lg:shadow-window">
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { status } = useAuth();
  const { pathname } = useLocation();

  if (status === "loading") return null;
  if (status === "locked")
    return (
      <GateFrame>
        {/* Signed-out visitors can still read the policy (Google's consent screen needs it). */}
        {pathname === "/privacy" ? <Privacy standalone /> : <Gate />}
      </GateFrame>
    );

  return (
    <>
      {/* Outside VaultProvider on purpose: the welcome cards show first, and the vault
          screen is waiting behind them until the user finishes or skips. */}
      <Onboarding />
      <VaultProvider>
        <MoodProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Journal />} />
              <Route path="day/:date" element={<Journal />} />
              <Route path="archive" element={<Archive />} />
              <Route path="weekly" element={<Weekly />} />
              <Route path="now" element={<Now />} />
              <Route path="now/archive" element={<NowArchive />} />
              <Route path="scenarios" element={<Placeholder title="Scenarios" />} />
              <Route path="side-quests" element={<SideQuests />} />
              <Route path="tracks" element={<Tracks />} />
              <Route path="tracks/:id" element={<TrackDetail />} />
              <Route path="side-quests/:id" element={<SideQuestDetail />} />
              <Route path="photos" element={<Photos />} />
              <Route path="observatory" element={<Observatory />} />
              <Route path="map-room" element={<MapRoom />} />
              <Route path="stats" element={<Placeholder title="Stats" />} />
              <Route path="search" element={<Placeholder title="Search" />} />
              <Route path="/circle" element={<Circle />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />

              <Route path="thoughts" element={<Thoughts />} />
              <Route path="thoughts/:id" element={<ThoughtDetail />} />
            </Route>
          </Routes>
        </MoodProvider>
      </VaultProvider>
    </>
  );
}

export default function App() {
  useNoAutofill();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/wake" element={<WakePage />} />
        <Route
          path="/*"
          element={
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}