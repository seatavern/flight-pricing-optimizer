export type PricingStrategy = "fixed" | "myopic" | "optimized";

export type SeatSide = "port" | "starboard";

export type Seat = {
  id: string;
  row: number;
  letter: string;
  side: SeatSide;
  slot: 0 | 1 | 2;
};

export type FareKind = "fixed" | "myopic" | "optimized";

export type PeriodSnapshot = {
  period: number;
  occupiedSeatIds: string[];
  revenue: number;
  realizedBookings: number | null;
  selectedFare: number | null;
  fareKind: FareKind;
  trueMarketMean: number | null;
  mlPredictedMean: number | null;
  immediateExpectedRevenue: number | null;
  futureValue: number | null;
  totalValue: number | null;
};
