-- The HBOT niche and published flow already exist. Extend the existing service
-- to Chiro-family customers; never create a second niche or replace office copy.
-- This is a one-time, journaled migration, not a per-request entitlement sync.
DO $hbot_access$
DECLARE
  hbot_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hbot-chiro-customer-access'));
  IF (SELECT count(*) FROM niches WHERE name='HBOT' AND sector='healthcare' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Exactly one active healthcare HBOT niche must be published before customer activation';
  END IF;
  SELECT id INTO hbot_id FROM niches WHERE name='HBOT' AND sector='healthcare' AND is_active;
  IF (SELECT count(*) FROM script_flow_steps WHERE niche_id=hbot_id AND flow_kind='reactivation') < 35
     OR (SELECT count(*) FROM script_flow_choices WHERE niche_id=hbot_id AND flow_kind='reactivation') < 91
     OR (SELECT count(DISTINCT step_key) FROM script_flow_steps WHERE niche_id=hbot_id AND flow_kind='reactivation'
       AND step_key IN ('open','digging_in','making_it_real','review','recommendation','scheduling')) <> 6 THEN
    RAISE EXCEPTION 'Publish the complete HBOT caller flow before granting customer access';
  END IF;
  -- Change only the retired sleep question, never replace the whole office
  -- script. The exact replacement and already-current wording are both safe.
  IF (SELECT count(*) FROM script_flow_steps
      WHERE niche_id=hbot_id AND flow_kind='reactivation'
        AND step_key IN ('digging_in','digging_in_returning','digging_in_fully_back')
        AND (strpos(content,'How''s your sleep been?') > 0
          OR strpos(content,'How''s your sleep been... good, average, or could be better?') > 0)) <> 3 THEN
    RAISE EXCEPTION 'Confirm all three HBOT sleep questions before customer activation';
  END IF;
  UPDATE script_flow_steps
  SET content=replace(content,'How''s your sleep been?',
    'How''s your sleep been... good, average, or could be better?'), updated_at=now()
  WHERE niche_id=hbot_id AND flow_kind='reactivation'
    AND step_key IN ('digging_in','digging_in_returning','digging_in_fully_back')
    AND strpos(content,'How''s your sleep been?') > 0;

  INSERT INTO niche_access (participant_id,niche_id)
  SELECT DISTINCT access.participant_id,hbot_id
  FROM niche_access access
  JOIN niches previous ON previous.id=access.niche_id
  JOIN participants owner ON owner.id=access.participant_id AND owner.role='owner'
  WHERE previous.name IN ('Chiropractic','Decompression','Neuropathy','Joint Pain','Acoustic Wave Therapy',
    'Acupuncture','Massage Therapy','Gut Health')
  ON CONFLICT (participant_id,niche_id) DO NOTHING;
END;
$hbot_access$;
