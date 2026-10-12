/** Label for a fare that can actually be purchased. A full cabin is not priced at $50. */
export function offeredFareLabel(fare: number | null, soldOut: boolean): string {
  if (soldOut) return "SOLD OUT";
  if (fare === null) return "—";
  return `$${fare}`;
}
