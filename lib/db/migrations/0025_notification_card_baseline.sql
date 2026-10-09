-- Preserve historical card milestones as historical timestamps. This does not
-- create notifications: the projection's rollout cutoff excludes these dates.
-- Without this baseline, replacing a pre-rollout card could announce its old
-- milestone as new. Do not overwrite a newly committed card-save timestamp.
UPDATE agreements a
SET primary_card_saved_at = coalesce(a.primary_card_saved_at, old_cards.primary_at),
    backup_card_saved_at = coalesce(a.backup_card_saved_at, old_cards.backup_at)
FROM (
  SELECT cards.link_id,
    min(cards.created_at) FILTER (WHERE cards.rank = 'primary') AS primary_at,
    min(cards.created_at) FILTER (WHERE cards.rank = 'secondary' AND terms.type = 'subscription') AS backup_at
  FROM customer_cards cards
  JOIN payment_link_terms terms ON terms.link_id = cards.link_id AND terms.enrollment_flow = true
  JOIN enrollment_notification_rollout rollout ON rollout.id = 'enrollment'
  WHERE cards.created_at < rollout.since
  GROUP BY cards.link_id
) old_cards
WHERE a.link_id = old_cards.link_id
  AND (a.primary_card_saved_at IS NULL OR a.backup_card_saved_at IS NULL);
-- Custom SQL migration file, put your code below! --