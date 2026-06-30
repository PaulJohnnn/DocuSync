-- Please run this SQL in your Supabase SQL Editor to create the matchmaker table

CREATE TABLE IF NOT EXISTS matchmaker_lobbies (
    otp TEXT PRIMARY KEY,
    room_name TEXT NOT NULL,
    host_node_id TEXT NOT NULL,
    host_ip TEXT NOT NULL,
    host_port INTEGER NOT NULL,
    host_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Enable RLS and create a policy to allow anyone to read and write (since it's a public matchmaker)
ALTER TABLE matchmaker_lobbies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to matchmaker_lobbies" ON matchmaker_lobbies;
CREATE POLICY "Public access to matchmaker_lobbies" ON matchmaker_lobbies FOR ALL USING (true) WITH CHECK (true);
