import v8n from 'v8n';
import type { IVufForm } from './types';

export type ValidatorFunction = (
	value: any,
	form: IVufForm,
	...args: any[]
) => boolean;

const validators: Record<string, ValidatorFunction> = {
	required: (value: any): boolean => {
		if (value == null) return false;
		return v8n().string().minLength(1).test(String(value));
	},
	maxLength: (value: any, _form: IVufForm, num: number): boolean => {
		return v8n().maxLength(num).test(String(value));
	},
	length: (value: any, _form: IVufForm, num: number): boolean => {
		return String(value).length === num;
	},
	// 任意条件バリデータ。値が空なら検証をスキップ（true）。非空のときはフォームに登録された
	// emit ハンドラ funcName を呼び、その真偽で合否を決める（利用側が任意ロジックを注入できる）。
	anyCondition: (
		value: any,
		form: IVufForm,
		funcName: string,
		message: string,
	): boolean => {
		// 空値でも検証をスキップしない（旧 vuf 互換）。空の扱い（必須にするか否か）は
		// 呼び出し側の emit ハンドラが決める。例: checkBlankOrMin8 は空なら false を返して
		// 「パスワードは8文字以上」を出す。ここで空をスキップすると空パスワードが素通りしてしまう。
		// emit の返り値は本来 any/unknown。バリデーションとしては truthy/falsey を boolean に寄せる。
		return Boolean(form.emit(funcName, value, message));
	},
	// 同一フォーム内の別フィールド（fieldName）と値が一致するか（例: メール確認欄）。
	// 値の取得は 2 段構え: まず getJson({isIgnoreBlank:false}) の結果に該当キーがあればそれを使い、
	// （空文字で JSON から落ちている等で）無ければ getFieldValue で直接読む。空値のときは検証スキップ。
	sameAs: (value: any, form: IVufForm, fieldName: string): boolean => {
		if (value == null || value === '') return true;

		const normalizedFieldName = String(fieldName || '');
		const json = (
			form.getJson as (options?: unknown) => Record<string, unknown>
		)({
			isIgnoreBlank: false,
		});

		if (Object.hasOwn(json, normalizedFieldName)) {
			return value === json[normalizedFieldName];
		}

		const formWithAccessors = form as IVufForm & {
			getFieldValue?: (key: string) => unknown;
		};
		if (typeof formWithAccessors.getFieldValue === 'function') {
			return value === formWithAccessors.getFieldValue(normalizedFieldName);
		}

		return false;
	},
	integer: (value: any): boolean => {
		try {
			return v8n().integer().test(Number(value));
		} catch {
			return false;
		}
	},
	positiveInteger: (value: any): boolean => {
		try {
			return v8n().integer().positive().test(Number(value));
		} catch (ex) {
			// 旧実装（clinicit_front/libs/vuf/validators.ts）互換: 例外時にログを出力
			console.log('exception: ex:', ex);
			return false;
		}
	},
	isEmail: (value: any): boolean => {
		return v8n()
			.not.null()
			.string()
			.minLength(5)
			.pattern(/[^\s@]+@[^\s@]+\.[^\s@]+/)
			.test(value);
	},
};

export default validators;
