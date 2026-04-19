-- SMS / FCM: one row per app install per user (device_install_id), not per FCM token.
-- Token rotation updates the same row; stale all-NULL install rows are removed.

-- 1) Rows without a stable install key cannot be deduped; drop them (clients re-register with install id).
DELETE FROM public.user_push_devices
WHERE device_install_id IS NULL
   OR length(trim(device_install_id)) = 0;

-- 2) Keep the newest row per (user_id, device_install_id).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, device_install_id
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.user_push_devices
)
DELETE FROM public.user_push_devices u
WHERE u.id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Replace (user_id, fcm_token) uniqueness with (user_id, device_install_id).
ALTER TABLE public.user_push_devices
  DROP CONSTRAINT IF EXISTS user_push_devices_user_fcm_unique;

ALTER TABLE public.user_push_devices
  ADD CONSTRAINT user_push_devices_user_install_unique
  UNIQUE (user_id, device_install_id);

ALTER TABLE public.user_push_devices
  ALTER COLUMN device_install_id SET NOT NULL;
