import { PolicyMap } from "@/components/PolicyMap";

export const metadata = {
  title: "Flight Optimizer — Policy Map",
  description: "See where Myopic and Optimized pricing select different fares across the state space.",
};

export default function PolicyMapPage() {
  return <PolicyMap />;
}
