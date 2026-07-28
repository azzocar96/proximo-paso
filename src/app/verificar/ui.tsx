'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VerifyForm() {
  const [code, setCode] = useState('');
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <input className="input" placeholder="Ej.: a1b2c3d4e5f6a7b8" value={code}
        onChange={(e) => setCode(e.target.value.trim().toLowerCase())} aria-label="Código de verificación" />
      <button className="btn-primary !py-2 shrink-0" disabled={!code}
        onClick={() => router.push(`/verificar/${encodeURIComponent(code)}`)}>Verificar</button>
    </div>
  );
}
