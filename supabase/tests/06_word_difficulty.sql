\set ON_ERROR_STOP on

-- The bank is tagged, and the obscure tail is off by default ---------------
do $$
declare
  easy integer; normal integer; hard integer; total integer; categories integer;
begin
  select
    count(*) filter (where difficulty = 'EASY'),
    count(*) filter (where difficulty = 'NORMAL'),
    count(*) filter (where difficulty = 'HARD'),
    count(*),
    count(distinct category)
  into easy, normal, hard, total, categories
  from public.game_words;

  if easy = 0 or normal = 0 or hard = 0 then
    raise exception 'a tier is empty: easy=% normal=% hard=%', easy, normal, hard;
  end if;
  raise notice 'bank: % pairs across % categories -- % easy, % normal, % hard',
    total, categories, easy, normal, hard;

  -- The specific pairs that prompted this must be out of the default pool.
  if exists (
    select 1 from public.game_words
    where word in ('pancetta', 'harp', 'bobsled', 'cufflinks', 'observatory', 'miner')
      and difficulty <> 'HARD'
  ) then
    raise exception 'an obscure word is still in the default pool';
  end if;
  raise notice 'the words that started this are all tagged HARD';

  -- ...and the everyday ones are not.
  if exists (
    select 1 from public.game_words
    where word in ('pizza', 'dog', 'chair', 'rain', 'teacher')
      and difficulty <> 'EASY'
  ) then
    raise exception 'an everyday word was not tagged EASY';
  end if;
  raise notice 'everyday words are tagged EASY';
end;
$$;

-- The ceiling widens the pool rather than swapping it ----------------------
do $$
declare
  at_easy integer; at_normal integer; at_hard integer;
begin
  select coalesce(sum(word_count), 0) into at_easy   from public.game_word_categories('EASY');
  select coalesce(sum(word_count), 0) into at_normal from public.game_word_categories('NORMAL');
  select coalesce(sum(word_count), 0) into at_hard   from public.game_word_categories('HARD');

  if not (at_easy < at_normal and at_normal < at_hard) then
    raise exception 'ceilings do not nest: easy=% normal=% hard=%', at_easy, at_normal, at_hard;
  end if;
  raise notice 'ceilings nest: EASY % < NORMAL % < HARD %', at_easy, at_normal, at_hard;
end;
$$;

-- Drawing respects the ceiling ---------------------------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  new_code text; room uuid; drawn bigint; drew_hard integer := 0; i integer;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  new_code := public.create_game_room('Alice');
  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = new_code;
  execute 'set local role authenticated';

  -- A fresh room defaults to NORMAL, which is the cut that was asked for.
  execute 'set local role postgres';
  if (select word_difficulty from public.game_rooms where id = room) <> 'NORMAL' then
    raise exception 'a new room did not default to NORMAL';
  end if;
  execute 'set local role authenticated';

  -- 200 draws at the default must never surface a HARD word.
  for i in 1..200 loop
    drawn := public.draw_game_word(room);
    execute 'set local role postgres';
    select drew_hard + count(*) into drew_hard
      from public.game_words where id = drawn and difficulty = 'HARD';
    execute 'set local role authenticated';
  end loop;

  if drew_hard <> 0 then raise exception '% HARD words drawn at the NORMAL ceiling', drew_hard; end if;
  raise notice '200 draws at NORMAL, no HARD word surfaced';

  -- On EASY, every draw is EASY.
  perform public.update_game_room_settings(room, 'NONE', false, true, 1, 1, 8, true, false, 'EASY', null);
  for i in 1..100 loop
    drawn := public.draw_game_word(room);
    execute 'set local role postgres';
    select drew_hard + count(*) into drew_hard
      from public.game_words where id = drawn and difficulty <> 'EASY';
    execute 'set local role authenticated';
  end loop;
  if drew_hard <> 0 then raise exception '% non-EASY words drawn at the EASY ceiling', drew_hard; end if;
  raise notice '100 draws at EASY, all easy';
end;
$$;

-- A combination with nothing in it is refused up front ---------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  new_code text; room uuid; empty_category text;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  new_code := public.create_game_room('Alice');
  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = new_code;

  -- A category with no EASY words at all, if one exists.
  select category into empty_category
    from public.game_words
    group by category
    having count(*) filter (where difficulty = 'EASY') = 0
    limit 1;

  execute 'set local role authenticated';

  if empty_category is not null then
    begin
      perform public.update_game_room_settings(room, 'NONE', false, true, 1, 1, 8, true, false, 'EASY', empty_category);
      raise exception 'an empty category/difficulty pair was accepted';
    exception when sqlstate 'P0001' then
      if sqlerrm !~ 'No words match' then raise; end if;
      raise notice 'empty combination refused: % on EASY', empty_category;
    end;
  else
    raise notice 'every category has easy words, so there is no empty combination to refuse';
  end if;

  -- A null difficulty must be refused by the guard, not by the column.
  begin
    perform public.update_game_room_settings(room, 'NONE', false, true, 1, 1, 8, true, false, null, null);
    raise exception 'a null difficulty was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'Unknown difficulty' then raise; end if;
    raise notice 'null difficulty refused by the guard, not the constraint';
  end;
end;
$$;

-- The new categories are all present and drawable --------------------------
do $$
declare
  wanted constant text[] := array[
    'Online & Phone Life', 'College Life', 'Movies, Shows & Snacks', 'Nepali & South Asian'
  ];
  name text; seen integer;
begin
  foreach name in array wanted loop
    select count(*) into seen from public.game_words where category = name and difficulty = 'EASY';
    if seen < 30 then raise exception 'category % has only % easy words', name, seen; end if;
  end loop;
  raise notice 'all four new categories present, 30+ easy words each';

  -- Nothing in the new categories duplicates an existing word.
  select count(*) into seen from (
    select word from public.game_words group by word having count(*) > 1
  ) duplicates;
  if seen <> 0 then raise exception '% duplicated words in the bank', seen; end if;
  raise notice 'no duplicate words across the whole bank';
end;
$$;

do $$ begin raise notice 'WORD DIFFICULTY PASSED'; end; $$;
