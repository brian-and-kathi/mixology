-- 019_admin_login_attempts: server-side throttle for the admin PIN keypad.
-- One row per key: the client IP and the device-id cookie are counted separately (kind 'ip' / 'device'),
-- so clearing the cookie or reloading never resets the IP count. Keys are stored as SHA-256 digests,
-- never raw IPs or cookie values. 5 wrong PINs lock the key: 5 minutes the first time, then 15 minutes,
-- then 1 hour for every lockout after that. A correct PIN deletes the rows (counter and escalation reset).
-- Display/auth plumbing only: never touches stock or menu data. Idempotent; one transaction; recorded once.
BEGIN;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  kind            text        NOT NULL CHECK (kind IN ('ip', 'device')),
  key_hash        bytea       NOT NULL CHECK (octet_length(key_hash) = 32),
  fails           integer     NOT NULL DEFAULT 0 CHECK (fails BETWEEN 0 AND 4),
  lockouts        integer     NOT NULL DEFAULT 0 CHECK (lockouts >= 0),
  locked_until    timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key_hash)
);

COMMENT ON TABLE admin_login_attempts IS
  'Admin PIN throttle: wrong-PIN count and lockout per SHA-256(ip) and SHA-256(device cookie). Rows are deleted on a correct PIN.';

-- Records one wrong PIN for a key and returns its locked_until (NULL when not locked).
-- The 5th wrong try in a row locks: 5 min, then 15 min, then 1 h (stays at 1 h); the count restarts after each lock.
CREATE OR REPLACE FUNCTION admin_login_fail(p_kind text, p_key bytea)
RETURNS timestamptz
LANGUAGE sql
AS $$
  INSERT INTO admin_login_attempts AS a (kind, key_hash, fails, lockouts, locked_until, last_attempt_at)
  VALUES (p_kind, p_key, 1, 0, NULL, now())
  ON CONFLICT (kind, key_hash) DO UPDATE SET
    fails        = CASE WHEN a.fails + 1 >= 5 THEN 0 ELSE a.fails + 1 END,
    lockouts     = CASE WHEN a.fails + 1 >= 5 THEN a.lockouts + 1 ELSE a.lockouts END,
    locked_until = CASE WHEN a.fails + 1 >= 5
                        THEN now() + CASE a.lockouts WHEN 0 THEN interval '5 minutes'
                                                     WHEN 1 THEN interval '15 minutes'
                                                     ELSE interval '1 hour' END
                        ELSE a.locked_until END,
    last_attempt_at = now()
  RETURNING CASE WHEN a.locked_until > now() THEN a.locked_until END;
$$;

COMMENT ON FUNCTION admin_login_fail(text, bytea) IS
  'Admin PIN throttle: count one wrong PIN for a key; returns locked_until when this or an earlier failure locked it.';

INSERT INTO schema_migrations (version) VALUES ('019_admin_login_attempts.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
