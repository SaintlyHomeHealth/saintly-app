-- Seed Maricopa County SNFs for Facilities CRM (idempotent on name + address_line_1 + zip).

DO $$
DECLARE
  v_inserted int := 0;
  v_total constant int := 20;
BEGIN
  WITH src(name, address_line_1, city, state, zip, main_phone) AS (
    VALUES
      ('Fellowship Square Phoenix', '2002 W Sunnyside Ave', 'Phoenix', 'AZ', '85029', '602-943-1800'),
      ('Vi at Grayhawk', '7501 E Thompson Peak Pkwy', 'Scottsdale', 'AZ', '85255', '480-563-0023'),
      ('Allegiant Healthcare of Mesa', '3130 E Broadway Rd', 'Mesa', 'AZ', '85204', '480-924-7777'),
      ('Archstone Care Center', '1980 W Pecos Rd', 'Chandler', 'AZ', '85224', '480-899-0641'),
      ('The Gardens of Sun City', '17225 Boswell Blvd', 'Sun City', 'AZ', '85373', '623-933-2222'),
      ('Plaza Del Rio Care Center', '13215 N 94th Dr', 'Peoria', 'AZ', '85381', '623-933-7722'),
      ('Maryland Gardens Post Acute', '31 W Maryland Ave', 'Phoenix', 'AZ', '85013', '602-265-7484'),
      ('Palm Valley Post Acute', '13575 W McDowell Rd', 'Goodyear', 'AZ', '85395', '623-536-9911'),
      ('The Palazzo Skilled Nursing', '6250 N 19th Ave', 'Phoenix', 'AZ', '85015', '602-433-6300'),
      ('Horizon Post Acute & Rehab', '4704 W Diana Ave', 'Glendale', 'AZ', '85302', '623-931-5471'),
      ('Citadel Care Center', '5121 E Broadway Rd', 'Mesa', 'AZ', '85206', '480-832-5555'),
      ('Desert Cove Nursing Center', '1750 W Frye Rd', 'Chandler', 'AZ', '85224', '480-899-0641'),
      ('Ahwatukee Post Acute', '15810 S 42nd St', 'Phoenix', 'AZ', '85048', '480-759-0358'),
      ('Advanced Health Care of Mesa', '5755 E Main St', 'Mesa', 'AZ', '85205', '480-218-1100'),
      ('Haven of Scottsdale', '3293 N Drinkwater Blvd', 'Scottsdale', 'AZ', '85251', '480-947-7443'),
      ('Friendship Village of Tempe', '2525 E Southern Ave', 'Tempe', 'AZ', '85282', '480-831-5000'),
      ('Brookdale North Chandler', '2555 N Price Rd', 'Chandler', 'AZ', '85224', '480-732-9011'),
      ('Beatitudes Campus', '1610 W Glendale Ave', 'Phoenix', 'AZ', '85021', '602-995-6103'),
      ('Rio Vista Post Acute', '10323 W Olive Ave', 'Peoria', 'AZ', '85345', '623-486-2101'),
      ('Scottsdale Heritage Court', '3339 N Drinkwater Blvd', 'Scottsdale', 'AZ', '85251', '480-949-5400')
  ),
  eligible AS (
    SELECT
      trim(s.name) AS name,
      trim(s.address_line_1) AS address_line_1,
      trim(s.city) AS city,
      trim(s.state) AS state,
      trim(s.zip) AS zip,
      trim(s.main_phone) AS main_phone
    FROM src s
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.facilities f
      WHERE lower(trim(f.name)) = lower(trim(s.name))
        AND lower(trim(coalesce(f.address_line_1, ''))) = lower(trim(coalesce(s.address_line_1, '')))
        AND trim(coalesce(f.zip, '')) = trim(coalesce(s.zip, ''))
    )
  )
  INSERT INTO public.facilities (
    name,
    type,
    status,
    priority,
    address_line_1,
    city,
    state,
    zip,
    main_phone,
    is_active
  )
  SELECT
    e.name,
    'Skilled Nursing Facility',
    'New',
    'Medium',
    e.address_line_1,
    e.city,
    e.state,
    e.zip,
    e.main_phone,
    true
  FROM eligible e;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE 'facilities seed (Maricopa SNFs): inserted %, skipped %', v_inserted, (v_total - v_inserted);
END $$;
