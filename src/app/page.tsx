import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { UploadButton } from "@/components/upload-button";
import { getDb, schema } from "@/db";
import { CURATED } from "@/worlds";

export default async function Home() {
  await connection();
  const db = getDb();
  const community = await db
    .select({ id: schema.worlds.id, title: schema.worlds.title, rootSceneId: schema.worlds.rootSceneId, image: schema.scenes.imageUrl })
    .from(schema.worlds)
    .innerJoin(schema.scenes, eq(schema.scenes.id, schema.worlds.rootSceneId))
    .where(and(eq(schema.worlds.visibility, "public"), eq(schema.worlds.status, "ready"), isNull(schema.worlds.slug)))
    .orderBy(desc(schema.worlds.createdAt))
    .limit(12);

  return (
    <main className="pb-safe pt-safe mx-auto min-h-dvh max-w-md px-4">
      <header className="pt-6 pb-6">
        <h1 className="font-serif text-4xl tracking-tight text-glow">Forkworld</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-paper/70">
          An endless point-and-click adventure. Tap anything in the picture, choose what to do, and watch what happens. Every choice grows
          the world for everyone.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {CURATED.map((w) => (
          <Link
            key={w.slug}
            href={`/play/${w.slug}`}
            className="group relative block overflow-hidden rounded-3xl ring-1 ring-white/10 active:scale-[0.99]"
          >
            <img src={w.seed} alt="" className="h-72 w-full object-cover" />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/45 to-transparent p-4">
              <h2 className="font-serif text-2xl text-paper">{w.title}</h2>
              <p className="mt-1 text-sm leading-snug text-paper/75">{w.blurb}</p>
              <span className="mt-3 self-start rounded-full bg-glow px-4 py-2 text-sm font-semibold text-ink">Enter</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <UploadButton />
      </section>

      {community.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-paper/50">Worlds others started</h2>
          <div className="grid grid-cols-3 gap-2">
            {community.map((w) => (
              <Link key={w.id} href={`/s/${w.rootSceneId}`} className="relative block overflow-hidden rounded-2xl ring-1 ring-white/10">
                <img src={w.image} alt="" className="aspect-[9/16] w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 text-[11px] font-medium">
                  {w.title}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 mb-4 text-center text-[11px] leading-relaxed text-paper/35">
        {CURATED.map((w) => (
          <p key={w.slug}>{w.credit}</p>
        ))}
      </footer>
    </main>
  );
}
