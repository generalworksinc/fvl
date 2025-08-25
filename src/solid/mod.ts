/**
 * Solid アダプタ（公開エントリ）
 *
 * 目的:
 * - コア（validators/messages）の公開APIに橋渡ししつつ、Solid の reactivity（Signal）に沿ったフォームモデルを提供する
 * - 旧実装（solidjs/ 配下）と等価の機能を、1ファイルに統合して分かりやすく保守できる形にする
 *
 * 設計の要点:
 * - 値は Solid の Signal（[get, set]）で保持する
 * - `VufForm` は key ごとに FieldObject を持ち、ゲッター/セッターをプロパティとして定義（form.name = 'x' など）
 * - バリデーションはコアの validator マップとメッセージ辞書を使用（サブパス `@generalworks/vuf/messages/*` で辞書差替も可）
 * - `validateWatch` は Signal を購読し、即時 or startValid 後に `isErrorField` を呼ぶ
 * - JSON 化は `getValueJson` を基礎として、キー整形（頭大文字など）を派生で提供
 */

import { createEffect, createSignal } from 'solid-js';
import { getMessages, getValidatorMap, makeRule } from '../core/mod';

export * from './formFactory';

export type ValidateList = Array<string | [string, ...any[]]>;
/** 単一フィールドの検証状態 */
export interface Validator {
	error: boolean;
	message: string;
}

export type FieldConfig<T = any, U = any> = {
	value: T;
	name?: string;
	validate?: ValidateList;
	type?:
		| NumberConstructor
		| StringConstructor
		| DateConstructor
		| ArrayConstructor
		| any;
	subType?: U;
	[key: string]: any;
};

const KEY_FORM = Symbol('$form');
const KEY_RANDOM = Symbol('$key');
const KEY_EMITS = Symbol('$emits');

export interface FieldObject<T = any> extends Omit<FieldConfig<T>, 'value'> {
	value: [() => T, (v: T) => T];
	validator?: Validator;
	[KEY_FORM]?: VufForm<any>;
	$startValid?: boolean;
	id?: string;
}

export type EmitFunction = (...args: any[]) => any;
export interface EmitFunctions {
	[eventName: string]: EmitFunction;
}

export interface GetValueJsonOptions {
	keys?: string[];
	exceptKeys?: string[];
	format?: ((key: string) => string) | null;
	isIgnoreBlank?: boolean;
}

const headLower = (s: string): string =>
	s ? s[0].toLowerCase() + s.slice(1) : s;
const headUpper = (s: string): string =>
	s ? s[0].toUpperCase() + s.slice(1) : s;

const randomKey = (() => {
	let atomicKeyIndex = Math.floor(Math.random() * 1000000);
	const COUNTER_PART = 100000000;
	return (): number => {
		atomicKeyIndex = (atomicKeyIndex + 1) % COUNTER_PART;
		const timeComponent = Date.now() % 10000000000;
		return timeComponent * COUNTER_PART + atomicKeyIndex;
	};
})();

export class VufForm<T extends Record<string, FieldConfig<any>>> {
	private _fields: Record<string, FieldObject<any>> = {};
	$startValid: [() => boolean, (v: boolean) => boolean] = createSignal(false);

	[KEY_RANDOM]: { value: number; name: string };
	[KEY_EMITS]: EmitFunctions;

	/**
	 * @param model フィールド定義（value/type/validate 等）
	 * @param options emits: 任意イベント（anyCondition などで利用）
	 */
	constructor(
		model: Record<keyof T, FieldConfig<any>>,
		options?: { emits?: EmitFunctions },
	) {
		const clonedModel = { ...model } as Record<string, FieldConfig<any>>;
		for (const key in clonedModel) {
			if (Object.hasOwn(clonedModel, key)) {
				const config = clonedModel[key];
				const signal = createSignal(config.value);
				const obj: FieldObject<any> = {
					...config,
					value: signal,
					validator: { error: false, message: '' },
					[KEY_FORM]: this,
					id: config.id || `${key}_${randomKey()}`,
				};
				this._fields[key] = obj;
				Object.defineProperty(this, key, {
					enumerable: true,
					configurable: false,
					get: () => this._fields[key].value[0](),
					set: (newValue: any) => {
						this._fields[key].value[1](newValue);
					},
				});
			}
		}
		this[KEY_RANDOM] = { value: randomKey(), name: '$key' };
		this[KEY_EMITS] = options?.emits || {};
	}

	/** 具象クラスでオーバーライドされる想定のファクトリ */
	static gen(): VufForm<Record<string, FieldConfig<any>>> {
		throw new Error('You have to implement the method gen!');
	}

	/** 任意イベントハンドラを登録する */
	addEmit(eventName: string, handler: EmitFunction): void {
		this[KEY_EMITS][eventName] = handler;
	}
	/** 任意イベントハンドラを解除する（存在しない場合は無視） */
	removeEmit(eventName: string): void {
		if (this[KEY_EMITS][eventName]) delete this[KEY_EMITS][eventName];
	}
	/** 任意イベントの発火（未登録時は console.log で通知） */
	emit(eventName: string, ...args: any[]): any {
		if (this[KEY_EMITS][eventName]) return this[KEY_EMITS][eventName](...args);
		console.log('emit event is not found. eventName:', eventName);
		return null;
	}

	/** 内部の FieldObject を取得する（テスト/拡張向け） */
	getFieldObject<K extends keyof T>(key: K): FieldObject<any> {
		return this._fields[key as string];
	}
	/** フィールドの現在値を取得する（Signal の get を通す） */
	getFieldValue<K extends keyof T>(key: K): any {
		return this._fields[key as string].value[0]();
	}
	/** フィールドの値を設定する（Signal の set を通す） */
	setFieldValue<K extends keyof T>(key: K, value: any): void {
		this._fields[key as string].value[1](value);
	}
	/** フォームの一意キー（UI のキーなどに利用可） */
	getKey(): number {
		return this[KEY_RANDOM].value;
	}

	/**
	 * データ流し込み
	 * - ネスト: type が VufForm の派生なら再帰的に gen/setData
	 * - 配列: type === Array かつ subType が VufForm の派生なら各要素を再帰生成
	 * - keyAndFunc: 特定キーに対するカスタム代入処理の注入
	 */
	setData(
		obj: Record<string, any> | null,
		keyAndFunc?: Record<string, (value: any) => void>,
	): void {
		if (!obj) return;
		for (const key in obj) {
			const formattedKey = headLower(key);
			let setFunc = (value: any) => {
				if (Object.hasOwn(this._fields, formattedKey)) {
					const thisField = this._fields[formattedKey];
					if (
						value &&
						thisField.type &&
						(thisField.type as any).prototype instanceof VufForm
					) {
						const vufFormInstance = (thisField.type as any).gen();
						vufFormInstance.setData(value);
						thisField.value[1](vufFormInstance);
					} else if (
						value &&
						Array.isArray(value) &&
						thisField.type &&
						thisField.subType &&
						thisField.type === Array &&
						(thisField.subType as any).prototype instanceof VufForm
					) {
						const elmArray: VufForm<any>[] = [];
						for (const elm of value) {
							const vufFormInstance = (thisField.subType as any).gen();
							vufFormInstance.setData(elm);
							elmArray.push(vufFormInstance);
						}
						thisField.value[1](elmArray);
					} else {
						thisField.value[1](value);
					}
				}
			};
			if (keyAndFunc) {
				if (Object.hasOwn(keyAndFunc, formattedKey))
					setFunc = keyAndFunc[formattedKey];
				else if (Object.hasOwn(keyAndFunc, key)) setFunc = keyAndFunc[key];
			}
			setFunc(obj[key]);
		}
	}

	getValueJsonStr(options: GetValueJsonOptions = {}): string {
		return JSON.stringify(this.getValueJson(options));
	}
	getJson(options: GetValueJsonOptions = {}): Record<string, any> {
		return this.getValueJson(options);
	}
	getJsonHeadUpper(options: GetValueJsonOptions = {}): Record<string, any> {
		const newObj = this.getValueJson(options);
		const retObj: Record<string, any> = {};
		for (const key in newObj)
			if (Object.hasOwn(newObj, key))
				retObj[headUpper(key)] = (newObj as any)[key];
		return retObj;
	}

	/**
	 * 値抽出
	 * - keys/exceptKeys: 対象キーの制御
	 * - format: キー名の変換（例: 先頭大文字化）
	 * - isIgnoreBlank: 空文字の除外
	 */
	getValueJson({
		keys = [],
		exceptKeys = [],
		format = null,
		isIgnoreBlank = true,
	}: GetValueJsonOptions): Record<string, any> {
		let targetKeys: string[];
		if (keys && keys.length > 0) targetKeys = keys;
		else {
			targetKeys = Object.keys(this._fields);
			if (exceptKeys && exceptKeys.length > 0)
				targetKeys = targetKeys.filter((key) => exceptKeys.indexOf(key) < 0);
		}
		const filteredObj: Record<string, FieldObject<any>> = {};
		targetKeys.forEach((key) => {
			if (this._fields[key]) filteredObj[key] = this._fields[key];
		});
		const result = extractData(filteredObj, isIgnoreBlank);
		if (format) {
			const formattedResult: Record<string, any> = {};
			for (const key in result)
				formattedResult[format(key)] = (result as any)[key];
			return formattedResult;
		}
		return result;
	}

	/**
	 * 値の変化を監視して検証を自動実行
	 * - isValidateImmediately: true の場合は監視直後から検証
	 * - false の場合は startValid() 呼び出し以降に検証
	 */
	validateWatch(isValidateImmediately = false): void {
		for (const key in this._fields) {
			if (!key.includes('$')) {
				const fieldSignal = this._fields[key].value;
				createEffect(() => {
					const _currentValue = fieldSignal[0]();
					const validationStarted = this.$startValid[0]();
					if (isValidateImmediately || validationStarted)
						this.isErrorField(String(key));
				});
			}
		}
	}

	/** 以降の変更でバリデーションを実行するフラグを有効化する */
	startValid(): void {
		this.$startValid[1](true);
	}

	/** 単一フィールドを検証し、エラー状態を反映する */
	isErrorField(fieldName: string): boolean {
		if (!this.$startValid[0]()) return false;
		let hasError = false;
		const obj = this._fields[fieldName];
		const validatorList = obj.validate;
		if (!validatorList) return false;
		if (!obj.validator) obj.validator = { error: false, message: '' };

		const validators = getValidatorMap();
		const localeMessages = getMessages();

		for (const validator of validatorList) {
			let validFunc: ((...args: any[]) => boolean) | undefined;
			let validMessage: string | undefined;
			let params: any[] = [];
			let validStr = '';
			if (typeof validator === 'string') validStr = validator;
			else {
				validStr = (validator as any)[0];
				params = (validator as any).slice(1);
			}
			validFunc = validators[validStr];
			validMessage = localeMessages[validStr];
			if (validMessage) {
				validMessage = validMessage.replace('{param}', validStr);
				for (const ind in params)
					validMessage = validMessage.replace(`{${ind}}`, params[ind]);
			} else {
				validMessage = `Validation error: ${validStr}`;
			}
			const currentValue = obj.value[0]();
			try {
				if (validFunc && !validFunc(currentValue, this as any, ...params)) {
					obj.validator.message = validMessage;
					hasError = true;
				}
			} catch (error) {
				console.error(`バリデーションエラー [${validStr}]:`, error);
				obj.validator.message = '検証中にエラーが発生しました';
				hasError = true;
			}
		}
		obj.validator.error = hasError;
		if (!hasError) obj.validator.message = '';
		obj.$startValid = true;
		return obj.validator.error;
	}

	/** 複数フィールド（ネスト指定可）をまとめて検証する */
	groupIsValid(fieldNames?: string[]): boolean {
		this.startValid();
		const keys: string[] =
			fieldNames && fieldNames.length > 0
				? fieldNames
				: Object.keys(this._fields).filter((key) => !key.startsWith('$'));
		let isValid = true;
		for (const key of keys) {
			if (key.startsWith('$')) continue;
			if (key.indexOf('.') >= 0) {
				try {
					const [parentKey, childKey] = key.split('.');
					if (
						parentKey &&
						this._fields[parentKey] &&
						this._fields[parentKey].value
					) {
						const nestedForm = this._fields[parentKey].value[0]() as any;
						if (
							nestedForm &&
							typeof nestedForm.isErrorField === 'function' &&
							nestedForm.isErrorField(childKey)
						) {
							isValid = false;
						}
					}
				} catch (e) {
					console.error(`Error processing nested field: ${key}`, e);
				}
			} else if (this.isErrorField(key)) {
				isValid = false;
			}
		}
		return isValid;
	}
}

const formatValue = (obj: FieldObject<any>, value: any): any => {
	const actualValue = typeof value === 'function' ? value() : value;
	let retVal = actualValue;
	if (Array.isArray(actualValue)) {
		retVal = actualValue.reduce((newArray: any[], currentValue: any) => {
			newArray.push(formatValue({} as FieldObject<any>, currentValue));
			return newArray;
		}, []);
	} else if (
		actualValue !== null &&
		actualValue !== undefined &&
		Object.getPrototypeOf(actualValue) instanceof VufForm
	) {
		retVal = actualValue.getJson();
	} else if (obj.type === Number) {
		try {
			retVal = Number(actualValue);
		} catch {
			console.log('Number parse error. value:', actualValue);
			retVal = null;
		}
	}
	return retVal;
};

const extractData = (
	formObj: Record<string, FieldObject<any>>,
	isIgnoreBlank = true,
): Record<string, any> => {
	const valueObj: Record<string, any> = {};
	Object.keys(formObj).forEach((key) => {
		if (key.startsWith('$')) return;
		const obj = formObj[key];
		const currentValue: any = obj.value[0]();
		let value: any = null;
		if (isIgnoreBlank && typeof currentValue === 'string') {
			if (currentValue) value = currentValue;
		} else if (currentValue instanceof VufForm) {
			if (currentValue) value = currentValue.getJson();
		} else {
			if (currentValue !== null && currentValue !== undefined)
				value = currentValue;
		}
		if (value !== null && value !== undefined)
			valueObj[key] = formatValue(obj, value);
	});
	return valueObj;
};

export function field<T>(config: FieldConfig<T>): FieldConfig<T> {
	return { ...config } as FieldConfig<T>;
}

const validatorMapForForm: Record<
	string,
	(...params: any[]) => [string, ...any[]]
> = {};
Object.keys(getValidatorMap()).forEach((validatorName) => {
	validatorMapForForm[validatorName] = (...params: any[]) =>
		makeRule(validatorName)(...params) as [string, ...any[]];
});

export const maxLength = validatorMapForForm.maxLength!;
export const required = validatorMapForForm.required!;
export const anyCondition = validatorMapForForm.anyCondition!;
export const sameAs = validatorMapForForm.sameAs!;
export const isEmail = validatorMapForForm.isEmail!;
