import Link from 'next/link';
import { getSettings, str, arr, obj } from '@/lib/settings';

const FALLBACK_STEPS = [
  { name: 'Sígueme', hint: 'Da el primer paso para conocer y seguir a Jesús.' },
  { name: 'Intimidad con Dios', hint: 'Cultiva una relación cercana y personal con Dios.' },
  { name: 'Compañerismo con los de adentro', hint: 'Conéctate con tu iglesia y descubre tu propósito.' },
  { name: 'Influencia hacia los de afuera', hint: 'Sirve a otros y multiplica lo que has recibido.' },
];

const FALLBACK_OBJECTIVES =
  'El Programa Próximo Paso tiene como finalidad ayudar a los participantes a seguir a Jesús, ' +
  'conectarse con la iglesia, descubrir su propósito y servir a otros. Consta de cuatro pasos ' +
  'presenciales diseñados para guiar a cada persona en su caminar de fe y servicio.';

type Schedule = {
  location_name?: string; time?: string; when?: string;
  duration_min?: number; frequency?: string;
  // "cadence": aclara que no es "una clase al mes" — los 4 pasos se dictan uno
  // por cada domingo de un mismo mes, y ese ciclo se repite todos los meses
  // excepto diciembre y enero (ver "frequency" para el rótulo corto existente).
  cadence?: string; months_excluded?: string[];
};
const FALLBACK_SCHEDULE: Schedule = {
  location_name: 'Salón Australia, Summit',
  time: '4:30 PM',
  when: 'después del servicio principal',
  duration_min: 20,
  frequency: 'mensual',
  cadence: 'un paso cada domingo del mes',
  months_excluded: ['diciembre', 'enero'],
};

export default async function Landing() {
  let church = 'Iglesia Global Orlando';
  let address = '735 Herndon Ave, Orlando, FL 32803';
  let course = 'Próximo Paso';
  let objectives = FALLBACK_OBJECTIVES;
  let stepNames = FALLBACK_STEPS.map((s) => s.name);
  let schedule: Schedule = FALLBACK_SCHEDULE;
  try {
    const s = await getSettings([
      'church_name', 'church_address', 'course_name',
      'program_objectives', 'step_names', 'program_schedule',
    ]);
    church = str(s, 'church_name', church);
    address = str(s, 'church_address', address);
    course = str(s, 'course_name', course);
    objectives = str(s, 'program_objectives', objectives);
    stepNames = arr(s, 'step_names', stepNames);
    schedule = obj<Schedule>(s, 'program_schedule', schedule);
  } catch {}

  const steps = stepNames.map((name, i) => ({ name, hint: FALLBACK_STEPS[i]?.hint ?? '' }));
  const months = schedule.months_excluded?.length
    ? `todo el año excepto ${schedule.months_excluded.join(' y ')}`
    : 'todos los meses del año';

  return (
    <main className="min-h-screen overflow-hidden bg-white">
      {/* Encabezado */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt={course} className="h-7 w-auto" />
        </div>
        <Link href="/login" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          Iniciar sesión →
        </Link>
      </header>

      {/* Hero */}
      <section className="relative px-6 pt-6 pb-16 max-w-5xl mx-auto">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-100 blur-3xl opacity-70" />
        <div aria-hidden className="pointer-events-none absolute top-40 -left-24 w-72 h-72 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative text-center max-w-2xl mx-auto space-y-6">
          <span className="badge bg-brand-50 text-brand-700 border border-brand-100">
            Panel de participantes · {church}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-brand-800">
            Da tu {course}
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">{objectives}</p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
            <Link href="/registro" className="btn-primary w-full">Crear mi cuenta</Link>
            <Link href="/login" className="btn-secondary w-full">Ya tengo cuenta</Link>
          </div>
          <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5">
            <span aria-hidden>📍</span> {church} · {address}
          </p>
        </div>
      </section>

      {/* Los 4 pasos */}
      <section className="relative px-6 py-14 bg-brand-50/60">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-800">Los 4 pasos</h2>
            <p className="text-gray-600">Cada clase es prerrequisito de la siguiente. Tú avanzas a tu ritmo.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div key={s.name} className="card relative flex flex-col gap-2 hover:shadow-md transition-shadow">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-600 text-white font-bold text-sm">
                  {i + 1}
                </span>
                <h3 className="font-bold text-brand-800 leading-snug">{s.name}</h3>
                {s.hint && <p className="text-sm text-gray-600">{s.hint}</p>}
                {i === 2 && (
                  <span className="badge bg-accent/10 text-accent mt-1">Test + Dream Team</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="px-6 py-14 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-10 items-start">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-800">Cómo funciona</h2>
            <p className="text-gray-600 leading-relaxed">
              {course} es presencial, después del servicio principal
              {schedule.cadence ? ` — se dicta ${schedule.cadence}` : ''}. Cada clase dura solo unos
              minutos — el reto no es el tiempo, es dar el paso.
            </p>
            <div className="rounded-2xl border-2 border-brand-100 bg-brand-50/50 p-4 text-sm text-brand-800">
              <strong>En el Paso 3</strong> completas el test de personalidad y te inscribes al Dream
              Team. Junto con asistir a los 4 pasos, son los dos requisitos para completar el programa.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InfoTile icon="📍" label="Salón" value={schedule.location_name ?? '—'} />
            <InfoTile icon="🕓" label="Horario" value={`${schedule.time ?? ''} · ${schedule.when ?? ''}`} />
            <InfoTile icon="⏱️" label="Duración" value={`~${schedule.duration_min ?? 20} min por clase`} />
            <InfoTile icon="🗓️" label="Frecuencia" value={`${schedule.cadence ?? schedule.frequency ?? 'Mensual'}, ${months}`} />
          </div>
        </div>
      </section>

      {/* Cierre / comunidad */}
      <section className="px-6 py-14 bg-brand-800 text-white text-center">
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold">No lo hagas solo</h2>
          <p className="text-brand-50/90">
            {course} es tu manera de conectar, crecer y encontrar tu lugar en {church}. Estamos para
            caminar contigo, un paso a la vez.
          </p>
          <div className="pt-2">
            <Link href="/registro" className="btn bg-white text-brand-700 hover:bg-brand-50 inline-flex">
              Empieza aquí
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center text-sm text-gray-400 space-y-1">
        <p>{church} · {address}</p>
        <p>
          <Link href="/verificar" className="underline">Verificar un certificado</Link>
          {' · '}
          <Link href="/privacidad" className="underline">Privacidad</Link>
        </p>
      </footer>
    </main>
  );
}

function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="card space-y-1">
      <div className="text-2xl">{icon}</div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}
