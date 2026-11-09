import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ContentCategory } from "@ember/content-engine";
import { AppProvider, queryClient, useApp } from "./state";
import { Backdrop, Sidebar, Toaster, TopBar } from "./components/layout";
import { NewInstanceDialog } from "./components/NewInstanceDialog";
import { CommandPalette } from "./components/CommandPalette";
import { ProjectDrawer } from "./components/ProjectDrawer";
import { Onboarding } from "./components/Onboarding";
import { Home } from "./pages/Home";
import { Discover } from "./pages/Discover";
import { Favorites } from "./pages/Favorites";
import { InstancePage } from "./pages/Instance";
import { Servers } from "./pages/Servers";
import { Transfer } from "./pages/Transfer";
import { Settings } from "./pages/Settings";
import { prefetchDiscover } from "./lib/queries";
import { startLogCapture } from "./lib/logs";
import { motionFactor } from "./lib/appearance";

const CATS: ContentCategory[] = ["mods", "resourcepacks", "datapacks", "shaders", "modpacks", "plugins"];

function Pages() {
  const location = useLocation();
  // Route-level transition keyed on the first path segment, so tab changes inside a page don't re-animate the page.
  const key = location.pathname.split("/").slice(0, 3).join("/");
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="min-h-full"
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/discover/:category" element={<Discover />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/instance/:id" element={<InstancePage />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/servers/:id" element={<Servers />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
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
      <NewInstanceDialog />
      <CommandPalette />
      <ProjectDrawer />
      <Onboarding />
      <Toaster />
    </MotionConfig>
  );
}

export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppProvider>
  );
}
