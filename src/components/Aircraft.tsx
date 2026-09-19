import { CABIN_ROWS, SEATS } from "@/lib/seats";
import { FLIGHT } from "@/lib/constants";

const VB_W = 1400;
const VB_H = 252;
const CY = 126;

type AircraftProps = {
  occupiedSeatIds: ReadonlySet<string> | readonly string[];
  animateOccupancy?: boolean;
};

function occupiedSet(ids: AircraftProps["occupiedSeatIds"]): Set<string> {
  return ids instanceof Set ? ids : new Set(ids);
}

function mirrorY(y: number): number {
  return 2 * CY - y;
}

function pointsToPath(points: Array<[number, number]>): string {
  return `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`;
}

function mirrorPath(points: Array<[number, number]>): string {
  return pointsToPath(points.map(([x, y]) => [x, mirrorY(y)]));
}

export function Aircraft({ occupiedSeatIds, animateOccupancy = false }: AircraftProps) {
  const occupied = occupiedSet(occupiedSeatIds);
  const sold = occupied.size;

  const cabinRearX = 242;
  const cabinFrontX = 1172;
  const rowPitch = (cabinFrontX - cabinRearX) / (CABIN_ROWS - 1);
  const xForRow = (row: number) => cabinFrontX - (row - 1) * rowPitch;

  const seatW = 25;
  const seatH = 9.1;
  const seatGap = 2.85;
  const aisleHalf = 6.8;
  const seatRx = 2.3;

  const portTops = [
    CY - aisleHalf - 3 * seatH - 2 * seatGap,
    CY - aisleHalf - 2 * seatH - seatGap,
    CY - aisleHalf - seatH,
  ] as const;
  const starboardTops = [
    CY + aisleHalf,
    CY + aisleHalf + seatH + seatGap,
    CY + aisleHalf + 2 * seatH + 2 * seatGap,
  ] as const;

  const seatTop = (side: "port" | "starboard", slot: 0 | 1 | 2) =>
    side === "port" ? portTops[slot] : starboardTops[slot];

  // Roots sit inside the fuselage so the body covers the join. Chord and
  // span stay near the current size; only sweep/taper is strengthened.
  const wingInnerY = CY - 16;
  const mainWing: Array<[number, number]> = [
    [620, wingInnerY],
    [550, -96],
    [665, -96],
    [800, wingInnerY],
  ];

  const stabInnerY = CY - 14;
  const stabilizer: Array<[number, number]> = [
    [138, stabInnerY],
    [122, 50],
    [166, 50],
    [218, stabInnerY],
  ];

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 bg-seat-taken" />
          Occupied
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 bg-seat-open" />
          Available
        </span>
        <span className="text-muted-2">
          {sold} of {FLIGHT.capacity} seats sold
        </span>
      </div>
      <div className="relative aspect-[1400/170] w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="absolute top-1/2 left-0 h-auto w-full -translate-y-1/2"
          overflow="hidden"
          role="img"
          aria-label={`Seat map, ${sold} of ${FLIGHT.capacity} seats occupied`}
          shapeRendering="geometricPrecision"
        >
        <path
          d={pointsToPath(mainWing)}
          fill="#c5d0da"
          stroke="#a8b6c2"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d={mirrorPath(mainWing)}
          fill="#c5d0da"
          stroke="#a8b6c2"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d={pointsToPath(stabilizer)}
          fill="#c5d0da"
          stroke="#a8b6c2"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d={mirrorPath(stabilizer)}
          fill="#c5d0da"
          stroke="#a8b6c2"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />

        <path
          d={`
            M 108 126
            C 108 116 134 82 214 80
            L 1204 80
            C 1284 82 1310 116 1310 126
            C 1310 136 1284 170 1204 172
            L 214 172
            C 134 170 108 136 108 126
            Z
          `}
          fill="#f6f8fa"
          stroke="#8a9cb0"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />

        <line
          x1={cabinRearX - 10}
          x2={cabinFrontX + 18}
          y1={CY}
          y2={CY}
          stroke="#d4dde5"
          strokeWidth="1.15"
        />

        {SEATS.map((seat) => {
          const x = xForRow(seat.row) - seatW / 2;
          const y = seatTop(seat.side, seat.slot);
          const isOccupied = occupied.has(seat.id);
          return (
            <rect
              key={seat.id}
              x={x}
              y={y}
              width={seatW}
              height={seatH}
              rx={seatRx}
              className={animateOccupancy ? "seat-fill-transition" : undefined}
              fill={isOccupied ? "#1b3a57" : "#c5d3de"}
            >
              <title>{seat.id}</title>
            </rect>
          );
        })}
        </svg>
      </div>
    </div>
  );
}
