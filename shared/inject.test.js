import { describe, it, expect } from 'vitest';
import { buildInjectionText } from './inject.js';

describe('Template Injection', () => {
  const capsule = {
    title: 'Test Capsule',
    source: 'claude',
    capturedAt: 1700000000000,
    content: {
      summary: 'This is a test summary.',
      goals: ['goal1', 'goal2'],
      stack: ['react'],
      rawTurns: [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'hello' },
      ],
    },
  };

  it('formats standard placeholders correctly', () => {
    const template = 'Title: {title} | Summary: {summary} | Goals: {goals} | Stack: {stack}';
    const text = buildInjectionText(capsule, template);
    expect(text).toBe(
      'Title: Test Capsule | Summary: This is a test summary. | Goals: goal1, goal2 | Stack: react',
    );
  });

  it('formats custom placeholders {date}, {platform}, {turns} correctly', () => {
    const template = 'Date: {date} | Platform: {platform} | Turns: {turns}';
    const text = buildInjectionText(capsule, template);
    expect(text).toContain('Platform: CLAUDE');
    expect(text).toContain('Turns: 2');
    expect(text).toContain('Date:');
  });
});
