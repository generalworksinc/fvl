import { describe, expect, test } from 'bun:test';

describe('messages subpath import', () => {
	test('ja can be imported via subpath and has required keys', async () => {
		const ja = (await import('../src/core/messages/ja.ts')).default;
		expect(ja.required).toBeDefined();
		expect(typeof ja.required).toBe('string');
	});

	test('en can be imported via subpath and has required keys', async () => {
		const en = (await import('../src/core/messages/en.ts')).default;
		expect(en.required).toBeDefined();
		expect(typeof en.required).toBe('string');
	});
});
