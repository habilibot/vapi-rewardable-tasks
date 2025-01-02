import { createClient } from 'jsr:@supabase/supabase-js@2';
import { convertToTask } from '../_dto/task.ts';

export default async (req: Request) => {
  const headers = req.headers;
  const authorization = headers.get('Authorization');
  if (!authorization) {
    return new Response('Authorization header required', {
      headers: {'Content-Type': 'application/json'},
      status: 401,
    });
  }

  // setup shaple client
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
    console.error('User not found in getGameContext');
    return new Response('Invalid auth user', {
      headers: {'Content-Type': 'application/json'},
      status: 401,
    });
  }

  const { data: tasks, getTasksError } = await client
    .schema('rewardable_task')
    .from('task')
    .select(`*, rewarded_task (*)`)
    .eq('rewarded_task.owner', user.id);

  if (getTasksError) {
    console.error(getTasksError);
    return new Response(JSON.stringify({ error: getTasksError.message }), {
      headers: {'Content-Type': 'application/json'},
      status: 500,
    });
  }

  return new Response(
    JSON.stringify(tasks?.map((task: any) => convertToTask(task)) ?? []),
    {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    },
  );
};
