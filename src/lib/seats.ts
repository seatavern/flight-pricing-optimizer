import type { Seat } from "@/lib/types";
import { FLIGHT } from "@/lib/constants";

const PORT_LETTERS: Array<{ letter: string; slot: 0 | 1 | 2 }> = [
  { letter: "A", slot: 0 },
  { letter: "B", slot: 1 },
  { letter: "C", slot: 2 },
];

const STARBOARD_LETTERS: Array<{ letter: string; slot: 0 | 1 | 2 }> = [
  { letter: "D", slot: 0 },
  { letter: "E", slot: 1 },
  { letter: "F", slot: 2 },
];

export const CABIN_ROWS = 17;

function lettersForRow(row: number) {
  // Row 1 is a 2-2 forward cabin so the map stays at exactly 100 seats.
  if (row === 1) {
    return {
      port: PORT_LETTERS.filter((seat) => seat.slot !== 1),
      starboard: STARBOARD_LETTERS.filter((seat) => seat.slot !== 1),
    };
  }
  return { port: PORT_LETTERS, starboard: STARBOARD_LETTERS };
}

export function createSeats(): Seat[] {
  const seats: Seat[] = [];

  for (let row = 1; row <= CABIN_ROWS; row += 1) {
    const { port, starboard } = lettersForRow(row);
    for (const seat of port) {
      seats.push({
        id: `${row}${seat.letter}`,
        row,
        letter: seat.letter,
        side: "port",
        slot: seat.slot,
      });
    }
    for (const seat of starboard) {
      seats.push({
        id: `${row}${seat.letter}`,
        row,
        letter: seat.letter,
        side: "starboard",
        slot: seat.slot,
      });
    }
  }

  if (seats.length !== FLIGHT.capacity) {
    throw new Error(`Seat map must contain ${FLIGHT.capacity} seats, got ${seats.length}`);
  }

  return seats;
}

export const SEATS = createSeats();

export const SEAT_IDS_FRONT_TO_BACK = [...SEATS].sort((a, b) => {
  if (a.row !== b.row) return a.row - b.row;
  return a.letter.localeCompare(b.letter);
});
