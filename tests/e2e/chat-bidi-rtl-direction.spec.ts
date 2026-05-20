import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

const SESSION_KEY = 'agent:main:main';
const ARABIC_USER_TEXT = 'مرحبا، ممكن تساعدني؟';
const ARABIC_ASSISTANT_TEXT = 'أكيد، أنا هنا للمساعدة في أي وقت.';
const ENGLISH_ASSISTANT_TEXT = 'Sure, happy to help with anything.';

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(',')}}`;
}

const seededHistory = [
  {
    role: 'user',
    content: [{ type: 'text', text: ARABIC_USER_TEXT }],
    timestamp: Date.now(),
  },
  {
    role: 'assistant',
    content: [{ type: 'text', text: ARABIC_ASSISTANT_TEXT }],
    timestamp: Date.now(),
  },
  {
    role: 'assistant',
    content: [{ type: 'text', text: ENGLISH_ASSISTANT_TEXT }],
    timestamp: Date.now(),
  },
];

test.describe('ClawX chat BiDi (RTL/LTR auto-detection)', () => {
  test('user and assistant message containers expose dir="auto" and pick direction by content', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345 },
        gatewayRpc: {
          [stableStringify(['sessions.list', {}])]: {
            success: true,
            result: {
              sessions: [{ key: SESSION_KEY, displayName: 'main' }],
            },
          },
          [stableStringify(['chat.history', { sessionKey: SESSION_KEY, limit: 200 }])]: {
            success: true,
            result: { messages: seededHistory },
          },
          [stableStringify(['chat.history', { sessionKey: SESSION_KEY, limit: 1000 }])]: {
            success: true,
            result: { messages: seededHistory },
          },
        },
        hostApi: {
          [stableStringify(['/api/gateway/status', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: { state: 'running', port: 18789, pid: 12345 },
            },
          },
          [stableStringify(['/api/agents', 'GET'])]: {
            ok: true,
            data: {
              status: 200,
              ok: true,
              json: {
                success: true,
                agents: [{ id: 'main', name: 'main' }],
              },
            },
          },
        },
      });

      const page = await getStableWindow(app);
      try {
        await page.reload();
      } catch (error) {
        if (!String(error).includes('ERR_FILE_NOT_FOUND')) {
          throw error;
        }
      }

      await expect(page.getByTestId('main-layout')).toBeVisible();

      const userBubbleText = page
        .locator('div.rounded-2xl.bg-brand')
        .filter({ hasText: ARABIC_USER_TEXT })
        .locator('p')
        .first();
      await expect(userBubbleText).toBeVisible({ timeout: 30_000 });
      await expect(userBubbleText).toHaveAttribute('dir', 'auto');
      const userDirection = await userBubbleText.evaluate((el) => window.getComputedStyle(el).direction);
      expect(userDirection).toBe('rtl');

      const arabicProse = page
        .locator('.prose')
        .filter({ hasText: ARABIC_ASSISTANT_TEXT })
        .first();
      await expect(arabicProse).toBeVisible({ timeout: 30_000 });
      await expect(arabicProse).toHaveAttribute('dir', 'auto');
      const arabicProseDirection = await arabicProse.evaluate((el) => window.getComputedStyle(el).direction);
      expect(arabicProseDirection).toBe('rtl');

      const englishProse = page
        .locator('.prose')
        .filter({ hasText: ENGLISH_ASSISTANT_TEXT })
        .first();
      await expect(englishProse).toBeVisible({ timeout: 30_000 });
      await expect(englishProse).toHaveAttribute('dir', 'auto');
      const englishProseDirection = await englishProse.evaluate((el) => window.getComputedStyle(el).direction);
      expect(englishProseDirection).toBe('ltr');

      const composer = page.getByTestId('chat-composer-input');
      await expect(composer).toBeVisible({ timeout: 30_000 });
      await expect(composer).toHaveAttribute('dir', 'auto');
    } finally {
      await closeElectronApp(app);
    }
  });
});
