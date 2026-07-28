import { CheckIn } from './checkin';

export const metadata = { title: 'Confirmar asistencia' };
export default function TokenPage({ params }: { params: { token: string } }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Confirmar asistencia</h1>
      <CheckIn token={params.token} />
    </div>
  );
}
