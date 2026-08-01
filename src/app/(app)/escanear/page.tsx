import { Scanner } from './scanner';

export const metadata = { title: 'Registrar asistencia' };
export default function EscanearPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Registrar asistencia</h1>
      <p className="text-gray-600 text-sm">
        Apunta la cámara al código QR que muestra en pantalla quien atiende la clase.
        También puedes escanearlo directamente con la cámara de tu teléfono.
      </p>
      <Scanner />
    </div>
  );
}
