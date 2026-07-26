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

import { createEffect, createSignal, getOwner, runWithOwner } from 'solid-js';
import {
	coreGetJsonHeadUpper,
	coreGetValueJson,
	coreGroupIsValid,
	coreIsErrorField,
	coreSetData,
	coreStartNested,
	type EmitFunction,
	type EmitFunctions,
	type FieldAccessor,
	type FieldConfig,
	type GetValueJsonOptions,
	makeRandomKey,
	type Validator,
	type ValidatorRule,
	type ValidatorRuleFactory,
} from '../core/form';
import { getMessages, getValidatorMap, makeRule } from '../core/mod';

export type {
	EmitFunction,
	EmitFunctions,
	FieldConfig,
	GetValueJsonOptions,
	ValidateList,
	Validator,
	ValidatorRule,
	ValidatorRuleFactory,
} from '../core/form';
export * from './formFactory';

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

// Solid 版のフィールドアクセサ。値は Signal タプル `[get, set]` として `field.value` に持つ
// （Vue のように raw 値ではない）。core のロジックはこの read/write 経由で値に触れるため、
// Signal の読み書き（`[0]()` / `[1](v)`）の差はここで吸収される。
const fieldAccessor: FieldAccessor<FieldObject<any>> = {
	read: (field) => field.value[0](),
	write: (field, value) => {
		field.value[1](value);
	},
};

export class VufForm<T extends Record<string, FieldConfig<any>>> {
	private _fields: Record<string, FieldObject<any>> = {};
	$startValid: [() => boolean, (v: boolean) => boolean] = createSignal(false);
	// validateWatch で再帰的に監視済みのサブフォームを記録し、二重登録を防ぐ。
	private _watchedNested = new WeakSet<VufForm<any>>();

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
					id: config.id || `${key}_${makeRandomKey()}`,
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
		this[KEY_RANDOM] = { value: makeRandomKey(), name: '$key' };
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
		coreSetData(
			this._fields,
			fieldAccessor,
			obj,
			keyAndFunc,
			isVufFormConstructor,
		);
	}

	getValueJsonStr(options: GetValueJsonOptions = {}): string {
		return JSON.stringify(this.getValueJson(options));
	}
	getJson(options: GetValueJsonOptions = {}): Record<string, any> {
		return this.getValueJson(options);
	}
	getJsonHeadUpper(options: GetValueJsonOptions = {}): Record<string, any> {
		return coreGetJsonHeadUpper(this.getValueJson(options));
	}

	/**
	 * 値抽出
	 * - keys/exceptKeys: 対象キーの制御
	 * - format: キー名の変換（例: 先頭大文字化）
	 * - isIgnoreBlank: 空文字の除外
	 */
	getValueJson(options: GetValueJsonOptions): Record<string, any> {
		return coreGetValueJson(
			this._fields,
			fieldAccessor,
			options,
			isVufFormInstance,
		);
	}

	/**
	 * 値の変化を監視して検証を自動実行
	 * - isValidateImmediately: true の場合は監視直後から検証
	 * - false の場合は startValid() 呼び出し以降に検証
	 */
	validateWatch(isValidateImmediately = false): void {
		// ネストしたサブフォームの watcher を「この effect の再実行」で破棄させないため、
		// 現在の reactive owner を捕捉して runWithOwner で owner 直下に生成する。
		const owner = getOwner();
		for (const key in this._fields) {
			if (!key.includes('$')) {
				const fieldSignal = this._fields[key].value;
				// 1) 通常フィールド: 値変化で自身を再検証する。
				createEffect(() => {
					const _currentValue = fieldSignal[0]();
					const validationStarted = this.$startValid[0]();
					if (isValidateImmediately || validationStarted)
						this.isErrorField(String(key));
				});
				// 2) ネストしたサブフォーム / サブフォーム配列: 値（サブフォーム参照や配列）が
				//    変わるたびに、未監視のサブフォームへ再帰的に validateWatch を張る。
				//    配列は追加・削除で参照が入れ替わる想定（parent.items = [...]）のため、
				//    この effect が再実行され後から増えた要素も自動的に監視対象になる。
				createEffect(() => {
					const val = fieldSignal[0]();
					this.attachNestedWatch(val, isValidateImmediately, owner);
				});
			}
		}
	}

	// ネスト値（単一サブフォーム or サブフォーム配列）を走査し、未監視のものへ
	// validateWatch を張る。二重登録は _watchedNested（WeakSet）で防ぐ。
	private attachNestedWatch(
		value: unknown,
		isValidateImmediately: boolean,
		owner: ReturnType<typeof getOwner>,
	): void {
		if (isVufFormInstance(value)) {
			this.ensureNestedWatched(value, isValidateImmediately, owner);
		} else if (Array.isArray(value)) {
			for (const el of value) {
				if (isVufFormInstance(el)) {
					this.ensureNestedWatched(el, isValidateImmediately, owner);
				}
			}
		}
	}

	private ensureNestedWatched(
		form: VufForm<any>,
		isValidateImmediately: boolean,
		owner: ReturnType<typeof getOwner>,
	): void {
		if (this._watchedNested.has(form)) return;
		this._watchedNested.add(form);
		const run = () => {
			form.validateWatch(isValidateImmediately);
			// 親が既に検証開始済みなら、後から追加されたサブフォームにも伝播して
			// 追加直後からリアルタイム検証が効くようにする。
			if (this.$startValid[0]()) form.startValid();
		};
		if (owner) runWithOwner(owner, run);
		else run();
	}

	/** 以降の変更でバリデーションを実行するフラグを有効化する（ネストへ再帰伝播） */
	startValid(): void {
		this.$startValid[1](true);
		coreStartNested(this._fields, fieldAccessor, isVufFormInstance);
	}

	/** 単一フィールドを検証し、エラー状態を反映する */
	isErrorField(fieldName: string): boolean {
		return coreIsErrorField(
			this._fields,
			fieldAccessor,
			fieldName,
			this.$startValid[0](),
			this as any,
			getValidatorMap(),
			getMessages(),
		);
	}

	/** 複数フィールド（ネスト指定可）をまとめて検証する */
	groupIsValid(fieldNames?: string[]): boolean {
		return coreGroupIsValid(
			this._fields,
			fieldAccessor,
			fieldNames,
			() => this.startValid(),
			(key) => this.isErrorField(key),
		);
	}
}

// 値が VufForm インスタンスかどうかの型ガード（Vue アダプタと同一判定）。
function isVufFormInstance(value: unknown): value is VufForm<any> {
	return (
		value !== null &&
		typeof value === 'object' &&
		Object.getPrototypeOf(value as object) instanceof VufForm
	);
}

type VufFormConstructor = { gen: () => VufForm<any>; prototype: unknown };
function isVufFormConstructor(value: unknown): value is VufFormConstructor {
	return (
		!!value &&
		typeof (value as any).gen === 'function' &&
		(value as any).prototype instanceof VufForm
	);
}

export function field<T>(config: FieldConfig<T>): FieldConfig<T> {
	return { ...config } as FieldConfig<T>;
}

const validatorMapForForm: Record<string, ValidatorRuleFactory> = {};
Object.keys(getValidatorMap()).forEach((validatorName) => {
	validatorMapForForm[validatorName] = (...params: any[]) =>
		makeRule(validatorName)(...params) as ValidatorRule;
});

// NOTE: 明示的に ValidatorRuleFactory を注釈することで、配布 d.ts が any に
// 落ちず、validate: [required] のような関数参照の渡し漏れがコンパイルエラーになる。
export const maxLength: ValidatorRuleFactory = validatorMapForForm.maxLength!;
export const required: ValidatorRuleFactory = validatorMapForForm.required!;
export const anyCondition: ValidatorRuleFactory =
	validatorMapForForm.anyCondition!;
export const sameAs: ValidatorRuleFactory = validatorMapForForm.sameAs!;
export const isEmail: ValidatorRuleFactory = validatorMapForForm.isEmail!;
