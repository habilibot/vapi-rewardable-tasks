import { createClient } from 'jsr:@supabase/supabase-js@2';
import { convertToTask } from '../_dto/task.ts';
import { validateTelegramWebAppData } from '../_utils/telegram.ts';

export default async (req: Request) => {
  const headers = req.headers;
  const authorization = headers.get('Authorization');
  if (!authorization) {
    return new Response('Authorization header required', {
      headers: {'Content-Type': 'application/json'},
      status: 401,
    });
  }

  const client = createClient(
    Deno.env.get('SHAPLE_URL') ?? '',
    Deno.env.get('SHAPLE_SERVICE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const jwt = authorization.split(' ')[1];
  const {
    data: { user },
  } = await client.auth.getUser(jwt);

  if (!user) {
    console.error('User not found');
    return new Response('Invalid auth user', {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    });
  }

  const { data: gameProfile, getGameProfileError } = await client
    .schema('clicker')
    .from('game_profile')
    .select()
    .eq('owner', user.id)
    .single();

  if (getGameProfileError) {
    console.error(getGameProfileError);
    return new Response(
      JSON.stringify({ error: getGameProfileError.message }),
      {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      },
    );
  }

  const { taskId, telegramInitData } = await req.json();

  const { data: task, error } = await client
    .schema('rewardable_task')
    .from('task')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error) {
    console.error(error);
    return new Response('Task not completed', {
      headers: {'Content-Type': 'application/json'},
      status: 500,
    });
  }

  if (!task) {
    return new Response('Task not found', {
      headers: {'Content-Type': 'application/json'},
      status: 404,
    });
  }

  const { data: rewardedTask, upsertError } = await client
    .schema('rewardable_task')
    .from('rewarded_task')
    .upsert(
      {
        owner: user.id,
        task_id: taskId,
      },
      {
        onConflict: ['owner', 'task_id'],
      },
    )
    .select('*')
    .single();

  if (upsertError) {
    console.error(upsertError);
    return new Response('Failed to upsert rewarded task', {
      headers: {'Content-Type': 'application/json'},
      status: 500,
    });
  }

  if (rewardedTask.completed) {
    return new Response(JSON.stringify(convertToTask(rewardedTask)), {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    });
  }

  switch (task.type) {
    case 'JOIN_TELEGRAM_CHANNEL':
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
      if (!telegramInitData) {
        return new Response('Invalid request', {
          headers: {'Content-Type': 'application/json'},
          status: 400,
        });
      }
      const chatId = task.metadata.chatId;
      return checkJoinTelegram(
        telegramInitData,
        botToken,
        rewardedTask.id,
        task.reward,
        chatId,
        gameProfile.id,
        client,
      );
    case 'REFERRAL':
      const numReferrals = task.metadata.numFriends ?? 1;
      return checkReferral(
        user.id,
        Number(numReferrals),
        rewardedTask.id,
        task.reward,
        gameProfile.id,
        client,
      );
    case 'VISIT':
      const numWaitSeconds = task.metadata.numWaitSeconds ?? 10;
      return checkVisit(
        rewardedTask,
        task.reward,
        Number(numWaitSeconds),
        gameProfile.id,
        client,
      );
    default:
      return new Response('Invalid task type', {
        headers: {'Content-Type': 'application/json'},
        status: 400,
      });
  }
};

async function checkJoinTelegram(
  telegramInitData: string,
  botToken: string,
  rewardedTaskId: number,
  rewardPoints: number,
  channelUsername: string,
  gameProfileId: number,
  client: any,
) {
  // Implement the logic to check if the user has joined the Telegram channel
  // This is a placeholder implementation

  const {
    validatedData,
    user: telegramUser,
    message,
  } = validateTelegramWebAppData(telegramInitData, botToken);

  if (!validatedData) {
    console.error(`Invalid Telegram data: ${message}`);
    return new Response(JSON.stringify(`Invalid Telegram data: ${message}`), {
      headers: {'Content-Type': 'application/json'},
      status: 400,
    });
  }

  const telegramId = telegramUser.id?.toString();
  if (!telegramId) {
    console.error('Invalid user data');
    return new Response(JSON.stringify('Invalid user data'), {
      headers: {'Content-Type': 'application/json'},
      status: 400,
    });
  }

  if (!channelUsername) {
    console.error('Missing Telegram channel/group username in task data');
    return new Response(
      'Missing Telegram channel/group username in task data',
      {
        headers: {'Content-Type': 'application/json'},
        status: 400,
      },
    );
  }
  let formattedChatId = channelUsername;
  if (!channelUsername.startsWith('@') && !channelUsername.startsWith('-100')) {
    formattedChatId = '@' + channelUsername;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(formattedChatId)}&user_id=${telegramId}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to check membership:', errorText);
      return new Response('Failed to check membership', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    const data = await response.json();
    console.log('Telegram API response:', data);

    if (!data.ok) {
      return new Response('Failed to check membership', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    const status = data.result.status;
    const joined = ['creator', 'administrator', 'member'].includes(status);

    if (joined) {
      const { error: rewardError } = await client
        .schema('rewardable_task')
        .rpc('reward_task', {
          rewarded_task_id: rewardedTaskId,
          game_profile_id: gameProfileId,
          points_to_increase: rewardPoints,
        });

      if (rewardError) {
        console.error(rewardError);
        return new Response('Failed to reward task', {
          headers: {'Content-Type': 'application/json'},
          status: 500,
        });
      }

      const { data: newTask, error: getTaskError } = await client
        .schema('rewardable_task')
        .from('rewarded_task')
        .select('*')
        .eq('id', rewardedTaskId)
        .single();

      if (getTaskError) {
        console.error(getTaskError);
        return new Response('Failed to get task', {
          headers: {'Content-Type': 'application/json'},
          status: 500,
        });
      }

      return new Response(JSON.stringify(convertToTask(newTask)), {
        headers: {'Content-Type': 'application/json'},
        status: 200,
      });
    } else {
      return new Response('Task not completed', {
        headers: {'Content-Type': 'application/json'},
        status: 412,
      });
    }
  } catch (e) {
    console.error(e);
    return new Response('Failed to check membership', {
      headers: {'Content-Type': 'application/json'},
      status: 500,
    });
  }
}

async function checkReferral(
  userId: string,
  numReferrals: number,
  rewardedTaskId: number,
  rewardPoints: number,
  gameProfileId: number,
  client: any,
) {
  const { count } = await client
    .schema('referrals')
    .from('referral')
    .select('*', { count: 'exact' })
    .eq('referrer_id', userId)
    .eq('referrer_rewarded', false);

  if (count >= numReferrals) {
    const { error: rewardError } = await client
      .schema('rewardable_task')
      .rpc('reward_task', {
        rewarded_task_id: rewardedTaskId,
        game_profile_id: gameProfileId,
        points_to_increase: rewardPoints,
      });

    if (rewardError) {
      console.error(rewardError);
      return new Response('Failed to reward task', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    const { data: newTask, error: getTaskError } = await client
      .schema('rewardable_task')
      .from('rewarded_task')
      .select('*')
      .eq('id', rewardedTaskId)
      .single();

    if (getTaskError) {
      console.error(getTaskError);
      return new Response('Failed to get task', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    return new Response(JSON.stringify(convertToTask(newTask)), {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    });
  } else {
    return new Response('Task not completed', {
      headers: {'Content-Type': 'application/json'},
      status: 412,
    });
  }
}

async function checkVisit(
  rewardedTask: any,
  rewardPoints: number,
  numWaitSeconds: number,
  gameProfileId: number,
  client: any,
) {
  // if task not started yet, start it
  if (!rewardedTask.task_started_at) {
    const { error } = await client
      .schema('rewardable_task')
      .from('rewarded_task')
      .update({ task_started_at: new Date() })
      .eq('id', rewardedTask.id)
      .select()
      .single();

    if (error) {
      console.error(error);
      return new Response('Failed to start task', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    const { data: newTask, error: getTaskError } = await client
      .schema('rewardable_task')
      .from('task')
      .select('*, rewarded_task (*)')
      .eq('id', rewardedTask.task_id)
      .eq('rewarded_task.id', rewardedTask.id)
      .single();

    if (getTaskError) {
      console.error(getTaskError);
      return new Response('Failed to get task', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    return new Response(JSON.stringify(convertToTask(newTask)), {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    });
  }

  const taskStartedAt = new Date(rewardedTask.task_started_at).getTime();
  const currentTime = Date.now();
  const timeDifference = (currentTime - taskStartedAt) / 1000;

  if (timeDifference >= numWaitSeconds) {
    const { error: rewardError } = await client
      .schema('rewardable_task')
      .rpc('reward_task', {
        rewarded_task_id: rewardedTask.id,
        game_profile_id: gameProfileId,
        points_to_increase: rewardPoints,
      });

    if (rewardError) {
      console.error(rewardError);
      return new Response('Failed to reward task', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    const { data: newTask, error: getTaskError } = await client
      .schema('rewardable_task')
      .from('task')
      .select('*, rewarded_task (*)')
      .eq('id', rewardedTask.task_id)
      .eq('rewarded_task.id', rewardedTask.id)
      .single();

    if (getTaskError) {
      console.error(getTaskError);
      return new Response('Failed to get task', {
        headers: {'Content-Type': 'application/json'},
        status: 500,
      });
    }

    return new Response(JSON.stringify(convertToTask(newTask)), {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    });
  } else {
    return new Response('Task not completed', {
      headers: {'Content-Type': 'application/json'},
      status: 412,
    });
  }
}
