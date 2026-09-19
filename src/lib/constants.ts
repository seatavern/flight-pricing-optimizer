export const FLIGHT = {
  code: "SK 945",
  origin: "ARN",
  destination: "JFK",
  capacity: 100,
  openingPeriod: 10,
} as const;

export const FARES = [50, 60, 70, 80, 90, 100, 110, 120, 130] as const;
export type Fare = (typeof FARES)[number];

export const DEFAULT_FARE: Fare = 100;
export const DEFAULT_EXPLORER_PERIOD = 2;
export const DEFAULT_EXPLORER_REMAINING = 48;
export const CHART_MAX_BOOKINGS = 18;
export const TIMELINE_PERIODS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const;

export function periodLabel(period: number): string {
  return period === 0 ? "Departure" : `T-${period}`;
}
