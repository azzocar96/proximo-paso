import { redirect } from 'next/navigation';

// El contacto de una sola vía se convirtió en Mensajes (migración 029): la
// misma puerta, pero ahora la iglesia responde dentro de la app.
export default function ContactoPage() {
  redirect('/mensajes');
}
