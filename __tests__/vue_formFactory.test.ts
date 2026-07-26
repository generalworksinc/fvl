import { describe, expect, test } from 'bun:test';
import { nextTick } from 'vue';

import {
	anyCondition,
	createForm2,
	field,
	required,
	sameAs,
} from '../src/vue/mod.ts';

describe('validateWatch のネスト伝播 (vue/mod.ts)', () => {
	const ChildFactory = createForm2(
		{ name: field({ value: '', name: 'Name', validate: [required()] }) },
		{ methods: () => ({}) },
	);

	test('親の validateWatch がネストした単一サブフォームにも再帰的に張られる', async () => {
		const ParentFactory = createForm2(
			{
				child: field({
					value: null as any,
					name: 'Child',
					validate: [],
					type: ChildFactory as any,
				}),
			},
			{ methods: () => ({}) },
		);
		const parent: any = ParentFactory();
		parent.setData({ child: { name: 'Taro' } });
		parent.validateWatch();

		const child: any = parent.getFieldValue('child');
		// 送信相当: 親 startValid → 子にも検証開始が伝播する
		parent.startValid();
		expect(child.$startValid).toBe(true);

		// 子フィールドを不正値へ → リアルタイムで子 validator にエラーが反映される
		child.name = '';
		await nextTick();
		expect(child.getFieldObject('name').validator.error).toBe(true);

		// 正常値へ → エラー解消
		child.name = 'Jiro';
		await nextTick();
		expect(child.getFieldObject('name').validator.error).toBe(false);
	});

	test('サブフォーム配列（動的追加を含む）にも watch と startValid が伝播する', async () => {
		const ParentFactory = createForm2(
			{
				items: field({
					value: [] as any,
					name: 'Items',
					validate: [],
					type: Array,
					subType: ChildFactory as any,
				}),
			},
			{ methods: () => ({}) },
		);
		const parent: any = ParentFactory();
		parent.setData({ items: [{ name: 'a' }] });
		parent.validateWatch();
		parent.startValid();

		const first: any = parent.getFieldValue('items')[0];
		expect(first.$startValid).toBe(true);
		first.name = '';
		await nextTick();
		expect(first.getFieldObject('name').validator.error).toBe(true);

		// 動的追加: 新しい配列参照を代入すると nested watch が発火し、
		// 追加要素にも watch と（親が検証開始済みなので）startValid が伝播する。
		const added: any = ChildFactory();
		parent.setFieldValue('items', [...parent.getFieldValue('items'), added]);
		await nextTick();

		const secondRef: any = parent.getFieldValue('items')[1];
		expect(secondRef.$startValid).toBe(true);
		// 追加直後は name='' だが、watch は値が実際に変化したときのみ発火するため、
		// 一度有効値に変えてからクリアして、リアルタイム検証が効くことを確認する。
		secondRef.name = 'ok';
		await nextTick();
		expect(secondRef.getFieldObject('name').validator.error).toBe(false);
		secondRef.name = '';
		await nextTick();
		expect(secondRef.getFieldObject('name').validator.error).toBe(true);
	});
});

describe('createForm2 (vue/mod.ts)', () => {
	test('親メソッドを使って validate を実装し、拡張メソッドとして利用できる', () => {
		const factory = createForm2(
			{
				title: field({ value: '', name: 'Title', validate: [required()] }),
			},
			{
				methods: (parent: any) => ({
					validateAll() {
						return parent.groupIsValid();
					},
					upperTitle() {
						parent.title = String(parent.title).toUpperCase();
					},
				}),
			},
		);

		const form: any = factory();
		form.startValid();
		form.setFieldValue('title', '');
		expect(form.validateAll()).toBe(false);
		form.setFieldValue('title', 'ok');
		form.upperTitle();
		expect(form.title).toBe('OK');
		expect(form.validateAll()).toBe(true);
	});

	test('emits を定義時に登録し、anyCondition から参照できる', () => {
		const factory = createForm2(
			{
				tax: field({
					value: '',
					name: 'Tax',
					validate: [anyCondition('taxNumCheck', 'NG')],
				}),
			},
			{
				emits: (parent: any) => ({
					taxNumCheck(value: any) {
						void parent.tax;
						return String(value) === 'OK';
					},
				}),
			},
		);

		const form: any = factory();
		form.startValid();
		form.setFieldValue('tax', 'NG');
		expect(form.groupIsValid(['tax'])).toBe(false);
		form.setFieldValue('tax', 'OK');
		expect(form.groupIsValid(['tax'])).toBe(true);
	});

	test('sameAs で同一フォーム内の別フィールドと比較できる', () => {
		const factory = createForm2(
			{
				email: field({ value: '', name: 'Email', validate: [required()] }),
				email2: field({
					value: '',
					name: 'Email Confirm',
					validate: [required(), sameAs('email')],
				}),
			},
			{
				methods: (parent: any) => ({
					validateConfirm() {
						return parent.groupIsValid(['email', 'email2']);
					},
				}),
			},
		);

		const form: any = factory();
		form.startValid();
		form.email = 'test@example.com';
		form.email2 = 'other@example.com';
		expect(form.validateConfirm()).toBe(false);
		form.email2 = 'test@example.com';
		expect(form.validateConfirm()).toBe(true);
	});

	test('factory.gen で生成でき、setData のネスト生成で factory を type に渡せる', () => {
		const ChildFormFactory = createForm2(
			{
				name: field({ value: '', name: 'Name', validate: [required()] }),
			},
			{
				methods: (parent: any) => ({
					validateAll() {
						return parent.groupIsValid();
					},
				}),
			},
		);

		const childFromGen: any = ChildFormFactory.gen();
		expect(typeof childFromGen.validateAll).toBe('function');

		const ParentFormFactory = createForm2(
			{
				child: field({
					value: null as any,
					name: 'Child',
					validate: [],
					type: ChildFormFactory as any,
				}),
			},
			{
				methods: () => ({}),
			},
		);

		const parent: any = ParentFormFactory();
		parent.setData({ child: { name: 'OK' } });

		const nested: any = parent.getFieldValue('child');
		expect(nested).toBeTruthy();
		expect(typeof nested.validateAll).toBe('function');
		expect(nested.name).toBe('OK');
		nested.startValid();
		expect(nested.validateAll()).toBe(true);
	});
});
