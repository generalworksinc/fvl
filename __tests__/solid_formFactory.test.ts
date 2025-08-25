import { beforeEach, describe, expect, test } from 'bun:test';
import { createRoot } from 'solid-js';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	interface Global {
		createEffect?: any;
		createSignal?: any;
	}
}

// SolidJS の最低限モック
const effects = new Set<Function>();
(global as any).createEffect = (fn: Function) => {
	effects.add(fn);
	fn();
};
(global as any).createSignal = (initial: any) => {
	let v = initial;
	const get = () => v;
	const set = (nv: any) => {
		v = nv;
		effects.forEach((e) => e());
		return nv;
	};
	return [get, set] as const;
};

import { createForm } from '../src/solid/formFactory.ts';
import { required } from '../src/solid/mod.ts';

describe('createForm (solidjs/formFactory.ts)', () => {
	beforeEach(() => {
		effects.clear();
	});

	test('親メソッドを使って validate を実装し、拡張メソッドとして利用できる', () => {
		createRoot(() => {
			const factory = createForm(
				{
					name: { value: '', name: 'Name', validate: [required()] },
					email: { value: '', name: 'Email', validate: [] },
				},
				(parent: any) => ({
					validateAll() {
						return parent.groupIsValid();
					},
					upperName() {
						parent.setFieldValue(
							'name',
							String(parent.getFieldValue('name')).toUpperCase(),
						);
					},
				}),
			);

			const form: any = factory();
			expect(typeof form.validateAll).toBe('function');
			form.upperName();
			expect(form.name).toBe(''); // 空のため変化なし
			form.setFieldValue('name', 'john');
			form.upperName();
			expect(form.name).toBe('JOHN');

			form.startValid();
			form.setFieldValue('name', '');
			expect(form.validateAll()).toBe(false);
			form.setFieldValue('name', 'OK');
			expect(form.validateAll()).toBe(true);
		});
	});

	test('parent.validate ラッパーの実行（createParentMethods 内の関数カバレッジ）', () => {
		createRoot(() => {
			const factory = createForm(
				{
					name: { value: 'OK', name: 'Name', validate: [required()] },
				},
				(parent: any) => ({
					run() {
						return parent.validate();
					},
				}),
			);

			const form: any = factory();
			form.startValid();
			expect(form.run()).toBe(true);
		});
	});
});
