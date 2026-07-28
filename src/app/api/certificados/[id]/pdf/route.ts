import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // RLS: dueño o admin
  const { data: cert } = await supabase.from('certificates').select('*').eq('id', params.id).maybeSingle();
  if (!cert) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (!['issued', 'physical_pending', 'ready_for_pickup', 'delivered'].includes(cert.status))
    return NextResponse.json({ error: 'El certificado aún no está emitido' }, { status: 403 });

  const { data: settingsRows } = await supabase.from('app_settings').select('key,value').in('key', ['certificate_signatures']);
  const signatures: { name: string; title: string }[] =
    (settingsRows?.find((r) => r.key === 'certificate_signatures')?.value as any) ?? [];

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const verifyUrl = `${site}/verificar/${cert.verify_code}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { width: 240, margin: 1 });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // A4 apaisado
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontR = await pdf.embedFont(StandardFonts.Helvetica);
  const brand = rgb(0.12, 0.25, 0.69);
  const gray = rgb(0.35, 0.35, 0.35);

  // marco
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: brand, borderWidth: 3 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: rgb(0.96, 0.62, 0.04), borderWidth: 1 });

  const center = (text: string, y: number, f = font, size = 24, color = rgb(0, 0, 0)) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font: f, color });
  };

  center(cert.church_name.toUpperCase(), height - 100, fontR, 16, gray);
  center('CERTIFICADO', height - 150, font, 40, brand);
  center('otorgado a', height - 185, fontR, 14, gray);
  center(cert.full_name, height - 235, font, 32);
  center(`por completar satisfactoriamente el curso`, height - 270, fontR, 14, gray);
  center(`«${cert.course_name}»`, height - 300, font, 22, brand);
  if (cert.completion_date) {
    const d = new Date(cert.completion_date + 'T12:00:00')
      .toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    center(d, height - 330, fontR, 13, gray);
  }

  // firmas configurables
  const sigCount = Math.min(signatures.length, 3);
  if (sigCount > 0) {
    const slotW = (width - 200) / sigCount;
    signatures.slice(0, 3).forEach((s, i) => {
      const cx = 100 + slotW * i + slotW / 2;
      page.drawLine({ start: { x: cx - 90, y: 120 }, end: { x: cx + 90, y: 120 }, thickness: 1, color: gray });
      const nw = fontR.widthOfTextAtSize(s.name, 11);
      page.drawText(s.name, { x: cx - nw / 2, y: 105, size: 11, font: fontR });
      const tw = fontR.widthOfTextAtSize(s.title ?? '', 9);
      page.drawText(s.title ?? '', { x: cx - tw / 2, y: 92, size: 9, font: fontR, color: gray });
    });
  }

  // QR de verificación + código
  const qrImg = await pdf.embedPng(qrPng);
  page.drawImage(qrImg, { x: width - 130, y: 46, width: 84, height: 84 });
  page.drawText(`Verificación: ${cert.verify_code}`, { x: 48, y: 52, size: 9, font: fontR, color: gray });
  page.drawText(verifyUrl, { x: 48, y: 40, size: 8, font: fontR, color: gray });

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="certificado-${cert.verify_code}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
