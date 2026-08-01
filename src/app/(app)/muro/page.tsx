import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Composer, PostCard, LoadMore } from './ui';
import { Novedades } from '@/components/Novedades';
import type { WallRef } from '@/lib/actions/wall';

export const metadata = { title: 'Muro' };

type Walls = {
  general: boolean; can_post_general: boolean; is_admin: boolean;
  ministries: { id: string; name: string }[]; steps: number[];
  led_ministries: string[]; speaker_steps: number[]; servant_ministries?: string[];
};

export default async function MuroPage({ searchParams }: { searchParams: { w?: string } }) {
  const { supabase } = await requireUser();
  const { data, error: wallsError } = await supabase.rpc('get_my_walls');
  const walls = (data ?? {
    general: false, can_post_general: false, is_admin: false,
    ministries: [], steps: [], led_ministries: [], speaker_steps: [], servant_ministries: [],
  }) as Walls;

  const tabs: { key: string; label: string }[] = [
    ...(walls.general ? [{ key: 'general', label: 'General' }] : []),
    ...walls.ministries.map((m) => ({ key: `m:${m.id}`, label: m.name })),
    ...[...walls.steps].sort((a, b) => a - b).map((n) => ({ key: `s:${n}`, label: `Paso ${n}` })),
  ];

  if (tabs.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold">Muro</h1>
        {/* No silenciar errores del RPC: sin esto, un fallo se vería como "no tienes muros" (lección migración 010) */}
        {wallsError && <div className="card text-sm text-red-600">{wallsError.message}</div>}
        <div className="card text-center py-10 space-y-2">
          <Newspaper className="w-10 h-10 mx-auto text-gray-300" aria-hidden />
          <p className="font-medium">Aún no tienes muros disponibles</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            El muro general se abre al convertirte en miembro activo; también verás el muro de tu
            ministerio y el de tu paso cuando estés en un curso activo.
          </p>
        </div>
      </div>
    );
  }

  const sel = tabs.some((t) => t.key === searchParams.w) ? searchParams.w! : tabs[0].key;
  const ref: WallRef = sel === 'general'
    ? { wall: 'general' }
    : sel.startsWith('m:')
      ? { wall: 'ministry', ministryId: sel.slice(2) }
      : { wall: 'step', step: Number(sel.slice(2)) };
  const canPost = walls.is_admin
    || (ref.wall === 'general' && walls.can_post_general)
    // Fase 3g: además del director, quien él autorizó a publicar en su muro.
    || (ref.wall === 'ministry' && walls.led_ministries.includes(ref.ministryId!))
    || (ref.wall === 'ministry' && (walls.servant_ministries ?? []).includes(ref.ministryId!))
    || (ref.wall === 'step' && walls.speaker_steps.includes(ref.step!));

  // Las novedades (anuncios + cumpleaños) solo acompañan al muro general:
  // en el de un ministerio o un paso serían ruido fuera de contexto.
  const [{ data: postsData, error }, { data: birthdays, error: bdError }, { data: news, error: newsError }] = await Promise.all([
    supabase.rpc('get_wall_posts', {
      p_wall: ref.wall, p_ministry: ref.ministryId ?? null, p_step: ref.step ?? null,
    }),
    ref.wall === 'general' ? supabase.rpc('get_week_birthdays') : Promise.resolve({ data: [], error: null }),
    ref.wall === 'general' ? supabase.rpc('get_news', { p_limit: 2 }) : Promise.resolve({ data: [], error: null }),
  ]);
  const posts = (postsData as any[]) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Muro</h1>
      {tabs.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Muros disponibles">
          {tabs.map((t) => (
            <Link key={t.key} href={`/muro?w=${encodeURIComponent(t.key)}`}
              className={`badge !py-1.5 !px-3 ${t.key === sel ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {/* No silenciamos el error: si las novedades fallan hay que verlo, no que
          desaparezcan sin rastro (lección del incidente de permisos). */}
      {ref.wall === 'general' && (bdError || newsError) && (
        <p className="text-xs text-red-600">
          No pudimos cargar las novedades: {(bdError ?? newsError)?.message}
        </p>
      )}
      {ref.wall === 'general' && (
        <Novedades birthdays={(birthdays as any[]) ?? []} news={(news as any[]) ?? []} />
      )}
      {canPost && <Composer refData={ref} />}
      {error && <div className="card text-sm text-red-600">{error.message}</div>}
      {!error && posts.length === 0 && (
        <div className="card text-center py-8 text-sm text-gray-500">
          Todavía no hay publicaciones en este muro. {canPost ? 'Sé quien publique la primera.' : 'Vuelve pronto.'}
        </div>
      )}
      <div className="space-y-3">
        {/* key compuesta: resincroniza contadores locales cuando el servidor trae datos nuevos */}
        {posts.map((p) => (
          <PostCard key={`${p.id}|${p.comment_count}|${p.my_reaction ?? ''}|${JSON.stringify(p.reactions ?? {})}`} post={p} />
        ))}
      </div>
      {posts.length >= 20 && (
        // key: al refrescar la lista del servidor, LoadMore se resetea (evita posts duplicados/perdidos)
        <LoadMore key={`${sel}:${posts[posts.length - 1].id}`} refData={ref}
          initialBefore={posts[posts.length - 1].created_at} initialBeforeId={posts[posts.length - 1].id} />
      )}
    </div>
  );
}
