-- rewardable_task
CREATE SCHEMA IF NOT EXISTS rewardable_task;
GRANT USAGE
ON SCHEMA rewardable_task
TO postgres, anon, authenticated, service_role, dashboard_user;

-- --Task
CREATE TABLE rewardable_task.task (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    reward INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT NULL,
    type VARCHAR(30) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE POLICY "service_role_full_access"
ON rewardable_task.task
FOR ALL
USING (auth.role() = 'service_role');
INSERT INTO rewardable_task.task (title, description, reward, type, metadata) VALUES
    ('Join NutCoin news channel', 'Join NutCoin news channel', 100000, 'JOIN_TELEGRAM_CHANNEL', '{"link": "https://t.me/nutcoinclicker_news", "chatId": "@nutcoinclicker_news", "imageType": "TELEGRAM", "actionName": "Join"}'),
    ('Invite 3 friends', 'Invite 3 friends to NutCoin', 250000, 'REFERRAL', '{"imageType": "FRIENDS", "actionName": "Invite", "numFriends": 3}'),
    ('Watch NutCoin youtube', 'Check-in daily to NutCoin', 50000, 'VISIT', '{"link": "https://www.youtube.com/watch?v=Hd_mLPeD744", "imageType": "YOUTUBE", "actionName": "Watch Video", "numWaitSeconds": 30}');

-- --User Task
CREATE TABLE rewardable_task.rewarded_task (
    id SERIAL PRIMARY KEY,
    owner UUID REFERENCES auth.users(id) NOT NULL,
    task_id INTEGER REFERENCES rewardable_task.task(id) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    task_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (owner, task_id)
);

CREATE OR REPLACE FUNCTION reward_task (
    game_profile_id UUID,
    rewarded_task_id INTEGER,
    points_to_increase INTEGER
) RETURNS VOID AS $$
BEGIN
BEGIN
UPDATE rewardable_task.rewarded_task
SET completed = TRUE
WHERE id = rewarded_task_id;

UPDATE clicker.game_profile
SET point_balance = point_balance + points_to_increase
WHERE id = game_profile_id;

END;
END;
$$ LANGUAGE plpgsql;


CREATE POLICY "service_role_full_access"
ON rewardable_task.rewarded_task
FOR ALL
USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA rewardable_task
TO postgres, authenticated, service_role, dashboard_user, anon;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA rewardable_task
TO postgres, authenticated, service_role, dashboard_user, anon;
