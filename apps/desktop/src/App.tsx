import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ContentCategory } from "@ember/content-engine";
import { AppProvider, queryClient, useApp } from "./state";
import { Backdrop, Sidebar, Toaster, TopBar } from "./components/layout";
import { NewInstanceDialog } from "./components/NewInstanceDialog";
import { CommandPalette } from "./components/CommandPalette";
import { ProjectDrawer } from "./components/ProjectDrawer";
import { Onboarding } from "./components/Onboarding";
import { LanguagePicker } from "./components/LanguagePicker";
import { Home } from "./pages/Home";
import { Discover } from "./pages/Discover";
import { Favorites } from "./pages/Favorites";
import { InstancePage } from "./pages/Instance";
import { Servers } from "./pages/Servers";
import { WorldPacks } from "./pages/WorldPacks";
import { Transfer } from "./pages/Transfer";
import { Settings } from "./pages/Settings";
import { prefetchDiscover } from "./lib/queries";
import { startLogCapture } from "./lib/logs";
import { motionFactor, transitionProps } from "./lib/appearance";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateDialog } from "./components/UpdateDialog";

// Loaded on first visit: the 3D skin viewer (three.js) is big.
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));

const CATS: ContentCategory[] = ["mods", "resourcepacks", "datapacks", "shaders", "modpacks", "plugins"];

function Pages() {
  const location = useLocation();
  const { appearance } = useApp();
  // Route-level transition keyed on the first path segment, so tab changes inside a page don't re-animate the page.
  const key = location.pathname.split("/").slice(0, 3).join("/");
  return (
    <AnimatePresence mode="wait">
      <motion.div key={key} {...transitionProps(appearance)} className="min-h-full">
        {/* A broken page shows an error card instead of blanking the window; changing page resets it. */}
        <ErrorBoundary area="page" key={key}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/discover/:category" element={<Discover />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/instance/:id" element={<InstancePage />} />
          <Route path="/packs" element={<WorldPacks />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/servers/:id" element={<Servers />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/account" element={<Suspense fallback={null}><Account /></Suspense>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

function Shell() {
  const { appearance, instances } = useApp();
  // Warm the Discover cache in the background so the first visit is instant.
  useEffect(() => {
    startLogCapture();
    const first = instances[0];
    const t = setTimeout(() => {
      for (const c of CATS) {
        const forInstance = c !== "plugins" && c !== "modpacks";
        prefetchDiscover(queryClient, "modrinth", c, {
          gameVersion: forInstance ? first?.gameVersion : undefined,
          loader: c === "mods" && first && first.loader !== "vanilla" ? first.loader : undefined,
          sort: c === "modpacks" ? "follows" : "downloads",
          page: 0,
        });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [instances[0]?.id]);

  const f = motionFactor(appearance);
  return (
    <MotionConfig reducedMotion={appearance.motion === "off" ? "always" : "never"} transition={f === 0 ? { duration: 0 } : undefined}>
      <Backdrop />
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <Pages />
          </main>
        </div>
      </div>
      <ErrorBoundary area="dialog"><NewInstanceDialog /></ErrorBoundary>
      <ErrorBoundary area="dialog"><CommandPalette /></ErrorBoundary>
      <ErrorBoundary area="panel"><ProjectDrawer /></ErrorBoundary>
      <ErrorBoundary area="tour"><Onboarding /></ErrorBoundary>
      <ErrorBoundary area="language"><LanguagePicker /></ErrorBoundary>
      <ErrorBoundary area="dialog"><UpdateDialog /></ErrorBoundary>
      <Toaster />
    </MotionConfig>
  );
}

export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </HashRouter>
    </AppProvider>
  );
}
