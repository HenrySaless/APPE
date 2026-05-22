alter table public.portal_courses
  add column if not exists capacity_limit integer;

alter table public.portal_courses
  drop constraint if exists portal_courses_capacity_limit_positive;

alter table public.portal_courses
  add constraint portal_courses_capacity_limit_positive
  check (capacity_limit is null or capacity_limit > 0);

create or replace function public.portal_attempt_course_enrollment(
  p_user_id uuid,
  p_course_id uuid,
  p_course_title text,
  p_course_mode text,
  p_course_date text,
  p_course_label text,
  p_course_status text,
  p_course_location text,
  p_course_instructor text,
  p_google_calendar_url text
)
returns table (
  enrollment_id uuid,
  enrolled_count integer,
  capacity_limit integer,
  course_status text,
  outcome text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.portal_courses%rowtype;
  v_enrollment_id uuid;
  v_enrolled_count integer;
begin
  select *
  into v_course
  from public.portal_courses
  where id = p_course_id
  for update;

  if not found then
    raise exception 'Curso nao encontrado.';
  end if;

  select count(*)::integer
  into v_enrolled_count
  from public.course_enrollments
  where course_id = p_course_id::text;

  if v_course.status = 'encerrado' then
    return query
    select null::uuid, v_enrolled_count, v_course.capacity_limit, v_course.status, 'closed'::text;
    return;
  end if;

  select id
  into v_enrollment_id
  from public.course_enrollments
  where user_id = p_user_id
    and course_id = p_course_id::text
  limit 1;

  if v_enrollment_id is not null then
    return query
    select v_enrollment_id, v_enrolled_count, v_course.capacity_limit, v_course.status, 'duplicate'::text;
    return;
  end if;

  if v_course.capacity_limit is not null and v_enrolled_count >= v_course.capacity_limit then
    update public.portal_courses
    set status = 'encerrado'
    where id = p_course_id
      and status <> 'encerrado';

    return query
    select null::uuid, v_enrolled_count, v_course.capacity_limit, 'encerrado'::text, 'closed'::text;
    return;
  end if;

  insert into public.course_enrollments (
    user_id,
    course_id,
    course_title,
    course_mode,
    course_date,
    course_label,
    course_status,
    course_location,
    course_instructor,
    google_calendar_url
  )
  values (
    p_user_id,
    p_course_id::text,
    p_course_title,
    p_course_mode,
    p_course_date,
    p_course_label,
    p_course_status,
    p_course_location,
    p_course_instructor,
    p_google_calendar_url
  )
  returning id into v_enrollment_id;

  v_enrolled_count := v_enrolled_count + 1;

  if v_course.capacity_limit is not null and v_enrolled_count >= v_course.capacity_limit then
    update public.portal_courses
    set status = 'encerrado'
    where id = p_course_id;

    v_course.status := 'encerrado';
  end if;

  return query
  select v_enrollment_id, v_enrolled_count, v_course.capacity_limit, v_course.status, 'enrolled'::text;
end;
$$;

grant execute on function public.portal_attempt_course_enrollment(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;
