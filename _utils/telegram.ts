// utils/server-checks.ts

const { createHmac } = await import('node:crypto');

interface ValidatedData {
  [key: string]: string;
}

interface User {
  id?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_premium?: boolean;
  language_code?: string;
}

interface ValidationResult {
  validatedData: ValidatedData | null;
  user: User;
  message: string;
}

export function validateTelegramWebAppData(
  telegramInitData: string,
  botToken: string,
  expireInSeconds?: number,
): ValidationResult {
  let validatedData: ValidatedData | null = null;
  let user: User = {};
  let message = '';

  if (!botToken) {
    return { message: 'botToken is not set', validatedData: null, user: {} };
  }

  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get('hash');

  if (!hash) {
    return {
      message: 'Hash is missing from initData',
      validatedData: null,
      user: {},
    };
  }

  initData.delete('hash');

  // Check if auth_date is present and not older than 3 hours
  const authDate = initData.get('auth_date');
  if (!authDate) {
    return {
      message: 'auth_date is missing from initData',
      validatedData: null,
      user: {},
    };
  }

  const authTimestamp = parseInt(authDate, 10);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeDifference = currentTimestamp - authTimestamp;
  const threshold = expireInSeconds ?? 3 * 60 * 60;

  if (threshold > 0 && timeDifference > threshold) {
    return {
      message: 'Telegram data is older than 3 hours',
      validatedData: null,
      user: {},
    };
  }

  const dataCheckString = Array.from(initData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const calculatedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // console.log('Calculated Hash:', calculatedHash);
  // console.log('Received Hash:', hash);

  if (calculatedHash === hash) {
    validatedData = Object.fromEntries(initData.entries());
    message = 'Validation successful';
    const userString = validatedData['user'];
    if (userString) {
      try {
        user = JSON.parse(userString);
      } catch (error) {
        console.error('Error parsing user data:', error);
        message = 'Error parsing user data';
        validatedData = null;
      }
    } else {
      message = 'User data is missing';
      validatedData = null;
    }
  } else {
    message = 'Hash validation failed';
  }

  return { validatedData, user, message };
}

export function createTelegramWebAppData(
  botToken: string,
  data: Record<string, string>,
): string {
  if (!botToken) {
    throw new Error('botToken is required');
  }

  // Ensure `auth_date` is included and is a valid timestamp
  if (!data.auth_date) {
    data.auth_date = Math.floor(Date.now() / 1000).toString();
  }

  // Generate the data check string
  const dataCheckString = Object.entries(data)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Calculate the secret key
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // Calculate the hash
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Add the hash to the data
  const initData = new URLSearchParams(data);
  initData.set('hash', hash);

  return initData.toString();
}
