-- Ajout de la categorie Football - Records & Statistiques.
-- Cette migration complete le seed existant sans modifier les categories actuelles.

insert into private.quiz_categories (id, title, description, duration_seconds, is_active, display_order)
values (
  'footballRecords',
  '⚽ Football - Top 10 des records & statistiques',
  'Top 10 des records et statistiques du football (10 records)',
  600,
  true,
  27
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  duration_seconds = excluded.duration_seconds,
  is_active = excluded.is_active,
  display_order = excluded.display_order;

insert into private.quiz_answers (category_id, answer_text, answer_normalized, hint, answer_year, display_order)
values
  ('footballRecords', 'Lionel Messi', 'lionel messi', '⚽ 91 buts inscrits sur une année civile en 2012.', null, 1),
  ('footballRecords', 'Robert Lewandowski', 'robert lewandowski', '🔥 5 buts marqués en seulement 9 minutes avec le Bayern Munich.', null, 2),
  ('footballRecords', 'Sadio Mané', 'sadio mane', '⚡ 3 buts inscrits en 2 minutes et 56 secondes avec Southampton.', null, 3),
  ('footballRecords', 'Real Madrid', 'real madrid', '🏆 Club recordman avec 15 titres de Ligue des Champions.', null, 4),
  ('footballRecords', 'Lionel Messi', 'lionel messi', '🥇 Premier joueur à remporter le Ballon d’Or 4 fois consécutivement : 2009, 2010, 2011 et 2012.', null, 5),
  ('footballRecords', 'Lionel Messi', 'lionel messi', '👑 Recordman avec 8 Ballons d’Or remportés.', null, 6),
  ('footballRecords', 'Pelé', 'pele', '🌍 Seul joueur à avoir remporté 3 Coupes du Monde : 1958, 1962 et 1970.', null, 7),
  ('footballRecords', 'Bayern Munich', 'bayern munich', '💥 A battu le FC Barcelone 8-2 en quart de finale de la Ligue des Champions 2019/20.', null, 8),
  ('footballRecords', 'Lionel Messi', 'lionel messi', '👟 Recordman avec 6 Souliers d’Or européens.', null, 9),
  ('footballRecords', 'Real Madrid', 'real madrid', '🏆 A remporté les 5 premières éditions de la Coupe d’Europe des clubs champions consécutivement, de 1956 à 1960.', null, 10)
on conflict (category_id, display_order) do update set
  answer_text = excluded.answer_text,
  answer_normalized = excluded.answer_normalized,
  hint = excluded.hint,
  answer_year = excluded.answer_year;
