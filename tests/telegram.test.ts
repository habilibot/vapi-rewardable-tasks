import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.192.0/testing/asserts.ts';

import {
  validateTelegramWebAppData,
  createTelegramWebAppData,
} from '../_utils/telegram.ts';

// Mock botToken for testing
const mockBotToken = 'TEST_BOT_TOKEN';

// Test data
const mockUser = {
  id: 'user-identifier',
  first_name: 'John',
  last_name: 'Doe',
  username: 'abctest1234',
  is_premium: true,
};

const mockTelegramData = {
  user: JSON.stringify(mockUser),
  auth_date: Math.floor(Date.now() / 1000).toString(),
};

Deno.test(
  'createTelegramWebAppData should generate valid telegramInitData',
  () => {
    const telegramInitData = createTelegramWebAppData(
      mockBotToken,
      mockTelegramData,
    );

    console.log('init data', telegramInitData);
    assert(
      telegramInitData.includes('hash='),
      'Generated data should include hash',
    );
    assert(
      telegramInitData.includes('auth_date='),
      'Generated data should include auth_date',
    );
    assert(
      telegramInitData.includes('user='),
      'Generated data should include user',
    );
  },
);

Deno.test(
  'validateTelegramWebAppData should validate correct telegramInitData',
  () => {
    // Generate valid telegramInitData
    const telegramInitData = createTelegramWebAppData(
      mockBotToken,
      mockTelegramData,
    );

    // Validate the generated data
    const result = validateTelegramWebAppData(telegramInitData, mockBotToken);

    assertEquals(
      result.message,
      'Validation successful',
      'Validation should succeed for valid data',
    );
    assert(result.validatedData, 'Validated data should not be null');
    assertEquals(
      result.user.id,
      mockUser.id,
      'User ID should match the original data',
    );
    assertEquals(result.user.username, mockUser.username);
    assertEquals(result.user.first_name, mockUser.first_name);
    assertEquals(result.user.last_name, mockUser.last_name);
    assertEquals(result.user.is_premium, mockUser.is_premium);
  },
);

Deno.test('validateTelegramWebAppData should fail with invalid hash', () => {
  // Generate valid telegramInitData
  const telegramInitData = createTelegramWebAppData(
    mockBotToken,
    mockTelegramData,
  );

  // Tamper with the hash
  const tamperedInitData = telegramInitData.replace(
    /hash=[^&]+/,
    'hash=invalidhash',
  );

  // Validate the tampered data
  const result = validateTelegramWebAppData(tamperedInitData, mockBotToken);

  assertEquals(
    result.message,
    'Hash validation failed',
    'Validation should fail for invalid hash',
  );
  assertEquals(
    result.validatedData,
    null,
    'Validated data should be null for invalid hash',
  );
});

Deno.test(
  'validateTelegramWebAppData should fail with expired auth_date',
  () => {
    // Set auth_date to an expired timestamp
    const expiredTelegramData = {
      ...mockTelegramData,
      auth_date: (Math.floor(Date.now() / 1000) - 4 * 60 * 60).toString(),
    };
    const telegramInitData = createTelegramWebAppData(
      mockBotToken,
      expiredTelegramData,
    );

    // Validate the expired data
    const result = validateTelegramWebAppData(telegramInitData, mockBotToken);

    assertEquals(
      result.message,
      'Telegram data is older than 3 hours',
      'Validation should fail for expired auth_date',
    );
    assertEquals(
      result.validatedData,
      null,
      'Validated data should be null for expired auth_date',
    );
  },
);
