import { Component, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Safety net: if any part of the UI throws, show what happened instead of a black window,
 * and let the user carry on. `area` boundaries wrap individual pages/panels so one broken
 * view never takes the whole app down.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; area?: string; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ember] UI error", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full min-h-[300px] place-items-center p-8">
        <div className="glass max-w-lg rounded-panel p-6 text-center">
          <p className="text-[17px] font-bold">{this.props.area ? `This ${this.props.area} hit a problem` : "Something went wrong"}</p>
          <p className="mt-2 text-[13px] text-muted" data-selectable>{this.state.error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={this.reset} className="press inline-flex items-center gap-2 rounded-card bg-copper px-4 py-2 text-[14px] font-medium text-on-accent">
              <RotateCcw className="size-4" /> Try again
            </button>
            <button type="button" onClick={() => location.reload()} className="press rounded-card bg-slate-raised px-4 py-2 text-[14px]">Reload Ember</button>
          </div>
        </div>
      </div>
    );
  }
}
