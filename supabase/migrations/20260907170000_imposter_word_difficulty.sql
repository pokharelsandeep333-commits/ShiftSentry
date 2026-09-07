-- Make the bank playable: tag difficulty, exclude the obscure by default, and
-- add four categories of things people actually say.
--
-- The complaint that prompted this is exact: 'pancetta / prosciutto' and
-- 'pizza / burger' were in the same pool, so what a round felt like depended
-- entirely on the draw. Words like 'harp', 'bobsled', 'cufflinks' and
-- 'observatory' are real English but nobody can clue them at a table without
-- effectively saying them.
--
-- Three tiers rather than a delete, so nothing is lost:
--
--   EASY    words used without thinking. A gentle game for a mixed table.
--   NORMAL  known by everyone, just not said daily -- 'waterfall', 'lighthouse'.
--   HARD    real but not cluable. Off unless a host asks for it.
--
-- `word_difficulty` on the room is a ceiling, not an exact match: NORMAL draws
-- EASY and NORMAL both, so raising it widens the pool rather than swapping it.
-- The default is NORMAL, which is precisely the cut that was asked for -- the
-- obscure tail gone, everything else kept.
--
-- Deliberately not snapshotted onto game_rounds. Every other setting is,
-- because a finished round has to keep meaning what it meant -- but this one
-- only decides which word was drawn, and the round already records that in
-- `word_id`. A snapshot would be a column nothing could ever read back.

alter table public.game_words
  add column difficulty text not null default 'NORMAL'
  check (difficulty in ('EASY', 'NORMAL', 'HARD'));

create index game_words_difficulty_idx on public.game_words (difficulty, category);

alter table public.game_rooms
  add column word_difficulty text not null default 'NORMAL'
  check (word_difficulty in ('EASY', 'NORMAL', 'HARD'));

-- Tag the existing bank.
--
-- 37 words are real but not cluable at a table: 'pancetta' and 'pizza'
-- were being drawn from the same pool, so the difficulty of a round swung
-- wildly. HARD is excluded by the default setting.
update public.game_words set difficulty = 'HARD' where word in (
  'accordion',
  'aerobics',
  'algorithm',
  'audiobook',
  'blacksmith',
  'bobsled',
  'cockpit',
  'cubicle',
  'cufflinks',
  'dune',
  'fencing',
  'fern',
  'ferret',
  'filing cabinet',
  'firewall',
  'harp',
  'hedgehog',
  'kimono',
  'laundromat',
  'luggage rack',
  'meadow',
  'meeting minutes',
  'miner',
  'observatory',
  'orchestra',
  'pancetta',
  'parachuting',
  'payroll',
  'photocopier',
  'polo',
  'reef',
  'sprain',
  'stethoscope',
  'thermostat',
  'toll booth',
  'turban',
  'whiteboard eraser'
);

-- 272 words anyone would use without thinking, for a gentle game.
update public.game_words set difficulty = 'EASY' where word in (
  'actor',
  'airplane',
  'airport',
  'ambulance',
  'ant',
  'apple',
  'arm',
  'astronaut',
  'bacon',
  'bakery',
  'banana',
  'bandage',
  'bank',
  'barber',
  'basketball',
  'bathroom',
  'battery',
  'beach',
  'bear',
  'bed',
  'bedroom',
  'bee',
  'beer',
  'belt',
  'bicycle',
  'blanket',
  'blood',
  'boat',
  'bone',
  'boots',
  'bowling',
  'boxing',
  'brain',
  'bread',
  'bridge',
  'bus',
  'butter',
  'butterfly',
  'cake',
  'calculator',
  'camera',
  'candle',
  'car',
  'carrot',
  'cartoon',
  'castle',
  'cat',
  'chair',
  'chalk',
  'cheese',
  'chef',
  'chess',
  'chicken',
  'chocolate',
  'cinema',
  'circus',
  'classroom',
  'clock',
  'cloud',
  'coat',
  'coffee',
  'comedy',
  'computer',
  'concert',
  'cookie',
  'corn',
  'cow',
  'crab',
  'cycling',
  'dancer',
  'deer',
  'dentist',
  'desert',
  'doctor',
  'dog',
  'dolphin',
  'donut',
  'door',
  'driver',
  'drums',
  'eagle',
  'ear',
  'elephant',
  'email',
  'engine',
  'eraser',
  'exam',
  'eye',
  'farm',
  'farmer',
  'fever',
  'finger',
  'firefighter',
  'fishing',
  'flower',
  'fog',
  'foot',
  'football',
  'forest',
  'fork',
  'fox',
  'fridge',
  'frog',
  'giraffe',
  'gloves',
  'golf',
  'grape',
  'grass',
  'guitar',
  'gym',
  'hair',
  'hammer',
  'hand',
  'hat',
  'head',
  'headphones',
  'heart',
  'helicopter',
  'helmet',
  'hide and seek',
  'hiking',
  'homework',
  'honey',
  'hoodie',
  'horse',
  'hospital',
  'hotel',
  'ice cream',
  'island',
  'jacket',
  'jeans',
  'kangaroo',
  'key',
  'keyboard',
  'kitchen',
  'knee',
  'knife',
  'lake',
  'lamp',
  'lawyer',
  'leaf',
  'leg',
  'lemon',
  'library',
  'lion',
  'mall',
  'mango',
  'map',
  'microphone',
  'milk',
  'mirror',
  'monkey',
  'monopoly',
  'moon',
  'motorcycle',
  'mountain',
  'mouse',
  'mouth',
  'movie',
  'mug',
  'museum',
  'neck',
  'nose',
  'notebook',
  'ocean',
  'office',
  'onion',
  'orange',
  'oven',
  'owl',
  'painter',
  'pan',
  'pancake',
  'park',
  'parrot',
  'passport',
  'password',
  'pasta',
  'pencil',
  'penguin',
  'piano',
  'pig',
  'pillow',
  'pilot',
  'pineapple',
  'pizza',
  'plate',
  'police officer',
  'popcorn',
  'potato',
  'printer',
  'rabbit',
  'rain',
  'rainbow',
  'restaurant',
  'rice',
  'ring',
  'river',
  'robot',
  'rocket',
  'rope',
  'ruler',
  'running',
  'salad',
  'sandals',
  'sandwich',
  'scarf',
  'school',
  'scientist',
  'sheep',
  'ship',
  'shirt',
  'shoes',
  'shorts',
  'shoulder',
  'skateboard',
  'skiing',
  'skin',
  'skirt',
  'smartphone',
  'snake',
  'snow',
  'soap',
  'socks',
  'soda',
  'sofa',
  'soldier',
  'soup',
  'spider',
  'stadium',
  'star',
  'steak',
  'storm',
  'strawberry',
  'sugar',
  'suitcase',
  'sunglasses',
  'supermarket',
  'sweater',
  'swimming',
  't-shirt',
  'table',
  'taco',
  'taxi',
  'teacher',
  'television',
  'tennis',
  'thunder',
  'ticket',
  'tomato',
  'tongue',
  'tooth',
  'toothbrush',
  'towel',
  'train',
  'tree',
  'truck',
  'turtle',
  'umbrella',
  'video game',
  'volcano',
  'waiter',
  'wallet',
  'watch',
  'watermelon',
  'website',
  'whale',
  'wind',
  'writer',
  'yoga',
  'zebra',
  'zoo'
);

-- 160 new pairs across 4 categories, all everyday by construction.
insert into public.game_words (word, decoy_word, category, difficulty) values
  ('wifi', 'hotspot', 'Online & Phone Life', 'EASY'),
  ('selfie', 'group photo', 'Online & Phone Life', 'EASY'),
  ('emoji', 'sticker', 'Online & Phone Life', 'EASY'),
  ('screenshot', 'screen recording', 'Online & Phone Life', 'EASY'),
  ('group chat', 'video call', 'Online & Phone Life', 'EASY'),
  ('charger', 'power bank', 'Online & Phone Life', 'EASY'),
  ('notification', 'reminder', 'Online & Phone Life', 'EASY'),
  ('airplane mode', 'do not disturb', 'Online & Phone Life', 'EASY'),
  ('dark mode', 'night light', 'Online & Phone Life', 'EASY'),
  ('voice note', 'voicemail', 'Online & Phone Life', 'EASY'),
  ('story', 'status update', 'Online & Phone Life', 'EASY'),
  ('profile picture', 'cover photo', 'Online & Phone Life', 'EASY'),
  ('follower', 'subscriber', 'Online & Phone Life', 'EASY'),
  ('like', 'upvote', 'Online & Phone Life', 'EASY'),
  ('comment section', 'reply thread', 'Online & Phone Life', 'EASY'),
  ('hashtag', 'caption', 'Online & Phone Life', 'EASY'),
  ('livestream', 'premiere', 'Online & Phone Life', 'EASY'),
  ('meme', 'reaction gif', 'Online & Phone Life', 'EASY'),
  ('spam', 'junk mail', 'Online & Phone Life', 'EASY'),
  ('blocked', 'muted', 'Online & Phone Life', 'EASY'),
  ('autocorrect', 'predictive text', 'Online & Phone Life', 'EASY'),
  ('low battery', 'no signal', 'Online & Phone Life', 'EASY'),
  ('loading screen', 'buffering', 'Online & Phone Life', 'EASY'),
  ('software update', 'app install', 'Online & Phone Life', 'EASY'),
  ('two-factor code', 'security question', 'Online & Phone Life', 'EASY'),
  ('incognito', 'private window', 'Online & Phone Life', 'EASY'),
  ('bookmark', 'saved post', 'Online & Phone Life', 'EASY'),
  ('read receipt', 'typing indicator', 'Online & Phone Life', 'EASY'),
  ('data plan', 'roaming', 'Online & Phone Life', 'EASY'),
  ('ringtone', 'vibration', 'Online & Phone Life', 'EASY'),
  ('home screen', 'lock screen', 'Online & Phone Life', 'EASY'),
  ('cloud backup', 'local storage', 'Online & Phone Life', 'EASY'),
  ('qr code', 'barcode scanner', 'Online & Phone Life', 'EASY'),
  ('smart speaker', 'voice assistant', 'Online & Phone Life', 'EASY'),
  ('wireless earbuds', 'headphone jack', 'Online & Phone Life', 'EASY'),
  ('group video call', 'webinar', 'Online & Phone Life', 'EASY'),
  ('online shopping', 'food delivery', 'Online & Phone Life', 'EASY'),
  ('payment app', 'digital wallet', 'Online & Phone Life', 'EASY'),
  ('streak', 'daily reminder', 'Online & Phone Life', 'EASY'),
  ('unread messages', 'missed calls', 'Online & Phone Life', 'EASY'),
  ('dorm', 'apartment', 'College Life', 'EASY'),
  ('roommate', 'neighbour', 'College Life', 'EASY'),
  ('lecture hall', 'study room', 'College Life', 'EASY'),
  ('all-nighter', 'early start', 'College Life', 'EASY'),
  ('instant noodles', 'cup soup', 'College Life', 'EASY'),
  ('group project', 'solo assignment', 'College Life', 'EASY'),
  ('midterm', 'final exam', 'College Life', 'EASY'),
  ('attendance', 'roll call', 'College Life', 'EASY'),
  ('syllabus', 'reading list', 'College Life', 'EASY'),
  ('student id', 'library card', 'College Life', 'EASY'),
  ('campus', 'quad', 'College Life', 'EASY'),
  ('cafeteria', 'food court', 'College Life', 'EASY'),
  ('vending machine', 'snack bar', 'College Life', 'EASY'),
  ('laundry day', 'dish pile', 'College Life', 'EASY'),
  ('tuition fee', 'student loan', 'College Life', 'EASY'),
  ('internship', 'part-time job', 'College Life', 'EASY'),
  ('cover letter', 'personal statement', 'College Life', 'EASY'),
  ('study group', 'tutoring', 'College Life', 'EASY'),
  ('flashcards', 'sticky notes', 'College Life', 'EASY'),
  ('highlighter', 'marker pen', 'College Life', 'EASY'),
  ('backpack', 'tote bag', 'College Life', 'EASY'),
  ('lab coat', 'safety goggles', 'College Life', 'EASY'),
  ('presentation slides', 'poster board', 'College Life', 'EASY'),
  ('office hours', 'help desk', 'College Life', 'EASY'),
  ('class schedule', 'exam timetable', 'College Life', 'EASY'),
  ('graduation cap', 'class ring', 'College Life', 'EASY'),
  ('transcript', 'report card', 'College Life', 'EASY'),
  ('late submission', 'extension request', 'College Life', 'EASY'),
  ('plagiarism', 'citation', 'College Life', 'EASY'),
  ('club fair', 'orientation', 'College Life', 'EASY'),
  ('dorm party', 'study night', 'College Life', 'EASY'),
  ('commuter', 'resident', 'College Life', 'EASY'),
  ('meal plan', 'grocery run', 'College Life', 'EASY'),
  ('printer credit', 'photocopy card', 'College Life', 'EASY'),
  ('wifi password', 'campus login', 'College Life', 'EASY'),
  ('free food', 'leftover pizza', 'College Life', 'EASY'),
  ('nap', 'coffee run', 'College Life', 'EASY'),
  ('group chat drama', 'class gossip', 'College Life', 'EASY'),
  ('semester break', 'reading week', 'College Life', 'EASY'),
  ('dean', 'advisor', 'College Life', 'EASY'),
  ('nachos', 'cinema popcorn', 'Movies, Shows & Snacks', 'EASY'),
  ('prequel', 'spin-off', 'Movies, Shows & Snacks', 'EASY'),
  ('cliffhanger', 'plot twist', 'Movies, Shows & Snacks', 'EASY'),
  ('subtitles', 'dubbing', 'Movies, Shows & Snacks', 'EASY'),
  ('binge watch', 'rewatch', 'Movies, Shows & Snacks', 'EASY'),
  ('season finale', 'series premiere', 'Movies, Shows & Snacks', 'EASY'),
  ('spoiler', 'leak', 'Movies, Shows & Snacks', 'EASY'),
  ('main character', 'sidekick', 'Movies, Shows & Snacks', 'EASY'),
  ('villain', 'rival', 'Movies, Shows & Snacks', 'EASY'),
  ('plot hole', 'loose end', 'Movies, Shows & Snacks', 'EASY'),
  ('soundtrack', 'theme song', 'Movies, Shows & Snacks', 'EASY'),
  ('end credits', 'post-credits scene', 'Movies, Shows & Snacks', 'EASY'),
  ('cameo', 'guest star', 'Movies, Shows & Snacks', 'EASY'),
  ('box office', 'streaming numbers', 'Movies, Shows & Snacks', 'EASY'),
  ('front row', 'back row', 'Movies, Shows & Snacks', 'EASY'),
  ('movie night', 'watch party', 'Movies, Shows & Snacks', 'EASY'),
  ('horror film', 'psychological thriller', 'Movies, Shows & Snacks', 'EASY'),
  ('rom-com', 'drama series', 'Movies, Shows & Snacks', 'EASY'),
  ('documentary', 'docuseries', 'Movies, Shows & Snacks', 'EASY'),
  ('animated film', 'stop motion', 'Movies, Shows & Snacks', 'EASY'),
  ('superhero', 'antihero', 'Movies, Shows & Snacks', 'EASY'),
  ('stunt double', 'body double', 'Movies, Shows & Snacks', 'EASY'),
  ('blooper', 'outtake', 'Movies, Shows & Snacks', 'EASY'),
  ('director', 'producer', 'Movies, Shows & Snacks', 'EASY'),
  ('script', 'screenplay', 'Movies, Shows & Snacks', 'EASY'),
  ('audition', 'screen test', 'Movies, Shows & Snacks', 'EASY'),
  ('award show', 'film festival', 'Movies, Shows & Snacks', 'EASY'),
  ('fan theory', 'easter egg', 'Movies, Shows & Snacks', 'EASY'),
  ('reboot', 'spin-off', 'Movies, Shows & Snacks', 'EASY'),
  ('cinema ticket', 'streaming subscription', 'Movies, Shows & Snacks', 'EASY'),
  ('recliner seat', 'beanbag', 'Movies, Shows & Snacks', 'EASY'),
  ('slushie', 'milkshake', 'Movies, Shows & Snacks', 'EASY'),
  ('candy bar', 'gummy bears', 'Movies, Shows & Snacks', 'EASY'),
  ('nacho cheese', 'salsa dip', 'Movies, Shows & Snacks', 'EASY'),
  ('trailer reaction', 'first watch', 'Movies, Shows & Snacks', 'EASY'),
  ('laugh track', 'live audience', 'Movies, Shows & Snacks', 'EASY'),
  ('cast reunion', 'anniversary special', 'Movies, Shows & Snacks', 'EASY'),
  ('streaming queue', 'watchlist', 'Movies, Shows & Snacks', 'EASY'),
  ('skip intro', 'play next', 'Movies, Shows & Snacks', 'EASY'),
  ('closing scene', 'opening shot', 'Movies, Shows & Snacks', 'EASY'),
  ('momo', 'dumpling', 'Nepali & South Asian', 'EASY'),
  ('daal bhaat', 'thali', 'Nepali & South Asian', 'EASY'),
  ('chiya', 'masala tea', 'Nepali & South Asian', 'EASY'),
  ('sel roti', 'doughnut', 'Nepali & South Asian', 'EASY'),
  ('chowmein', 'thukpa', 'Nepali & South Asian', 'EASY'),
  ('samosa', 'pakoda', 'Nepali & South Asian', 'EASY'),
  ('gundruk', 'pickle', 'Nepali & South Asian', 'EASY'),
  ('dhido', 'porridge', 'Nepali & South Asian', 'EASY'),
  ('achar', 'chutney', 'Nepali & South Asian', 'EASY'),
  ('kurta', 'sari', 'Nepali & South Asian', 'EASY'),
  ('daura suruwal', 'sherwani', 'Nepali & South Asian', 'EASY'),
  ('topi', 'turban', 'Nepali & South Asian', 'EASY'),
  ('rickshaw', 'tempo', 'Nepali & South Asian', 'EASY'),
  ('micro bus', 'local bus', 'Nepali & South Asian', 'EASY'),
  ('load shedding', 'power cut', 'Nepali & South Asian', 'EASY'),
  ('water tanker', 'well', 'Nepali & South Asian', 'EASY'),
  ('Dashain', 'Tihar', 'Nepali & South Asian', 'EASY'),
  ('Holi', 'Fagu', 'Nepali & South Asian', 'EASY'),
  ('Teej', 'Chhath', 'Nepali & South Asian', 'EASY'),
  ('tika', 'garland', 'Nepali & South Asian', 'EASY'),
  ('puja', 'aarti', 'Nepali & South Asian', 'EASY'),
  ('temple bell', 'prayer wheel', 'Nepali & South Asian', 'EASY'),
  ('stupa', 'pagoda', 'Nepali & South Asian', 'EASY'),
  ('prayer flag', 'incense', 'Nepali & South Asian', 'EASY'),
  ('Everest', 'Annapurna', 'Nepali & South Asian', 'EASY'),
  ('Pokhara', 'Kathmandu', 'Nepali & South Asian', 'EASY'),
  ('Phewa lake', 'Rara lake', 'Nepali & South Asian', 'EASY'),
  ('terai', 'hills', 'Nepali & South Asian', 'EASY'),
  ('monsoon', 'winter fog', 'Nepali & South Asian', 'EASY'),
  ('paddy field', 'terrace farm', 'Nepali & South Asian', 'EASY'),
  ('buffalo', 'ox', 'Nepali & South Asian', 'EASY'),
  ('khukuri', 'sickle', 'Nepali & South Asian', 'EASY'),
  ('doko', 'basket', 'Nepali & South Asian', 'EASY'),
  ('bhat', 'roti', 'Nepali & South Asian', 'EASY'),
  ('lassi', 'buttermilk', 'Nepali & South Asian', 'EASY'),
  ('jalebi', 'laddu', 'Nepali & South Asian', 'EASY'),
  ('panipuri', 'chatpate', 'Nepali & South Asian', 'EASY'),
  ('street vendor', 'corner shop', 'Nepali & South Asian', 'EASY'),
  ('school uniform', 'tracksuit', 'Nepali & South Asian', 'EASY'),
  ('tuition class', 'coaching centre', 'Nepali & South Asian', 'EASY');

-- Draw honours the room's ceiling as well as its category.
--
-- Everything else about this function is unchanged: the advisory lock still
-- serialises draws per room so two clients cannot take the same word, and an
-- exhausted pool still recycles rather than failing. The pool is simply narrower
-- now, which makes exhaustion more likely -- a room on EASY with a category
-- filter can be down to a few dozen words -- so the recycle path matters more
-- than it did.
create or replace function public.draw_game_word(p_room_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_filter text;
  difficulty_cap text;
  allowed text[];
  drawn_word_id bigint;
begin
  select category_filter, word_difficulty
    into room_filter, difficulty_cap
    from public.game_rooms
    where id = p_room_id
      and host_id = (select auth.uid())
      and status <> 'ENDED';

  if not found then
    raise exception 'Only the host of an active room can draw a word.';
  end if;

  -- A ceiling, not an exact match.
  allowed := case difficulty_cap
    when 'EASY' then array['EASY']
    when 'NORMAL' then array['EASY', 'NORMAL']
    else array['EASY', 'NORMAL', 'HARD']
  end;

  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  select game_words.id
    into drawn_word_id
    from public.game_words
    where (room_filter is null or game_words.category = room_filter)
      and game_words.difficulty = any(allowed)
      and not exists (
        select 1
        from public.game_room_used_words
        where game_room_used_words.room_id = p_room_id
          and game_room_used_words.word_id = game_words.id
      )
    order by random()
    limit 1;

  if drawn_word_id is null then
    delete from public.game_room_used_words where room_id = p_room_id;

    select game_words.id
      into drawn_word_id
      from public.game_words
      where (room_filter is null or game_words.category = room_filter)
        and game_words.difficulty = any(allowed)
      order by random()
      limit 1;
  end if;

  if drawn_word_id is null then
    raise exception 'No words are available for that category and difficulty.';
  end if;

  insert into public.game_room_used_words (room_id, word_id)
  values (p_room_id, drawn_word_id);

  return drawn_word_id;
end;
$$;

-- One more setting, so the function takes one more argument.
drop function if exists public.update_game_room_settings(uuid, text, boolean, boolean, integer, integer, integer, boolean, boolean, text);

create or replace function public.update_game_room_settings(
  p_room_id uuid,
  p_imposter_hint text,
  p_hide_roles boolean,
  p_imposter_final_guess boolean,
  p_imposter_count integer,
  p_clue_passes integer,
  p_max_players integer,
  p_ban_repeat_clues boolean,
  p_discussion_phase boolean,
  p_word_difficulty text,
  p_category_filter text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  seated integer;
  available integer;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  if p_imposter_hint is null or p_imposter_hint not in ('NONE', 'CATEGORY', 'RELATED', 'DECOY') then
    raise exception 'Unknown hint setting.';
  end if;

  if p_word_difficulty is null or p_word_difficulty not in ('EASY', 'NORMAL', 'HARD') then
    raise exception 'Unknown difficulty setting.';
  end if;

  if p_hide_roles and p_imposter_hint <> 'DECOY' then
    raise exception 'Roles can only be hidden when the imposter gets a decoy word.';
  end if;

  perform 1
    from public.game_rooms
    where id = p_room_id
      and host_id = actor
      and status = 'LOBBY';

  if not found then
    raise exception 'Only the host can change the settings, and only before a round starts.';
  end if;

  select count(*) into seated
    from public.game_room_players
    where room_id = p_room_id;

  if p_max_players < seated then
    raise exception 'There are already % players in this room.', seated;
  end if;

  -- Refuse a combination with nothing in it, rather than letting the host find
  -- out when the first round will not deal. Narrow is fine; empty is not.
  select count(*) into available
    from public.game_words
    where (nullif(btrim(p_category_filter), '') is null
           or category = nullif(btrim(p_category_filter), ''))
      and difficulty = any(case p_word_difficulty
        when 'EASY' then array['EASY']
        when 'NORMAL' then array['EASY', 'NORMAL']
        else array['EASY', 'NORMAL', 'HARD']
      end);

  if available = 0 then
    raise exception 'No words match that category and difficulty. Widen one of them.';
  end if;

  update public.game_rooms
     set imposter_hint = p_imposter_hint,
         hide_roles = p_hide_roles,
         imposter_final_guess = p_imposter_final_guess,
         imposter_count = p_imposter_count,
         clue_passes = p_clue_passes,
         max_players = p_max_players,
         ban_repeat_clues = p_ban_repeat_clues,
         discussion_phase = p_discussion_phase,
         word_difficulty = p_word_difficulty,
         category_filter = nullif(btrim(p_category_filter), ''),
         decoy_mode = (p_imposter_hint = 'DECOY'),
         category_hint = (p_imposter_hint = 'CATEGORY')
   where id = p_room_id;
end;
$$;

comment on function public.update_game_room_settings(uuid, text, boolean, boolean, integer, integer, integer, boolean, boolean, text, text) is
  'Host-only settings update, refused once a round has been dealt or if the category and difficulty leave no words.';

-- The category picker needs to count what is actually drawable, not the whole
-- category, or a host on EASY sees "Places (52)" and draws from far fewer.
--
-- Dropped rather than replaced: `create or replace` cannot change a signature,
-- so adding the defaulted argument would have left the old zero-argument
-- function in place and made `game_word_categories()` an ambiguous call.
drop function if exists public.game_word_categories();

create or replace function public.game_word_categories(p_difficulty text default 'HARD')
returns table (category text, word_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select game_words.category, count(*) as word_count
  from public.game_words
  where game_words.difficulty = any(case p_difficulty
    when 'EASY' then array['EASY']
    when 'NORMAL' then array['EASY', 'NORMAL']
    else array['EASY', 'NORMAL', 'HARD']
  end)
  group by game_words.category
  order by game_words.category;
$$;

comment on function public.game_word_categories(text) is
  'Categories with the number of words drawable at or below the given difficulty ceiling.';

revoke execute on function public.update_game_room_settings(uuid, text, boolean, boolean, integer, integer, integer, boolean, boolean, text, text) from public, anon;
revoke execute on function public.game_word_categories(text) from public, anon;
grant execute on function public.update_game_room_settings(uuid, text, boolean, boolean, integer, integer, integer, boolean, boolean, text, text) to authenticated;
grant execute on function public.game_word_categories(text) to authenticated;
