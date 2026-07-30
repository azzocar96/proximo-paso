import Link from 'next/link';
import { ArrowRight, MapPin, Clock3, Timer, CalendarDays, Sparkles, CheckCircle2 } from 'lucide-react';
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
      <header className="relative z-20 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <img src="/logo.png" alt={course} className="h-8 w-auto" />
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-brand-700 transition-colors">
          Iniciar sesión <ArrowRight className="w-4 h-4" aria-hidden />
        </Link>
      </header>

      {/* Hero */}
      <section className="relative px-6 pt-10 pb-20 max-w-5xl mx-auto">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-100 blur-3xl opacity-80" />
        <div aria-hidden className="pointer-events-none absolute top-40 -left-24 w-80 h-80 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative text-center max-w-2xl mx-auto space-y-6">
          <span className="badge glass !px-3 !py-1.5 text-gray-700 inline-flex items-center gap-1.5 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-brand-600" aria-hidden />
            Curso de membresía · {church}
          </span>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-gray-900">
            Da tu <span className="bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 bg-clip-text text-transparent">{course}</span>
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">{objectives}</p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
            <Link href="/registro" className="btn-primary w-full !py-3 !text-base shadow-[0_8px_24px_rgb(254_71_3/0.3)]">Crear mi cuenta</Link>
            <Link href="/login" className="btn-secondary w-full !py-3 !text-base">Ya tengo cuenta</Link>
          </div>
          <p className="text-sm text-gray-500 inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-brand-600" aria-hidden /> {church} · {address}
          </p>
        </div>
      </section>

      {/* Los 4 pasos */}
      <section className="relative px-6 py-16 bg-gray-50/80 border-y border-gray-100">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <p className="text-sm font-semibold text-brand-600 uppercase tracking-widest">El recorrido</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Los 4 pasos</h2>
            <p className="text-gray-600">Cada clase es prerrequisito de la siguiente. Tú avanzas a tu ritmo.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div key={s.name} className="card relative flex flex-col gap-3 overflow-hidden">
                <div aria-hidden className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-50 blur-xl" />
                <span className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 text-white font-bold shadow-[0_4px_12px_rgb(254_71_3/0.35)]">
                  {i + 1}
                </span>
                <h3 className="relative font-bold text-gray-900 leading-snug">{s.name}</h3>
                {s.hint && <p className="relative text-sm text-gray-600">{s.hint}</p>}
                {i === 2 && (
                  <span className="relative badge bg-accent/10 text-amber-700 mt-auto self-start">Test + Dream Team</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-10 items-start">
          <div className="space-y-5">
            <p className="text-sm font-semibold text-brand-600 uppercase tracking-widest">La logística</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Cómo funciona</h2>
            <p className="text-gray-600 leading-relaxed">
              {course} es presencial, después del servicio principal
              {schedule.cadence ? ` — se dicta ${schedule.cadence}` : ''}. Cada clase dura solo unos
              minutos — el reto no es el tiempo, es dar el paso.
            </p>
            <div className="rounded-xl border border-brand-200/60 bg-brand-50/50 p-4 text-sm text-gray-700 flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" aria-hidden />
              <span>
                <strong className="text-gray-900">En el Paso 3</strong> completas el test de personalidad y te inscribes al Dream
                Team. Junto con asistir a los 4 pasos, son los dos requisitos para completar el programa.
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InfoTile Icon={MapPin} label="Salón" value={schedule.location_name ?? '—'} />
            <InfoTile Icon={Clock3} label="Horario" value={`${schedule.time ?? ''} · ${schedule.when ?? ''}`} />
            <InfoTile Icon={Timer} label="Duración" value={`~${schedule.duration_min ?? 20} min por clase`} />
            <InfoTile Icon={CalendarDays} label="Frecuencia" value={`${schedule.cadence ?? schedule.frequency ?? 'Mensual'}, ${months}`} />
          </div>
        </div>
      </section>

      {/* Cierre / comunidad */}
      <section className="relative px-6 py-20 bg-gray-950 text-white text-center overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-dark [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,black,transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="relative max-w-xl mx-auto space-y-5">
          <h2 className="text-3xl sm:text-4xl font-extrabold">No lo hagas <span className="grad-text">solo</span></h2>
          <p className="text-gray-300">
            {course} es tu manera de conectar, crecer y encontrar tu lugar en {church}. Estamos para
            caminar contigo, un paso a la vez.
          </p>
          <div className="pt-2">
            <Link href="/registro" className="btn bg-white text-gray-900 hover:bg-gray-100 !py-3 !text-base inline-flex shadow-[0_8px_30px_rgb(254_71_3/0.25)]">
              Empieza aquí <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center text-sm text-gray-400 space-y-1">
        <p>{church} · {address}</p>
        <p>
          <Link href="/verificar" className="underline hover:text-gray-600">Verificar un certificado</Link>
          {' · '}
          <Link href="/privacidad" className="underline hover:text-gray-600">Privacidad</Link>
        </p>
      </footer>
    </main>
  );
}

function InfoTile({ Icon, label, value }: { Icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="card space-y-2">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 text-brand-600">
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}
