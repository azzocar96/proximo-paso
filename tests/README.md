# Pruebas de las reglas de la base

Cada archivo es una transacción completa que **termina en `rollback`**: se
puede correr contra producción sin dejar rastro. Se pegan tal cual en el SQL
Editor de Supabase (o `psql`) y se lee el resultado de los `raise notice`.

Regla de la casa (lección nº 6 de la Bitácora): **una regla solo existe si se
la vio fallar ejecutando el camino real**, no leyendo el código. Estas pruebas
son ese camino real, guardado para repetirlo después de cada migración.

| Archivo | Qué comprueba |
|---|---|
| `01_inscripcion_tardia.sql` | Un ciclo cuya primera clase ya pasó rechaza la inscripción con el mensaje amable (migración 025). |
| `02_menor_y_representante.sql` | Un menor nace `pending`, no puede inscribirse, el enlace del representante lo desbloquea, el enlace usado dice `ya_autorizado` y los avisos quedan en la bandeja (026 + 027). |
| `03_permisos.sql` | `anon` no lee tablas sensibles ni ejecuta funciones que no le tocan; `authenticated` sí puede lo suyo (lecciones 1, 2 y 8). |

Si una prueba lanza `PRUEBA FALLIDA`, la migración que dice no está aplicada
o alguien la rompió después. Nada de "seguro que funciona".

Cómo se simula a una persona con sesión dentro de la transacción:

```sql
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);
```

Los UUID se buscan **antes** de cambiar de rol: con RLS activo, `authenticated`
no ve las filas de otros.
