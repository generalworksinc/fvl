/**
 * アダプタ共通コントラクトテスト（vue / solid 振る舞い一致の担保）
 *
 * 目的:
 * - core 抽出リファクタ（vue/solid の重複ロジックを core へ集約）の「安全網」。
 * - 抽出対象＝反応性に依存しない純粋ロジック（getValueJson / extractData / formatValue /
 *   setData / isErrorField / groupIsValid / メッセージ補間 / キー整形 など）。
 * - 同一のフォーム定義・操作を **両アダプタに対して実行**し、結果が一致することを保証する。
 *
 * 注意:
 * - 反応性（validateWatch の effect 発火）はアダプタ固有かつ SSR 解決の solid では走らないため、
 *   ここでは検証しない（それは vue_formFactory / solid_vufSolid の各テストで担保）。
 * - 両アダプタで API 表面が異なる点は避ける:
 *     - getFieldObject().value は raw（vue） vs Signal[get,set]（solid）なので触らない。
 *     - $startValid は boolean（vue） vs Signal（solid）なので触らない。
 *   代わりに getFieldValue()・validator.{error,message}・各 JSON 出力（共通）で検証する。
 */
import { beforeEach, describe, expect, jest, test } from 'bun:test';
import { setLocale } from '../src/core/mod.ts';
import * as solid from '../src/solid/mod.ts';
import * as vue from '../src/vue/mod.ts';

// メッセージ検証はロケール依存。core_mod.test.ts などが setLocale('en') 等で
// グローバルな currentLocale を書き換えたまま残すため、実行順に依存しないよう
// 各テスト前に既定の 'ja' へ固定する（安全網を順序非依存にする）。
beforeEach(() => {
	setLocale('ja');
});

const adapters: Array<[string, any]> = [
	['vue', vue],
	['solid', solid],
];

for (const [label, mod] of adapters) {
	const { VufForm, field, required, maxLength, isEmail, sameAs, anyCondition } =
		mod;

	describe(`adapter contract: ${label}`, () => {
		const makeForm = (emits?: any) =>
			new VufForm(
				{
					name: field({
						value: '',
						name: '名前',
						validate: [required(), maxLength(50)],
					}),
					email: field({
						value: '',
						name: 'メール',
						validate: [required(), isEmail()],
					}),
					age: field({ value: null, name: '年齢', validate: [], type: Number }),
					memo: field({ value: '', name: 'メモ', validate: [] }),
				},
				emits ? { emits } : undefined,
			);

		// ネスト用サブフォーム（各アダプタの VufForm を継承）
		class Child extends (VufForm as any) {
			static gen() {
				return new (Child as any)({
					label: field({ value: '', name: 'ラベル', validate: [required()] }),
				});
			}
		}

		test('プロパティ get/set と getFieldValue / setFieldValue', () => {
			const f: any = makeForm();
			f.name = 'Alice';
			expect(f.name).toBe('Alice');
			expect(f.getFieldValue('name')).toBe('Alice');
			f.setFieldValue('name', 'Bob');
			expect(f.name).toBe('Bob');
			expect(f.getFieldObject('name').name).toBe('名前');
		});

		test('getKey は安全な整数で、フォーム内で安定し、フォーム間で一意', () => {
			const forms: any[] = Array.from({ length: 1_000 }, () => makeForm());
			const keys = forms.map((form) => form.getKey());

			expect(keys.every(Number.isSafeInteger)).toBe(true);
			expect(new Set(keys).size).toBe(keys.length);
			expect(forms[0].getKey()).toBe(keys[0]);
		});

		test('getValueJson: isIgnoreBlank（空文字の除外/保持）', () => {
			const f: any = makeForm();
			f.name = 'John';
			f.email = '';
			expect(f.getValueJson({ isIgnoreBlank: true })).toEqual({ name: 'John' });
			const withBlank = f.getValueJson({ isIgnoreBlank: false });
			expect(withBlank.name).toBe('John');
			expect(withBlank.email).toBe('');
		});

		test('getValueJson: keys / exceptKeys / format', () => {
			const f: any = makeForm();
			f.name = 'John';
			f.memo = 'm';
			expect(f.getValueJson({ keys: ['name'] })).toEqual({ name: 'John' });
			expect(f.getValueJson({ exceptKeys: ['memo'] })).not.toHaveProperty(
				'memo',
			);
			expect(
				f.getValueJson({
					keys: ['name'],
					format: (k: string) => k.toUpperCase(),
				}),
			).toEqual({ NAME: 'John' });
		});

		test('getJsonHeadUpper（先頭大文字化）', () => {
			const f: any = makeForm();
			f.name = 'John';
			expect(f.getJsonHeadUpper({ keys: ['name'] })).toEqual({ Name: 'John' });
		});

		test('getValueJsonStr', () => {
			const f: any = makeForm();
			f.name = 'S';
			expect(JSON.parse(f.getValueJsonStr({ keys: ['name'] })).name).toBe('S');
		});

		test('formatValue: Number 型は数値化、不正値は null（NaN を漏らさない）', () => {
			const f: any = makeForm();
			f.age = '30';
			expect(f.getValueJson({ keys: ['age'] }).age).toBe(30);
			f.age = 'abc';
			expect(
				f.getValueJson({ keys: ['age'], isIgnoreBlank: false }).age,
			).toBeNull();
		});

		test('formatValue: 配列はそのまま保持', () => {
			const f: any = new VufForm({
				tags: field({ value: [], name: 'タグ', validate: [] }),
			});
			f.setData({ tags: ['a', 'b'] });
			expect(f.getJson().tags).toEqual(['a', 'b']);
		});

		test('setData: 頭小文字キー整形（Name → name）', () => {
			const f: any = makeForm();
			f.setData({ Name: 'Cap' });
			expect(f.name).toBe('Cap');
		});

		test('setData: keyAndFunc カスタム代入', () => {
			const f: any = makeForm();
			const fn = jest.fn((v: any) => {
				f.name = `X:${v}`;
			});
			f.setData({ name: 'v' }, { name: fn });
			expect(fn).toHaveBeenCalledWith('v');
			expect(f.name).toBe('X:v');
		});

		test('setData: ネスト VufForm と配列を再帰生成', () => {
			const f: any = new VufForm({
				child: field({ value: null, name: '子', validate: [], type: Child }),
				items: field({
					value: [],
					name: '配列',
					validate: [],
					type: Array,
					subType: Child,
				}),
			});
			f.setData({
				child: { label: 'c' },
				items: [{ label: 'i1' }, { label: 'i2' }],
			});
			const json = f.getJson();
			expect(json.child.label).toBe('c');
			expect(json.items.map((x: any) => x.label)).toEqual(['i1', 'i2']);
		});

		test('isErrorField: required / maxLength(メッセージ補間) / isEmail', () => {
			const f: any = makeForm();
			f.startValid();
			f.name = '';
			expect(f.isErrorField('name')).toBe(true);
			expect(f.getFieldObject('name').validator.message).toBe(
				'※必須入力項目です。',
			);
			f.name = 'x'.repeat(51);
			expect(f.isErrorField('name')).toBe(true);
			expect(f.getFieldObject('name').validator.message).toBe(
				'※50文字以下で入力してください。',
			);
			f.name = 'ok';
			expect(f.isErrorField('name')).toBe(false);
			expect(f.getFieldObject('name').validator.message).toBe('');

			f.email = 'invalid';
			expect(f.isErrorField('email')).toBe(true);
			f.email = 'a@b.co';
			expect(f.isErrorField('email')).toBe(false);
		});

		test('sameAs: 同一フォーム内フィールド比較', () => {
			const f: any = new VufForm({
				a: field({ value: '', name: 'a', validate: [] }),
				b: field({ value: '', name: 'b', validate: [sameAs('a')] }),
			});
			f.startValid();
			f.a = 'x';
			f.b = 'y';
			expect(f.isErrorField('b')).toBe(true);
			f.b = 'x';
			expect(f.isErrorField('b')).toBe(false);
		});

		test('メッセージの {param} はフィールドの表示名に補間される（ルール名ではない）', () => {
			// ja の sameAs 既定文言は「※{param}が間違っているようです。」。
			// {param} はルール名 'sameAs' ではなくフィールドの表示名(name)に置換されるべき。
			const f: any = new VufForm({
				email: field({ value: '', name: 'メール', validate: [] }),
				email2: field({
					value: '',
					name: 'メールアドレス（確認用）',
					validate: [sameAs('email')],
				}),
			});
			f.startValid();
			f.email = 'a@b.co';
			f.email2 = 'x@y.co';
			expect(f.isErrorField('email2')).toBe(true);
			const msg = f.getFieldObject('email2').validator.message;
			expect(msg).toBe('※メールアドレス（確認用）が間違っているようです。');
			expect(msg).not.toContain('sameAs');
		});

		test('anyCondition: emit を呼び、カスタムメッセージを表示', () => {
			const custom = jest.fn((v: any) => v === 'OK');
			const f: any = new VufForm(
				{
					x: field({
						value: 'v',
						name: 'x',
						validate: [anyCondition('custom', 'NGだよ')],
					}),
				},
				{ emits: { custom } },
			);
			f.startValid();
			expect(f.isErrorField('x')).toBe(true);
			expect(f.getFieldObject('x').validator.message).toBe('NGだよ');
			expect(custom).toHaveBeenCalledWith('v', 'NGだよ');
			f.x = 'OK';
			expect(f.isErrorField('x')).toBe(false);
		});

		test('anyCondition: 空値でも検証をスキップせずハンドラで判定する', () => {
			// 旧 vuf 互換。空パスワードでも「8文字以上」チェックが走り、ハンドラが false → エラーになる。
			const min8 = jest.fn((v: any) => String(v ?? '').length >= 8);
			const f: any = new VufForm(
				{
					pw: field({
						value: '',
						name: 'パスワード',
						validate: [
							anyCondition('min8', 'パスワードは8文字以上で入力してください。'),
						],
					}),
				},
				{ emits: { min8 } },
			);
			f.startValid();
			// 空 → スキップされず、ハンドラが false → エラー
			expect(f.isErrorField('pw')).toBe(true);
			expect(f.getFieldObject('pw').validator.message).toBe(
				'パスワードは8文字以上で入力してください。',
			);
			// 8 文字以上 → OK
			f.pw = '12345678';
			expect(f.isErrorField('pw')).toBe(false);
		});

		test('groupIsValid: フラット', () => {
			const f: any = makeForm();
			f.name = '';
			f.email = 'a@b.co';
			expect(f.groupIsValid(['name'])).toBe(false);
			f.name = 'ok';
			expect(f.groupIsValid(['name', 'email'])).toBe(true);
		});

		test('groupIsValid: ネスト parent.child（startValid の再帰伝播込み）', () => {
			const f: any = new VufForm({
				child: field({ value: null, name: '子', validate: [], type: Child }),
			});
			f.setData({ child: { label: '' } });
			expect(f.groupIsValid(['child.label'])).toBe(false);
			f.getFieldValue('child').label = 'ok';
			expect(f.groupIsValid(['child.label'])).toBe(true);
		});

		test('emit / addEmit / removeEmit', () => {
			const f: any = makeForm();
			const h = jest.fn((v: any) => `r:${v}`);
			f.addEmit('e', h);
			expect(f.emit('e', 1)).toBe('r:1');
			f.removeEmit('e');
			expect(f.emit('e', 1)).toBeNull();
		});
	});
}
