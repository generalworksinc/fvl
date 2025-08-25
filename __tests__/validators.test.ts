import { beforeEach, describe, expect, jest, test } from 'bun:test';
import type { IVufForm } from '../src/core/types.ts';
// import validators from '../validators.js';
import validators from '../src/core/validators.ts';

describe('validators', () => {
	// モックフォームオブジェクト（IVufForm 満たす）
	const mockForm: IVufForm & { emit: ReturnType<typeof jest.fn> } = {
		emit: jest.fn().mockReturnValue(true),
		getJson: () => ({}),
		isErrorField: () => false,
	} as any;

	beforeEach(() => {
		// 各テスト前にモックをリセット
		(mockForm.emit as any).mockClear();
	});

	describe('required', () => {
		test('空文字列の場合はfalseを返す', () => {
			expect(validators.required('', mockForm)).toBe(false);
		});

		test('文字列が入力されている場合はtrueを返す', () => {
			expect(validators.required('test', mockForm)).toBe(true);
		});

		test('nullの場合はfalseを返す', () => {
			expect(validators.required(null, mockForm)).toBe(false);
		});

		test('undefinedの場合はfalseを返す', () => {
			expect(validators.required(undefined, mockForm)).toBe(false);
		});
	});

	describe('maxLength', () => {
		test('指定された長さ以下の文字列の場合はtrueを返す', () => {
			expect(validators.maxLength('test', mockForm, 5)).toBe(true);
		});

		test('指定された長さと同じ文字列の場合はtrueを返す', () => {
			expect(validators.maxLength('test', mockForm, 4)).toBe(true);
		});

		test('指定された長さを超える文字列の場合はfalseを返す', () => {
			expect(validators.maxLength('test', mockForm, 3)).toBe(false);
		});
	});

	describe('length', () => {
		test('指定された長さと一致する文字列の場合はtrueを返す', () => {
			expect(validators.length('test', mockForm, 4)).toBe(true);
		});

		test('指定された長さと一致しない文字列の場合はfalseを返す', () => {
			expect(validators.length('test', mockForm, 3)).toBe(false);
		});
	});

	describe('anyCondition', () => {
		test('値がnullの場合はtrueを返す', () => {
			expect(validators.anyCondition(null, mockForm, 'checkFunc')).toBe(true);
		});

		test('値が空文字の場合はtrueを返す', () => {
			expect(validators.anyCondition('', mockForm, 'checkFunc')).toBe(true);
		});

		test('emitを呼び出し、その結果を返す', () => {
			(mockForm.emit as any).mockReturnValueOnce(true);
			expect(validators.anyCondition('test', mockForm, 'checkFunc')).toBe(true);
			expect(mockForm.emit).toHaveBeenCalledWith(
				'checkFunc',
				'test',
				undefined,
			);

			(mockForm.emit as any).mockReturnValueOnce(false);
			expect(validators.anyCondition('test', mockForm, 'checkFunc')).toBe(
				false,
			);
		});
	});

	describe('integer', () => {
		test('整数の場合はtrueを返す', () => {
			expect(validators.integer(42, mockForm)).toBe(true);
			expect(validators.integer('42', mockForm)).toBe(true);
			expect(validators.integer(-42, mockForm)).toBe(true);
			expect(validators.integer('0', mockForm)).toBe(true);
		});

		test('小数の場合はfalseを返す', () => {
			expect(validators.integer(42.5, mockForm)).toBe(false);
			expect(validators.integer('42.5', mockForm)).toBe(false);
		});

		test('数値でない場合はfalseを返す', () => {
			expect(validators.integer('abc', mockForm)).toBe(false);
			expect(validators.integer({}, mockForm)).toBe(false);
		});
	});

	describe('positiveInteger', () => {
		test('正の整数の場合はtrueを返す', () => {
			expect(validators.positiveInteger(42, mockForm)).toBe(true);
			expect(validators.positiveInteger('42', mockForm)).toBe(true);
		});

		test('0の場合はtrueを返す', () => {
			expect(validators.positiveInteger(0, mockForm)).toBe(true);
			expect(validators.positiveInteger('0', mockForm)).toBe(true);
		});

		test('負の整数の場合はfalseを返す', () => {
			expect(validators.positiveInteger(-42, mockForm)).toBe(false);
			expect(validators.positiveInteger('-42', mockForm)).toBe(false);
		});

		test('小数の場合はfalseを返す', () => {
			expect(validators.positiveInteger(42.5, mockForm)).toBe(false);
		});

		test('数値でない場合はfalseを返す', () => {
			expect(validators.positiveInteger('abc', mockForm)).toBe(false);
		});
	});

	describe('isEmail', () => {
		test('正しいメールアドレスの場合はtrueを返す', () => {
			expect(validators.isEmail('test@example.com', mockForm)).toBe(true);
			expect(validators.isEmail('user.name+tag@example.co.jp', mockForm)).toBe(
				true,
			);
		});

		test('不正なメールアドレスの場合はfalseを返す', () => {
			expect(validators.isEmail('test', mockForm)).toBe(false);
			expect(validators.isEmail('test@', mockForm)).toBe(false);
			expect(validators.isEmail('@example.com', mockForm)).toBe(false);
			expect(validators.isEmail('test@example', mockForm)).toBe(false);
		});

		test('nullの場合はfalseを返す', () => {
			expect(validators.isEmail(null, mockForm)).toBe(false);
		});

		test('空文字の場合はfalseを返す', () => {
			expect(validators.isEmail('', mockForm)).toBe(false);
		});
	});

	// 例外経路のカバレッジ（catch ブロック）
	describe('例外経路', () => {
		test('integer: Number(Symbol) で例外→false', () => {
			expect(validators.integer(Symbol('x'), mockForm)).toBe(false);
		});

		test('positiveInteger: Number(Symbol) で例外→console.log後にfalse', () => {
			const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
			expect(validators.positiveInteger(Symbol('y'), mockForm)).toBe(false);
			expect(logSpy).toHaveBeenCalled();
			logSpy.mockRestore();
		});
	});

	describe('sameAs', () => {
		test('未実装のため例外をスローする', () => {
			expect(() => validators.sameAs('x', mockForm as any)).toThrow();
		});
	});
});
