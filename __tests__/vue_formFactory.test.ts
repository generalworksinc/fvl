import { describe, expect, test } from 'bun:test';

import { anyCondition, createForm2, field, required } from '../src/vue/mod.ts';

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
						parent.setFieldValue(
							'title',
							String(parent.getFieldValue('title')).toUpperCase(),
						);
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
						void parent.getFieldValue('tax');
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
