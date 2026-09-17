import Link from 'next/link';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { getSettings, str } from '@/lib/settings';
import { getCapabilities } from '@/lib/capabilities';
import { NoDisponible } from '@/components/ui/NoDisponible';

export const metadata = { title: 'Ayuda' };
export const dynamic = 'force-dynamic';

/**
 * La página para quien se perdió.
 *
 * Está escrita para la persona que NO se lleva bien con la tecnología: una
 * pregunta por bloque, en las palabras que ella usaría, y la respuesta en dos
 * o tres frases. Al final, un bloque aparte con el detalle técnico para quien
 * sí quiere saber cómo funciona por dentro. Los dos públicos, sin que ninguno
 * estorbe al otro.
 */
function P({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2">
      <h2 className="font-bold text-[17px] leading-snug">{q}</h2>
      <div className="text-[15px] leading-relaxed text-gray-700 space-y-2">{children}</div>
    </section>
  );
}

export default async function AyudaPage() {
  const s = await getSettings(['church_name', 'church_address', 'church_contact', 'program_schedule']);
  const iglesia = str(s, 'church_name', 'Iglesia Global Orlando');
  const direccion = str(s, 'church_address', '735 Herndon Ave, Orlando, FL 32803');
  const c = (s.church_contact ?? {}) as { email?: string; phone?: string };
  const horario = (s.program_schedule ?? {}) as { time?: string; when?: string; location_name?: string };
  const caps = await getCapabilities();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-4">
        <Link href="/" className="text-sm text-gray-500 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Volver al inicio
        </Link>

        <header className="space-y-2">
          <h1 className="text-2xl font-extrabold inline-flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-brand-600" aria-hidden /> ¿En qué te ayudamos?
          </h1>
          <p className="text-[15px] text-gray-600">
            Si algo no te funciona o no entiendes qué hacer, aquí está. Y si después de leer esto
            sigues atascado, escríbenos: te resolvemos nosotros, no te quedes dando vueltas.
          </p>
        </header>

        <P q="¿Qué es esta app?">
          <p>
            Es donde llevas tu paso por el curso Próximo Paso de {iglesia}. Creas tu cuenta, te inscribes
            al ciclo, marcas tu asistencia cada domingo y, al terminar los cuatro pasos, recibes tu certificado.
          </p>
          <p>Todo desde el teléfono. No hay que instalar nada.</p>
        </P>

        <P q="Me registré, pero no aparezco inscrito en ninguna clase">
          <p>
            Son dos cosas distintas y es lo que más confunde a todo el mundo. <b>Crear tu cuenta</b> es
            una; <b>inscribirte al ciclo</b> es otra.
          </p>
          <p>
            Entra a la app y busca el ciclo abierto: ahí dice <i>Inscribirme</i>. Si no lo haces, el domingo
            tu asistencia no le cuenta a nadie.
          </p>
        </P>

        <P q="¿Cómo marco mi asistencia?">
          <p>
            En la clase van a mostrar un código QR en una pantalla o en un teléfono. Abres la app, le das a
            escanear y apuntas al código. Listo.
          </p>
          <p>
            Tres cosas que tienen que pasar: <b>estar en el salón</b> (el teléfono te pide permiso de
            ubicación solo en ese momento), <b>tener internet</b> y escanear <b>mientras el código está
            activo</b>, porque cambia cada 30 minutos.
          </p>
          <p>
            Una foto del código que alguien te mandó por WhatsApp no sirve, y es a propósito: así la
            asistencia significa algo.
          </p>
        </P>

        <P q="Se me olvidó marcar la asistencia">
          <p>
            No perdiste nada. Desde la app puedes pedir que te la aprueben: lo revisa quien atendió tu clase,
            el orador del paso o un administrador.
          </p>
        </P>

        <P q="Soy menor de edad">
          <p>
            Puedes tener tu cuenta, pero al crearla tienes que poner el nombre, el apellido, el correo y el
            teléfono de tu papá, mamá o representante.
          </p>
          <p>
            A esa persona le llega un enlace para autorizar tu cuenta. <b>Hasta que lo haga, tu cuenta existe
            pero no puedes inscribirte ni marcar asistencia.</b> Y cuando pase algo importante —te inscribes,
            marcas asistencia, recibes el certificado— también se lo avisamos a ella.
          </p>
          <p>
            Si a tu representante no le llegó el enlace, escríbenos y se lo mandamos por WhatsApp.
          </p>
        </P>

        <P q="Olvidé mi contraseña">
          {caps.email_outbound ? (
            <p>
              Ve a <Link className="text-brand-600 underline" href="/recuperar">olvidé mi contraseña</Link>,
              pon tu correo y te llega un enlace para crear una nueva.
            </p>
          ) : (
            <NoDisponible
              titulo="Por ahora esto lo resolvemos a mano"
              motivo="La iglesia todavía no tiene conectado su correo de salida, así que el enlace automático no te llegaría."
              mientrasTanto="escríbenos y te devolvemos el acceso en el momento. Es más rápido de lo que parece."
            />
          )}
        </P>

        <P q="¿Dónde y cuándo son las clases?">
          <p>
            En {iglesia}, {direccion}
            {horario.location_name ? `, en ${horario.location_name}` : ''}.
          </p>
          <p>
            {horario.time ? `A las ${horario.time}` : 'Los domingos'}
            {horario.when ? `, ${horario.when}` : ''}. Un paso cada domingo.
          </p>
        </P>

        <P q="No me deja hacer algo y no entiendo por qué">
          <p>
            Casi siempre es una de tres: no estás inscrito al ciclo, aún no has hecho el paso anterior
            (cada clase necesita la de antes), o eres menor y falta el permiso de tu representante.
          </p>
          <p>La app debería decírtelo con todas sus letras. Si no lo hizo, avísanos: eso es culpa nuestra.</p>
        </P>

        <P q="¿Qué hacen con mis datos?">
          <p>
            Lo explicamos completo en la <Link className="text-brand-600 underline" href="/privacidad">política
            de privacidad</Link>. Lo más preguntado: para la asistencia usamos tu ubicación solo en el momento
            de escanear, y <b>no guardamos dónde estuviste</b> — solo a qué distancia estabas del salón y si
            se aceptó o no.
          </p>
        </P>

        <section className="card space-y-2 bg-gray-900 text-gray-100 border-gray-900">
          <h2 className="font-bold text-[17px]">Para quien quiere el detalle</h2>
          <div className="text-[15px] leading-relaxed text-gray-300 space-y-2">
            <p>
              La asistencia se valida en el servidor, no en el teléfono: el código QR lleva un testigo
              aleatorio con caducidad y la distancia se calcula contra las coordenadas de la sede. Del GPS
              solo se conserva la distancia y la precisión reportada; las coordenadas no se guardan nunca.
            </p>
            <p>
              Los permisos no viven en la pantalla sino en la base de datos: cada tabla está cerrada por
              defecto y todo pasa por funciones que comprueban quién eres antes de devolver una sola fila.
              Esconder un botón no es impedir nada, así que no lo usamos como defensa.
            </p>
            <p>
              Esta plataforma se va a mudar al dominio y a las herramientas propias de la organización.
              Lo que todavía depende de algo que no está conectado te lo decimos en el momento, en vez de
              fallar en silencio.
            </p>
          </div>
        </section>

        <section className="card space-y-1">
          <h2 className="font-bold text-[17px]">Escríbenos</h2>
          <p className="text-[15px] text-gray-700">
            {iglesia}
            {c.phone && <><br />{c.phone}</>}
            {c.email && <><br />{c.email}</>}
          </p>
          <p className="text-sm text-gray-500">{direccion}</p>
        </section>

        <p className="text-center text-sm text-gray-400 pt-2">
          <Link href="/" className="underline hover:text-gray-600">Inicio</Link>
          {' · '}
          <Link href="/privacidad" className="underline hover:text-gray-600">Privacidad</Link>
          {' · '}
          <Link href="/verificar" className="underline hover:text-gray-600">Verificar un certificado</Link>
        </p>
      </div>
    </main>
  );
}
