-- ================================================================
-- Cuentas demo de los roles nuevos de Fase 3a
--
-- PASO PREVIO (manual, en el Dashboard → Authentication → Users →
-- "Add user" → "Create new user", con "Auto Confirm User" activado):
--   1. pastor@demo.local   · contraseña: Demo1234!
--   2. orador@demo.local   · contraseña: Demo1234!
--   3. miembro@demo.local  · contraseña: Demo1234!
-- (el trigger handle_new_user les crea perfil + rol participant solo)
--
-- LUEGO correr este script completo en el SQL Editor.
-- Requiere que las migraciones 007, 008 y 009 ya estén aplicadas.
-- ================================================================

-- Nombres visibles
update profiles set first_name = 'Pablo',  last_name = 'Pastor'  where email = 'pastor@demo.local';
update profiles set first_name = 'Olga',   last_name = 'Oradora' where email = 'orador@demo.local';
update profiles set first_name = 'Miriam', last_name = 'Miembro' where email = 'miembro@demo.local';

-- Rol pastor (mismo nivel que administrador)
insert into user_roles (user_id, role)
select id, 'pastor'::app_role from profiles where email = 'pastor@demo.local'
on conflict (user_id, role) do nothing;

-- Oradora fija del Paso 1 (orador NO es un rol de user_roles: vive en step_speakers)
insert into step_speakers (step_number, user_id, bio, contact_phone, assigned_by)
select 1, id, 'Oradora demo responsable del Paso 1 · Sígueme', null,
       (select id from profiles where email = 'superadmin@demo.local')
from profiles where email = 'orador@demo.local'
on conflict (step_number) do update
  set user_id = excluded.user_id, bio = excluded.bio, updated_at = now();

-- Miembro activo (marca manual: queda registrado quién la aprobó)
update profiles
set active_member = true,
    active_member_since = now(),
    active_member_approved_by = (select id from profiles where email = 'superadmin@demo.local')
where email = 'miembro@demo.local';

-- ================================================================
-- Verificación (todo debe dar 1)
-- ================================================================
select 'perfil pastor con nombre' as chk, count(*) from profiles where email='pastor@demo.local' and first_name='Pablo'
union all
select 'rol pastor asignado', count(*) from user_roles ur join profiles p on p.id=ur.user_id where p.email='pastor@demo.local' and ur.role='pastor'
union all
select 'oradora del paso 1', count(*) from step_speakers ss join profiles p on p.id=ss.user_id where ss.step_number=1 and p.email='orador@demo.local'
union all
select 'miembro activo con aprobador', count(*) from profiles where email='miembro@demo.local' and active_member and active_member_approved_by is not null;
