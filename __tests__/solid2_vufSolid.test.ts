import { beforeEach, describe, expect, jest, test } from 'bun:test';
import { createRoot, flush } from 'solid-js';

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

import {
	anyCondition,
	field,
	isEmail,
	maxLength,
	required,
	VufForm,
} from '../src/solid2/mod.ts';

describe('VufForm (solid2/vufSolid.ts)', () => {
	function makeForm(emits: Record<string, any> = {}) {
		const model: any = {
			name: { value: '', name: '名前', validate: [required(), maxLength(50)] },
			email: { value: '', name: 'メール', validate: [required(), isEmail()] },
			age: { value: null, name: '年齢', validate: [required()], type: Number },
			description: { value: '', name: '説明', validate: [] },
		};
		return new VufForm(model, { emits });
	}

	beforeEach(() => {
		effects.clear();
	});

	describe('constructor', () => {
		test('初期化', () => {
			const form: any = makeForm();
			flush();
			expect(form).toBeInstanceOf(VufForm as any);
			flush();
			expect(form.name).toBe('');
			flush();
			expect(form.email).toBe('');
			flush();
			expect(typeof form.getKey()).toBe('number');
		});

		test('static gen が未実装の場合は例外', () => {
			class InvalidForm extends (VufForm as any) {}
			flush();
			expect(() => (InvalidForm as any).gen()).toThrow();
		});
	});

	describe('基本操作', () => {
		test('get/set と Field API', () => {
			const form: any = makeForm();
			form.name = 'Alice';
			flush();
			expect(form.getFieldValue('name')).toBe('Alice');
			form.setFieldValue('name', 'Bob');
			flush();
			expect(form.name).toBe('Bob');
			flush();
			expect(form.getFieldObject('name')).toBeDefined();
		});

		test('emit/addEmit/removeEmit', () => {
			const form: any = makeForm();
			const handler = jest.fn((v: any) => `ok:${v}`);
			form.addEmit('hello', handler);
			const ret = form.emit('hello', 1);
			flush();
			expect(handler).toHaveBeenCalledWith(1);
			flush();
			expect(ret).toBe('ok:1');

			const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
			form.removeEmit('hello');
			const ret2 = form.emit('hello', 2);
			flush();
			expect(ret2).toBeNull();
			flush();
			expect(logSpy).toHaveBeenCalled();
			logSpy.mockRestore();
		});
	});

	describe('JSON 取得', () => {
		test('getValueJson / getJson / getJsonHeadUpper', () => {
			const form: any = makeForm();
			form.name = 'John';
			form.email = 'john@example.com';
			form.age = 30;
			flush();
			const json = form.getValueJson({});
			flush();
			expect(json).toHaveProperty('name', 'John');
			flush();
			expect(json).toHaveProperty('email', 'john@example.com');
			flush();
			expect(json).toHaveProperty('age', 30);

			const json2 = form.getJson({});
			flush();
			expect(json2.name).toBe('John');

			const upper = form.getJsonHeadUpper({});
			flush();
			expect(upper).toHaveProperty('Name', 'John');
			flush();
			expect(upper).toHaveProperty('Email', 'john@example.com');
		});

		test('isIgnoreBlank / format / getValueJsonStr', () => {
			const form: any = makeForm();
			form.name = 'John';
			form.email = '';
			flush();
			const filtered = form.getValueJson({ isIgnoreBlank: true });
			flush();
			expect(filtered).toHaveProperty('name', 'John');
			flush();
			expect(filtered.email).toBeUndefined();

			const formatted = form.getValueJson({ format: (k: string) => `x_${k}` });
			flush();
			expect(formatted).toHaveProperty('x_name', 'John');
			flush();
			expect(formatted).not.toHaveProperty('name');

			const str = form.getValueJsonStr({});
			const obj = JSON.parse(str);
			flush();
			expect(obj.name).toBe('John');
		});

		test('Number 型: 文字列→数値', () => {
			const form: any = makeForm();
			form.age = '30';
			flush();
			const json = form.getValueJson({});
			flush();
			expect(json.age).toBe(30);
			flush();
			expect(typeof json.age).toBe('number');
		});

		test('formatValue: 配列値を処理', () => {
			const form: any = new (VufForm as any)({
				tags: { value: [], name: 'タグ', validate: [] },
			});
			form.setData({ tags: ['a', 'b'] });
			flush();
			const json = form.getValueJson({});
			flush();
			expect(Array.isArray(json.tags)).toBe(true);
			flush();
			expect(json.tags).toEqual(['a', 'b']);
		});
	});

	describe('バリデーション', () => {
		test('必須/Email 判定', () => {
			const form: any = makeForm();
			form.startValid();
			form.name = '';
			flush();
			expect(form.isErrorField('name')).toBe(true);
			form.name = 'John';
			flush();
			expect(form.isErrorField('name')).toBe(false);

			form.email = 'invalid';
			flush();
			expect(form.isErrorField('email')).toBe(true);
			form.email = 'user@example.com';
			flush();
			expect(form.isErrorField('email')).toBe(false);
		});

		test('anyCondition は emit を呼ぶ（値非空時）', () => {
			const emits = { custom: jest.fn(() => true) } as any;
			const form: any = new (VufForm as any)(
				{ x: { value: 'v', validate: [anyCondition('custom', 'msg')] } },
				{ emits },
			);
			form.startValid();
			flush();
			expect(form.isErrorField('x')).toBe(false);
			flush();
			expect(emits.custom).toHaveBeenCalledWith('v', 'msg');
		});

		test('groupIsValid', () => {
			const form: any = makeForm();
			form.startValid();
			form.name = '';
			flush();
			expect(form.groupIsValid(['name'])).toBe(false);
			form.name = 'ok';
			flush();
			expect(form.groupIsValid(['name'])).toBe(true);
		});
	});

	describe('validateWatch', () => {
		test('validateWatch(true): 初期はエラーなし → startValid 後に不正値でエラー → 正常値で解消', () => {
			createRoot(() => {
				const form: any = makeForm();
				form.validateWatch(true);

				// 初期はエラーなし
				const v0 = (form as any).getFieldObject('name').validator;
				flush();
				expect(v0?.error).toBe(false);

				// 不正値に変更 → startValid 明示 → エラーになる
				form.name = '';
				form.startValid();
				flush();
				expect(form.isErrorField('name')).toBe(true);

				// 正常値に戻す → エラー解消
				form.name = 'John';
				flush();
				expect(form.isErrorField('name')).toBe(false);
			});
		});
	});

	describe('setData（ネスト/配列/カスタム処理）', () => {
		test('ネストした VufForm を再帰的に生成', () => {
			class Child extends (VufForm as any) {
				static gen() {
					return new (Child as any)({
						first: { value: '', name: 'first', validate: [required()] },
					});
				}
			}
			const form: any = new (VufForm as any)({
				child: { value: null, name: '子', validate: [], type: Child },
			});
			form.setData({ child: { first: 'Taro' } });
			flush();
			expect(form.getJson().child.first).toBe('Taro');
		});

		test('VufForm 配列を再帰的に生成', () => {
			class Item extends (VufForm as any) {
				static gen() {
					return new (Item as any)({
						name: { value: '', name: 'n', validate: [] },
					});
				}
			}
			const form: any = new (VufForm as any)({
				items: {
					value: [],
					name: 'items',
					validate: [],
					type: Array,
					subType: Item,
				},
			});
			form.setData({ items: [{ name: 'i1' }, { name: 'i2' }] });
			flush();
			const json = form.getJson({});
			flush();
			expect(json.items[0].name).toBe('i1');
			flush();
			expect(json.items[1].name).toBe('i2');
		});

		test('keyAndFunc でカスタム処理', () => {
			const form: any = makeForm();
			const fn = jest.fn((v: any) =>
				(form.getFieldObject('name') as any).value[1](`Custom:${v}`),
			);
			form.setData({ name: 'John' }, { name: fn });
			flush();
			expect(fn).toHaveBeenCalledWith('John');
			flush();
			expect(form.name).toBe('Custom:John');
		});
	});

	describe('field ヘルパ', () => {
		test('Field 構築', () => {
			const obj: any = field({ value: 'x', name: 'X', validate: [] } as any);
			flush();
			expect(obj.value).toBe('x');
			flush();
			expect(obj.name).toBe('X');
		});
	});
});

describe('formatValue Number 分岐の Vue 整合 (solid2/mod.ts)', () => {
	test('数値化できない値は null になる（NaN を漏らさない）', () => {
		const form: any = new (VufForm as any)({
			age: { value: null, name: '年齢', validate: [], type: Number },
		});
		form.age = 'abc';
		flush();
		const json = form.getValueJson({ isIgnoreBlank: false });
		flush();
		expect(json.age).toBeNull();
	});
});

describe('validateWatch のネスト伝播 (solid2/mod.ts)', () => {
	class Child extends (VufForm as any) {
		static gen() {
			return new (Child as any)({
				name: { value: '', name: 'Name', validate: [required()] },
			});
		}
	}

	// test:solid2はbrowser条件で実行し、Solid 2の実reactivityとstaged writeを
	// flush境界込みで検証する。

	test('startValid が単一サブフォームへ再帰伝播し、伝播後は nested 検証が効く', () => {
		createRoot(() => {
			const form: any = new (VufForm as any)({
				child: { value: null, name: 'Child', validate: [], type: Child },
			});
			form.setData({ child: { name: 'Taro' } });
			flush();
			form.validateWatch();
			const child: any = form.getFieldValue('child');

			form.startValid();
			flush();
			expect(child.$startValid[0]()).toBe(true); // 検証開始が伝播

			child.name = '';
			flush();
			expect(child.isErrorField('name')).toBe(true);
			child.name = 'Jiro';
			flush();
			expect(child.isErrorField('name')).toBe(false);
		});
	});

	test('startValid がサブフォーム配列の各要素へ再帰伝播する', () => {
		createRoot(() => {
			const form: any = new (VufForm as any)({
				items: {
					value: [],
					name: 'Items',
					validate: [],
					type: Array,
					subType: Child,
				},
			});
			form.setData({ items: [{ name: 'a' }, { name: 'b' }] });
			flush();
			form.validateWatch();
			form.startValid();

			const items: any[] = form.getFieldValue('items');
			flush();
			expect(items[0].$startValid[0]()).toBe(true);
			flush();
			expect(items[1].$startValid[0]()).toBe(true);

			items[0].name = '';
			flush();
			expect(items[0].isErrorField('name')).toBe(true);
			items[0].name = 'ok';
			flush();
			expect(items[0].isErrorField('name')).toBe(false);
		});
	});
});
