import { Suspense } from "react";
import { DecisionExplorer } from "@/components/DecisionExplorer";

export const metadata = {
  title: "Flight Optimizer — Decision Explorer",
  description: "Inspect why Myopic and Optimized pricing choose a fare from the active demand model.",
};

export default function DecisionExplorerPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-4 lg:px-10">
          <p className="text-[13px] font-semibold tracking-[0.18em] text-navy">FLIGHT OPTIMIZER</p>
          <p className="mt-0.5 text-[15px] text-muted">Decision Explorer</p>
        </div>
      }
    >
      <DecisionExplorer />
    </Suspense>
  );
}
