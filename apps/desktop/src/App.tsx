import { HashRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { NewInstanceDialog } from "./components/NewInstanceDialog";
import { Home } from "./pages/Home";
import { Discover } from "./pages/Discover";
import { Transfer } from "./pages/Transfer";
import { Settings } from "./pages/Settings";
import { AppProvider } from "./state";

export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="flex h-full">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/discover/:category" element={<Discover />} />
                <Route path="/transfer" element={<Transfer />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
        <NewInstanceDialog />
      </HashRouter>
    </AppProvider>
  );
}
