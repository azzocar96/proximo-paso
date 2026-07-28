'use client';
import { useState, useTransition } from 'react';
import { expressMinistryInterest } from '@/lib/actions/course';
import { Alert } from '@/components/ui/Alert';

export function InterestButton({ ministryId }: { ministryId: string }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.success) return <Alert kind="success">{msg.success}</Alert>;
  return (
    <div className="space-y-2">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      <button className="btn-secondary !py-2 text-sm" disabled={pending}
        onClick={() => start(async () => setMsg(await expressMinistryInterest(ministryId)))}>
        {pending ? 'Guardando…' : 'Me interesa este ministerio'}
      </button>
    </div>
  );
}
