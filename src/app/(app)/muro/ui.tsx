'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ThumbsUp, Heart, HandHeart, Sparkles, PartyPopper,
  MessageCircle, Trash2, Send, User,
} from 'lucide-react';
import {
  createPost, fetchWallPosts, fetchComments, addComment,
  setReaction, deletePost, deleteComment, type WallRef,
} from '@/lib/actions/wall';
import { Alert } from '@/components/ui/Alert';

const REACTIONS: { k: string; label: string; Icon: any }[] = [
  { k: 'like', label: 'Me gusta', Icon: ThumbsUp },
  { k: 'love', label: 'Me encanta', Icon: Heart },
  { k: 'pray', label: 'Orando', Icon: HandHeart },
  { k: 'amen', label: 'Amén', Icon: Sparkles },
  { k: 'celebrate', label: 'Celebro', Icon: PartyPopper },
];

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} día(s)`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Avatar({ url, name }: { url?: string | null; name?: string }) {
  return url
    ? <img src={url} alt={name ?? ''} className="w-9 h-9 rounded-full object-cover shrink-0" />
    : <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><User className="w-4 h-4" aria-hidden /></div>;
}

export function Composer({ refData }: { refData: WallRef }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="card space-y-2">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      <textarea className="input min-h-[70px]" maxLength={5000} placeholder="Comparte algo con tu comunidad…"
        aria-label="Escribe una publicación"
        value={text} onChange={(e) => setText(e.target.value)} disabled={pending} />
      <div className="flex justify-end">
        <button className="btn-primary !py-1.5 !px-4 text-sm inline-flex items-center gap-1.5"
          disabled={pending || text.trim().length === 0}
          onClick={() => start(async () => {
            const r = await createPost(refData, text);
            setMsg(r);
            if (r?.success) { setText(''); router.refresh(); }
          })}>
          <Send className="w-3.5 h-3.5" aria-hidden /> Publicar
        </button>
      </div>
    </div>
  );
}

export function PostCard({ post }: { post: any }) {
  const [reactions, setReactions] = useState<Record<string, number>>(post.reactions ?? {});
  const [mine, setMine] = useState<string | null>(post.my_reaction ?? null);
  const [commentCount, setCommentCount] = useState<number>(post.comment_count ?? 0);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submitComment = () => {
    if (pending || text.trim().length === 0) return;
    start(async () => {
      const r = await addComment(post.id, text);
      if (r?.error) { setMsg(r); return; }
      setText('');
      const fresh = await fetchComments(post.id);
      if (!fresh.error) { setComments(fresh.comments ?? []); setCommentCount((fresh.comments ?? []).length); }
    });
  };

  const react = (k: string) => {
    const next = mine === k ? null : k;
    // Optimista: ajusta contadores localmente y revierte si el servidor falla.
    const prevMine = mine; const prevCounts = { ...reactions };
    const c = { ...reactions };
    if (prevMine) c[prevMine] = Math.max(0, (c[prevMine] ?? 1) - 1);
    if (next) c[next] = (c[next] ?? 0) + 1;
    setMine(next); setReactions(c);
    start(async () => {
      const r = await setReaction(post.id, next);
      if (r?.error) { setMine(prevMine); setReactions(prevCounts); setMsg(r); }
    });
  };

  const loadComments = () => {
    setOpen((o) => !o);
    if (comments === null) {
      start(async () => {
        const r = await fetchComments(post.id);
        if (r.error) setMsg({ error: r.error });
        else setComments(r.comments ?? []);
      });
    }
  };

  return (
    <article className="card space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      <header className="flex items-center gap-3">
        <Avatar url={post.author_photo} name={post.author_name} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{post.author_name}</p>
          <p className="text-xs text-gray-400">{timeAgo(post.created_at)}</p>
        </div>
        {post.can_delete && (
          <button className="text-gray-400 hover:text-red-600" title="Eliminar publicación" aria-label="Eliminar publicación" disabled={pending}
            onClick={() => {
              if (!confirm('¿Eliminar esta publicación?')) return;
              start(async () => { const r = await deletePost(post.id); if (r?.error) setMsg(r); else router.refresh(); });
            }}>
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        )}
      </header>
      <p className="text-sm whitespace-pre-wrap break-words">{post.content}</p>
      <footer className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100">
        {REACTIONS.map(({ k, label, Icon }) => {
          const n = reactions[k] ?? 0;
          const active = mine === k;
          return (
            <button key={k} title={label} aria-label={`${label}${n > 0 ? ` (${n})` : ''}`} aria-pressed={active}
              disabled={pending} onClick={() => react(k)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-100'}`}>
              <Icon className="w-3.5 h-3.5" aria-hidden />{n > 0 && <span className="tabular-nums">{n}</span>}
            </button>
          );
        })}
        <button className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
          onClick={loadComments}>
          <MessageCircle className="w-3.5 h-3.5" aria-hidden />
          {commentCount > 0 ? `${commentCount} comentario(s)` : 'Comentar'}
        </button>
      </footer>
      {open && (
        <div className="space-y-2 pt-1">
          {comments === null && <p className="text-xs text-gray-400">Cargando comentarios…</p>}
          {(comments ?? []).map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              <Avatar url={c.author_photo} name={c.author_name} />
              <div className="bg-gray-50 rounded-xl px-3 py-2 flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-xs">{c.author_name} <span className="font-normal text-gray-400">· {timeAgo(c.created_at)}</span></p>
                  {c.can_delete && (
                    <button className="text-gray-300 hover:text-red-600" title="Eliminar comentario" aria-label="Eliminar comentario" disabled={pending}
                      onClick={() => {
                        if (!confirm('¿Eliminar este comentario?')) return;
                        start(async () => {
                          const r = await deleteComment(c.id);
                          if (r?.error) { setMsg(r); return; }
                          setComments((cs) => (cs ?? []).filter((x) => x.id !== c.id));
                          setCommentCount((n) => Math.max(0, n - 1));
                        });
                      }}>
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words">{c.content}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input !py-1.5 text-sm" maxLength={2000} placeholder="Escribe un comentario…"
              aria-label="Escribe un comentario"
              value={text} onChange={(e) => setText(e.target.value)} disabled={pending}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }} />
            <button className="btn-secondary !py-1.5 !px-3 text-sm" disabled={pending || text.trim().length === 0}
              onClick={submitComment}>
              Enviar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function LoadMore({ refData, initialBefore, initialBeforeId }: {
  refData: WallRef; initialBefore: string; initialBeforeId: string;
}) {
  const [extra, setExtra] = useState<any[]>([]);
  const [cursor, setCursor] = useState({ at: initialBefore, id: initialBeforeId });
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {extra.map((p) => <PostCard key={p.id} post={p} />)}
      {msg && <Alert kind="error">{msg}</Alert>}
      {!done && (
        <button className="btn-secondary w-full !py-2 text-sm" disabled={pending}
          onClick={() => start(async () => {
            const r = await fetchWallPosts(refData, cursor.at, cursor.id);
            if (r.error) { setMsg(r.error); return; }
            const posts = r.posts ?? [];
            if (posts.length === 0) { setDone(true); return; }
            setExtra((e) => [...e, ...posts]);
            const last = posts[posts.length - 1];
            setCursor({ at: last.created_at, id: last.id });
            if (posts.length < 20) setDone(true);
          })}>
          {pending ? 'Cargando…' : 'Cargar publicaciones anteriores'}
        </button>
      )}
    </div>
  );
}
