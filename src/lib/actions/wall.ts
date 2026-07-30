'use server';
// Fase 3c — Muro tipo red social. Toda la autorización real vive en las RPCs
// de la migración 012 (security definer, tablas deny-all).
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';

export type WallRef = { wall: 'general' | 'ministry' | 'step'; ministryId?: string | null; step?: number | null };

function params(ref: WallRef) {
  return { p_wall: ref.wall, p_ministry: ref.ministryId ?? null, p_step: ref.step ?? null };
}

export async function createPost(ref: WallRef, content: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('create_post', { ...params(ref), p_content: content });
  if (error) return { error: error.message };
  revalidatePath('/muro');
  return { success: 'Publicado.' };
}

export async function fetchWallPosts(ref: WallRef, before: string, beforeId: string): Promise<{ error?: string; posts?: any[] }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_wall_posts', { ...params(ref), p_before: before, p_before_id: beforeId });
  if (error) return { error: error.message };
  return { posts: (data as any[]) ?? [] };
}

export async function fetchComments(postId: string): Promise<{ error?: string; comments?: any[] }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_post_comments', { p_post: postId });
  if (error) return { error: error.message };
  return { comments: (data as any[]) ?? [] };
}

export async function addComment(postId: string, content: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('add_post_comment', { p_post: postId, p_content: content });
  if (error) return { error: error.message };
  return { success: 'Comentario agregado.' };
}

export async function setReaction(postId: string, reaction: string | null): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_post_reaction', { p_post: postId, p_reaction: reaction });
  if (error) return { error: error.message };
  return { success: 'ok' };
}

export async function deletePost(postId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('delete_post', { p_post: postId });
  if (error) return { error: error.message };
  revalidatePath('/muro');
  return { success: 'Publicación eliminada.' };
}

export async function deleteComment(commentId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('delete_post_comment', { p_comment: commentId });
  if (error) return { error: error.message };
  return { success: 'Comentario eliminado.' };
}

export async function grantWallPublisher(userId: string, grant: boolean): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('grant_wall_publisher', { p_user: userId, p_grant: grant });
  if (error) return { error: error.message };
  revalidatePath('/admin/usuarios');
  return { success: grant ? 'Ahora puede publicar en el muro general.' : 'Ya no puede publicar en el muro general.' };
}
