// Lección nº 1 de este proyecto: `const { data } = await supabase...` se traga
// el error. Un "permission denied" y un "no hay filas" se ven idénticos: una
// pantalla vacía. Este envoltorio no cambia nada del comportamiento — devuelve
// exactamente lo que devolvía la consulta — pero deja el error en el log del
// servidor con una etiqueta que dice DÓNDE pasó. Es la diferencia entre
// "no hay datos" y "no te dejaron leerlos".
type ConError = { error: { message: string } | null };

export async function vigilar<T extends ConError>(etiqueta: string, consulta: PromiseLike<T>): Promise<T> {
  const r = await consulta;
  if (r.error) console.error(`[${etiqueta}]`, r.error.message);
  return r;
}
