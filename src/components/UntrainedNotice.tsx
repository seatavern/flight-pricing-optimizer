import Link from "next/link";

export function UntrainedNotice({
  error,
  detail,
}: {
  error: string;
  detail: string;
}) {
  const untrained = error.toLowerCase().includes("not trained");
  return (
    <section className="mt-5 border border-line bg-panel px-4 py-3">
      {untrained ? (
        <>
          <p className="text-[13px] font-medium text-navy">NO ACTIVE DEMAND MODEL</p>
          <p className="mt-1 text-[13px] leading-5 text-muted">{detail}</p>
        </>
      ) : (
        <p className="text-[13px] text-navy">{error}</p>
      )}
      <Link
        href="/model-lab"
        className="mt-2 inline-block text-[11px] font-semibold tracking-[0.14em] text-navy hover:text-navy-deep"
      >
        OPEN MODEL LAB
      </Link>
    </section>
  );
}
