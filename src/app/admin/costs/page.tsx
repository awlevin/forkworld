import { desc, gte, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb, schema } from "@/db";
import { falBilledUsage } from "@/lib/ai/fal-billing";

/** Spend per model and per step. Open with ?key=ADMIN_KEY. */
export default async function Costs({ searchParams }: { searchParams: Promise<{ key?: string; days?: string }> }) {
  await connection();
  const { key, days } = await searchParams;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) notFound();
  const since = daysAgo(Number(days ?? 7));
  const db = getDb();
  const c = schema.costs;
  const usd = sql<number>`coalesce(sum(${c.usd}), 0)::float`;
  const calls = sql<number>`count(*)::int`;
  const avgMs = sql<number>`coalesce(avg(${c.durationMs}), 0)::float`;
  const byModel = await db.select({ model: c.model, usd, calls, avgMs }).from(c).where(gte(c.createdAt, since)).groupBy(c.model).orderBy(desc(usd));
  const byStep = await db.select({ step: c.step, usd, calls, avgMs }).from(c).where(gte(c.createdAt, since)).groupBy(c.step).orderBy(desc(usd));
  const byDay = await db
    .select({ day: sql<string>`to_char(${c.createdAt}, 'YYYY-MM-DD')`, usd })
    .from(c)
    .where(gte(c.createdAt, since))
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`);
  const [edges] = await db
    .select({ n: sql<number>`count(distinct ${c.edgeId})::int`, usd: sql<number>`coalesce(sum(${c.usd}) filter (where ${c.edgeId} is not null), 0)::float` })
    .from(c)
    .where(gte(c.createdAt, since));
  const recent = await db.select().from(schema.events).orderBy(desc(schema.events.createdAt)).limit(40);
  const falBilled = await falBilledUsage(since, new Date());
  const loggedFal = byModel.filter((r) => r.model.startsWith("fal-ai/"));
  const total = byModel.reduce((s, r) => s + r.usd, 0);
  const money = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

  return (
    <main className="pt-safe pb-safe mx-auto max-w-md px-4 py-6 text-sm">
      <h1 className="font-serif text-2xl text-glow">Spend, last {days ?? 7} days</h1>
      <p className="mt-2 text-paper/70">
        {money(total)} total · {edges.n} new paths · {edges.n ? money(edges.usd / edges.n) : "–"} per path
      </p>
      <Table title="By model" rows={byModel.map((r) => [r.model, r.calls, `${(r.avgMs / 1000).toFixed(1)}s`, money(r.usd)])} />
      <Table title="By step" rows={byStep.map((r) => [r.step, r.calls, `${(r.avgMs / 1000).toFixed(1)}s`, money(r.usd)])} />
      <Table title="By day" rows={byDay.map((r) => [r.day, "", "", money(r.usd)])} />
      <section className="mt-6">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-paper/50">fal: logged vs billed by fal</h2>
        {"error" in falBilled ? (
          <p className="text-xs text-paper/50">{falBilled.error}</p>
        ) : (
          <Table
            title=""
            rows={[...new Set([...loggedFal.map((r) => r.model), ...falBilled.rows.map((r) => r.endpoint)])].map((m) => [
              m,
              money(loggedFal.find((r) => r.model === m)?.usd ?? 0),
              "billed",
              money(falBilled.rows.filter((r) => r.endpoint === m).reduce((s, r) => s + r.usd, 0)),
            ])}
          />
        )}
      </section>
      <p className="mt-6 text-xs text-paper/40">Prices are estimates from src/lib/ai/pricing.ts.</p>
      <section className="mt-8">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-paper/50">Recent job events</h2>
        <ul className="flex flex-col gap-2 text-xs">
          {recent.map((e) => (
            <li key={e.id} className={`rounded-xl p-2 ${e.level === "error" ? "bg-red-500/15" : "bg-white/5"}`}>
              <span className="text-paper/50">{e.createdAt.toISOString().slice(11, 19)} {e.subject}</span> {e.message}
              {e.data && <pre className="mt-1 whitespace-pre-wrap break-all text-paper/60">{JSON.stringify(e.data)}</pre>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

function Table({ title, rows }: { title: string; rows: (string | number)[][] }) {
  return (
    <section className="mt-6">
      {title && <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-paper/50">{title}</h2>}
      <table className="w-full">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/5">
              <td className="max-w-[12rem] truncate py-1.5 pr-2">{r[0]}</td>
              <td className="py-1.5 text-right tabular-nums text-paper/50">{r[1]}</td>
              <td className="py-1.5 text-right tabular-nums text-paper/50">{r[2]}</td>
              <td className="py-1.5 text-right tabular-nums">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
