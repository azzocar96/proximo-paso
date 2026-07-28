import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/utils';
import { fetchSegmentationRows, parseSegmentFilters } from '@/lib/segmentation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const url = new URL(req.url);
  const tipo = url.searchParams.get('tipo') ?? 'inscripciones';
  const ciclo = url.searchParams.get('ciclo');

  // La segmentación también la puede exportar un líder de ministerio (ve
  // solo su gente, vía RLS); el resto de reportes sigue siendo solo admin.
  if (tipo === 'segmentacion') {
    const { data: isLeader } = await supabase.rpc('fn_is_ministry_leader');
    if (!isLeader) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  } else {
    const { data: isAdmin } = await supabase.rpc('fn_is_admin');
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  if (tipo === 'inscripciones') {
    let q = supabase.from('enrollments').select('status,created_at, profiles(first_name,last_name,email,phone), course_cycles(name)');
    if (ciclo) q = q.eq('cycle_id', ciclo);
    const { data } = await q;
    headers = ['nombre', 'apellido', 'correo', 'telefono', 'ciclo', 'estado', 'inscrito'];
    rows = (data ?? []).map((e: any) => ({
      nombre: e.profiles?.first_name, apellido: e.profiles?.last_name, correo: e.profiles?.email,
      telefono: e.profiles?.phone, ciclo: e.course_cycles?.name, estado: e.status, inscrito: e.created_at,
    }));
  } else if (tipo === 'asistencia') {
    let q = supabase.from('attendance_records')
      .select('method,result,distance_meters,accuracy_meters,recorded_at,manual_reason, profiles(first_name,last_name,email), course_sessions(step_number,session_date, course_cycles(name))');
    const { data } = await q;
    headers = ['nombre', 'apellido', 'correo', 'ciclo', 'paso', 'fecha_sesion', 'metodo', 'resultado', 'distancia_m', 'precision_m', 'registrado', 'motivo_manual'];
    rows = (data ?? [])
      .filter((a: any) => !ciclo || true)
      .map((a: any) => ({
        nombre: a.profiles?.first_name, apellido: a.profiles?.last_name, correo: a.profiles?.email,
        ciclo: a.course_sessions?.course_cycles?.name, paso: a.course_sessions?.step_number,
        fecha_sesion: a.course_sessions?.session_date, metodo: a.method, resultado: a.result,
        distancia_m: a.distance_meters, precision_m: a.accuracy_meters, registrado: a.recorded_at, motivo_manual: a.manual_reason,
      }));
  } else if (tipo === 'certificados') {
    const { data } = await supabase.from('certificates').select('full_name,course_name,completion_date,status,verify_code,issued_at, profiles(email)');
    headers = ['nombre', 'correo', 'curso', 'fecha', 'estado', 'codigo', 'emitido'];
    rows = (data ?? []).map((c: any) => ({
      nombre: c.full_name, correo: c.profiles?.email, curso: c.course_name, fecha: c.completion_date,
      estado: c.status, codigo: c.verify_code, emitido: c.issued_at,
    }));
  } else if (tipo === 'dream-team') {
    const { data } = await supabase.from('dream_team_forms')
      .select('interest_areas,talents,weekly_availability,available_times,previous_church_experience,comments,contact_consent,completed_at, profiles(first_name,last_name,email)')
      .not('completed_at', 'is', null);
    headers = ['nombre', 'apellido', 'correo', 'intereses', 'talentos', 'disponibilidad', 'horarios', 'experiencia_iglesias', 'comentarios', 'autoriza_contacto', 'enviado'];
    rows = (data ?? []).map((f: any) => ({
      nombre: f.profiles?.first_name, apellido: f.profiles?.last_name, correo: f.profiles?.email,
      intereses: (f.interest_areas ?? []).join('; '), talentos: (f.talents ?? []).join('; '),
      disponibilidad: (f.weekly_availability ?? []).join('; '), horarios: (f.available_times ?? []).join('; '),
      experiencia_iglesias: f.previous_church_experience, comentarios: f.comments,
      autoriza_contacto: f.contact_consent ? 'sí' : 'no', enviado: f.completed_at,
    }));
  } else if (tipo === 'ministerios') {
    const { data } = await supabase.from('ministry_assignments').select('status,notes,created_at, ministries(name), profiles(first_name,last_name,email)');
    headers = ['nombre', 'apellido', 'correo', 'ministerio', 'estado', 'notas', 'creado'];
    rows = (data ?? []).map((a: any) => ({
      nombre: a.profiles?.first_name, apellido: a.profiles?.last_name, correo: a.profiles?.email,
      ministerio: a.ministries?.name, estado: a.status, notas: a.notes, creado: a.created_at,
    }));
  } else if (tipo === 'usuarios') {
    const { data } = await supabase.from('profiles').select('first_name,last_name,email,phone,city,state,account_status,created_at');
    headers = ['nombre', 'apellido', 'correo', 'telefono', 'ciudad', 'estado_region', 'cuenta', 'registro'];
    rows = (data ?? []).map((p: any) => ({
      nombre: p.first_name, apellido: p.last_name, correo: p.email, telefono: p.phone,
      ciudad: p.city, estado_region: p.state, cuenta: p.account_status, registro: p.created_at,
    }));
  } else if (tipo === 'segmentacion') {
    const filters = parseSegmentFilters(url.searchParams);
    const segRows = await fetchSegmentationRows(supabase, filters);
    headers = ['nombre', 'correo', 'telefono', 'edad', 'ciclo', 'paso_estado', 'mes_inscripcion', 'resultado_test', 'ministerios_interes'];
    rows = segRows.map((r) => ({
      nombre: r.name, correo: r.email, telefono: r.phone, edad: r.age ?? '',
      ciclo: r.cycleName, paso_estado: r.enrollmentStatus, mes_inscripcion: r.enrollmentMonth,
      resultado_test: r.testResult, ministerios_interes: r.ministryNames.join('; '),
    }));
  } else {
    return NextResponse.json({ error: 'Tipo de reporte desconocido' }, { status: 400 });
  }

  const csv = toCsv(rows, headers);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tipo}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
