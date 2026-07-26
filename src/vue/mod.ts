import { reactive, watch as vueWatch } from 'vue';
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

export interface FieldObject<T = any> extends FieldConfig<T> {
	// バリデーション結果（エラー有無とメッセージ）
	validator?: Validator;
	// 自身が属するフォーム参照（循環回避のために Symbol を使用）
	[KEY_FORM]?: VufForm<any>;
	// 当該フィールドで検証を開始したか（エラー表示タイミング制御）
	$startValid?: boolean;
	// UI 等で利用する一意なフィールドID
	id?: string;
}

// Vue 版のフィールドアクセサ。値は reactive な raw 値として `field.value` に直接持つ
// （Solid のように Signal タプルではない）。core のロジックはこの read/write 経由で値に触れる。
const fieldAccessor: FieldAccessor<FieldObject<any>> = {
	read: (field) => field.value,
	write: (field, value) => {
		field.value = value;
	},
};

// Vue の watch を直接利用する方針のため、外部注入は廃止

// ----------------------------
// 内部シンボル/ヘルパ
// ----------------------------
// ランタイム上で重複・衝突なくメタ情報を保持するため、内部キーは Symbol で付与する。

const KEY_FORM = Symbol('$form');
const KEY_RANDOM = Symbol('$key');
const KEY_EMITS = Symbol('$emits');

// 内部で扱うフィールドマップ型（キーは動的）
type FieldsMap = Record<string, FieldObject<any>>;

// 値が VufForm インスタンスかどうかの型ガード。
// Vue の reactive でラップされたインスタンスでも、Proxy は getPrototypeOf を透過するため
// プロトタイプチェーン判定（instanceof VufForm）が正しく機能する。
function isVufFormInstance(value: unknown): value is VufForm<any> {
	return (
		value !== null &&
		typeof value === 'object' &&
		Object.getPrototypeOf(value as object) instanceof VufForm
	);
}

// コンストラクタが VufForm 由来かどうかの型ガード
type VufFormConstructor = { gen: () => VufForm<any>; prototype: unknown };
function isVufFormConstructor(value: unknown): value is VufFormConstructor {
	return (
		!!value &&
		typeof (value as any).gen === 'function' &&
		(value as any).prototype instanceof VufForm
	);
}

// ----------------------------
// VufForm（Vue アダプタ）
// ----------------------------
// 各フィールド（FieldObject）を束ねるフォームクラス。
// Object.defineProperty により form.fieldName で value に直接アクセスできるようにする。
// Vue の watch を依存性注入で差し替え可能。

export class VufForm<T extends Record<string, FieldObject<any>>> {
	private _fields: T;

	$startValid: boolean = false;
	// validateWatch で再帰的に監視済みのサブフォームを記録し、二重登録を防ぐ。
	private _watchedNested = new WeakSet<VufForm<any>>();
	[KEY_RANDOM]: { value: number; name: string };
	[KEY_EMITS]: EmitFunctions;

	constructor(model: T, options?: { emits?: EmitFunctions }) {
		// モデルのシャローコピーから内部フィールドを初期化
		const clonedModel = { ...model } as Record<string, FieldObject<any>>;
		this._fields = reactive({}) as T;
		for (const key in clonedModel) {
			if (
				Object.hasOwn(clonedModel, key) &&
				clonedModel[key as keyof typeof clonedModel] !== undefined
			) {
				const obj = {
					...(clonedModel as Record<string, FieldObject<any>>)[key],
				} as FieldObject;
				// バリデーション結果の初期化とフォーム参照の付与
				obj.validator = { error: false, message: '' };
				obj[KEY_FORM] = this as unknown as VufForm<any>;
				// id 未指定なら自動採番
				if (!obj.id) obj.id = `${key}_${makeRandomKey()}`;
				this._fields[key as keyof T] = obj as T[keyof T];
				const k = key as keyof T;
				Object.defineProperty(this, key, {
					enumerable: true,
					configurable: false,
					get: () => this._fields[k]?.value,
					set: (newValue: any) => {
						if (this._fields[k]) {
							(this._fields[k] as FieldObject<any>).value = newValue;
						} else {
							console.error(
								`setFieldValue error: ${key} is not found in _fields`,
							);
						}
					},
				});
			}
		}
		// 内部キーとイベントマップを初期化
		this[KEY_RANDOM] = { value: makeRandomKey(), name: '$key' };
		this[KEY_EMITS] = options?.emits || {};
		// watch は Vue の実装を直接利用（外部注入は廃止）
	}

	static gen(): VufForm<Record<string, FieldObject<any>>> {
		throw new Error('You have to implement the method gen!');
	}

	addEmit(eventName: string, handler: EmitFunction): void {
		this[KEY_EMITS][eventName] = handler;
	}
	removeEmit(eventName: string): void {
		if (this[KEY_EMITS][eventName]) delete this[KEY_EMITS][eventName];
	}
	emit(eventName: string, ...args: any[]): any {
		if (this[KEY_EMITS][eventName]) return this[KEY_EMITS][eventName](...args);
		console.log('emit event is not found. eventName:', eventName);
		return null;
	}

	setData(
		obj: Record<string, any> | null,
		keyAndFunc?: Record<string, (value: any) => void>,
	): void {
		coreSetData(
			this._fields as unknown as FieldsMap,
			fieldAccessor,
			obj,
			keyAndFunc,
			isVufFormConstructor,
		);
	}

	getValueJsonStr(options: GetValueJsonOptions = {}): string {
		// 値の抽出ロジックは getValueJson に集約し、ここでは JSON 文字列化のみを担う。
		return JSON.stringify(this.getValueJson(options));
	}

	getJson(options: GetValueJsonOptions = {}): Record<string, any> {
		// エイリアス。実体は getValueJson。
		return this.getValueJson(options);
	}

	getJsonHeadUpper(options: GetValueJsonOptions = {}): Record<string, any> {
		return coreGetJsonHeadUpper(this.getValueJson(options));
	}

	getValueJson(options: GetValueJsonOptions): Record<string, any> {
		return coreGetValueJson(
			this._fields as unknown as FieldsMap,
			fieldAccessor,
			options,
			isVufFormInstance,
		);
	}

	validateWatch(isValidateImmediately = false): void {
		// 各フィールドの変更を Vue の watch で監視
		const keys = Object.keys(this._fields as Record<string, unknown>).filter(
			(k) => !k.includes('$'),
		);
		for (const key of keys) {
			const k = key as keyof T;
			// 1) 通常フィールド: 値変化で自身を再検証する。
			vueWatch(
				() => (this._fields[k] as FieldObject<any>).value,
				() => {
					if (isValidateImmediately || this.$startValid) this.isErrorField(key);
				},
			);
			// 2) ネストしたサブフォーム / サブフォーム配列: 値（サブフォーム参照や配列）が
			//    変わるたびに、未監視のサブフォームへ再帰的に validateWatch を張る。
			//    配列は追加・削除で参照が入れ替わる想定（parent.persons = [...]）のため、
			//    この watch が発火して後から増えた要素も自動的に監視対象になる。
			vueWatch(
				() => (this._fields[k] as FieldObject<any>).value,
				(val) => this.attachNestedWatch(val, isValidateImmediately),
				{ immediate: true },
			);
		}
	}

	// ネスト値（単一サブフォーム or サブフォーム配列）を走査し、未監視のものへ
	// validateWatch を張る。二重登録は _watchedNested（WeakSet）で防ぐ。
	private attachNestedWatch(
		value: unknown,
		isValidateImmediately: boolean,
	): void {
		if (isVufFormInstance(value)) {
			this.ensureNestedWatched(value, isValidateImmediately);
		} else if (Array.isArray(value)) {
			for (const el of value) {
				if (isVufFormInstance(el)) {
					this.ensureNestedWatched(el, isValidateImmediately);
				}
			}
		}
	}

	private ensureNestedWatched(
		form: VufForm<any>,
		isValidateImmediately: boolean,
	): void {
		if (this._watchedNested.has(form)) return;
		this._watchedNested.add(form);
		form.validateWatch(isValidateImmediately);
		// 親が既に検証開始済みなら、後から追加されたサブフォームにも検証開始を伝播し、
		// 追加直後からリアルタイム検証が効くようにする。
		if (this.$startValid) form.startValid();
	}

	startValid(): void {
		this.$startValid = true;
		coreStartNested(
			this._fields as unknown as FieldsMap,
			fieldAccessor,
			isVufFormInstance,
		);
	}

	// 互換 API（フォーム内部構造へのアクセス補助）
	getFieldObject<K extends keyof T>(key: K): T[K] {
		return this._fields[key];
	}

	getFieldValue<K extends keyof T>(
		key: K,
	): T[K] extends FieldObject<infer U> ? U : never {
		return (this._fields[key] as FieldObject<any> | undefined)?.value as any;
	}

	setFieldValue<K extends keyof T>(
		key: K,
		value: T[K] extends FieldObject<infer U> ? U : never,
	): void {
		if (this._fields[key]) {
			(this._fields[key] as FieldObject<any>).value = value as any;
		} else {
			console.error(
				`setFieldValue error: ${String(key)} is not found in _fields`,
			);
		}
	}

	getKey(): number {
		return this[KEY_RANDOM].value;
	}

	groupIsValid(fieldNames?: string[]): boolean {
		return coreGroupIsValid(
			this._fields as unknown as FieldsMap,
			fieldAccessor,
			fieldNames,
			() => this.startValid(),
			(key) => this.isErrorField(key),
		);
	}

	isErrorField(fieldName: string): boolean {
		return coreIsErrorField(
			this._fields as unknown as FieldsMap,
			fieldAccessor,
			fieldName,
			this.$startValid,
			this as unknown as VufForm<any>,
			getValidatorMap(),
			getMessages(),
		);
	}
}

// フィールド定義ヘルパ。与えられた構成をそのまま FieldObject に昇格させる。
export function field<T>(config: FieldConfig<T>): FieldObject<T> {
	return { ...config } as FieldObject<T>;
}

// validators を [name, ...params] 形式で使いやすくするマップ
const validatorMapForForm: Record<string, ValidatorRuleFactory> = {};
Object.keys(getValidatorMap()).forEach((validatorName) => {
	validatorMapForForm[validatorName] = (...params: any[]) =>
		makeRule(validatorName)(...params) as ValidatorRule;
});

// 代表的なものをエクスポート（全量必要なら利用側で Object から参照も可能）
// NOTE: 明示的に ValidatorRuleFactory を注釈することで、配布 d.ts が any に
// 落ちず、validate: [required] のような関数参照の渡し漏れがコンパイルエラーになる。
export const maxLength: ValidatorRuleFactory = validatorMapForForm.maxLength!;
export const required: ValidatorRuleFactory = validatorMapForForm.required!;
export const anyCondition: ValidatorRuleFactory =
	validatorMapForForm.anyCondition!;
export const sameAs: ValidatorRuleFactory = validatorMapForForm.sameAs!;
export const isEmail: ValidatorRuleFactory = validatorMapForForm.isEmail!;

// ----------------------------
// createForm2（Vue）
// ----------------------------

type AnyFieldObject = FieldObject<unknown>;
type AnyForm = VufForm<Record<string, AnyFieldObject>>;

export type VufFormPublicMethods = Pick<
	AnyForm,
	| 'getFieldObject'
	| 'getFieldValue'
	| 'setFieldValue'
	| 'getKey'
	| 'addEmit'
	| 'removeEmit'
	| 'emit'
	| 'setData'
	| 'getValueJsonStr'
	| 'getJson'
	| 'getJsonHeadUpper'
	| 'getValueJson'
	| 'validateWatch'
	| 'startValid'
	| 'isErrorField'
	| 'groupIsValid'
>;

// Vue 側では methods に具体的な引数型（例: ($dayjs, data)）を付けたいことが多いので、
// unknown[] 制約だと代入が厳しすぎる。Vue 版 createForm2 では any[] で許容する。
export type MethodRecord = Record<string, (...args: any[]) => any>;

export type ParentMethods<
	TValues extends Record<string, unknown> = Record<string, unknown>,
> = VufFormPublicMethods & TValues & { validate(): boolean };

export type MethodsFactory<
	M extends MethodRecord,
	TValues extends Record<string, unknown> = Record<string, unknown>,
> = (parent: ParentMethods<TValues>) => M;
export type EmitsFactory<
	E extends EmitFunctions,
	TValues extends Record<string, unknown> = Record<string, unknown>,
> = (parent: ParentMethods<TValues>) => E;

export type CreateForm2Options<
	M extends MethodRecord,
	E extends EmitFunctions,
> = {
	/** 追加メソッド（parent経由で既存APIにアクセス） */
	methods?: MethodsFactory<M>;
	/** anyCondition 等で利用する emits をフォーム生成時に自動登録 */
	emits?: EmitsFactory<E>;
};

type VufFormFactory<ExtendedForm> = ((options?: {
	emits?: EmitFunctions;
}) => ExtendedForm) & {
	gen: (options?: { emits?: EmitFunctions }) => ExtendedForm;
};

const createParentMethods = (self: AnyForm): ParentMethods => ({
	getFieldObject: self.getFieldObject.bind(self),
	getFieldValue: self.getFieldValue.bind(self),
	setFieldValue: self.setFieldValue.bind(self),
	getKey: self.getKey.bind(self),
	addEmit: self.addEmit.bind(self),
	removeEmit: self.removeEmit.bind(self),
	emit: self.emit.bind(self),
	setData: self.setData.bind(self),
	getValueJsonStr: self.getValueJsonStr.bind(self),
	getJson: self.getJson.bind(self),
	getJsonHeadUpper: self.getJsonHeadUpper.bind(self),
	getValueJson: self.getValueJson.bind(self),
	validateWatch: self.validateWatch.bind(self),
	startValid: self.startValid.bind(self),
	isErrorField: self.isErrorField.bind(self),
	groupIsValid: self.groupIsValid.bind(self),
	validate(): boolean {
		return self.groupIsValid();
	},
});

/**
 * createParentProxy:
 * - parent.xxx を self.getFieldValue('xxx') にマップ
 * - parent.xxx = v を self.setFieldValue('xxx', v) にマップ
 * - ただし parent の既存メソッド名はそのまま解決する
 */
const createParentProxy = <TValues extends Record<string, unknown>>(
	self: AnyForm,
	parent: ParentMethods<TValues>,
): ParentMethods<TValues> => {
	return new Proxy(parent, {
		get(target, prop) {
			if (typeof prop !== 'string') return (target as any)[prop];
			if (prop in target) return (target as any)[prop];
			// JS 組み込み（toString など）はフィールド解決しない
			if (prop in Object.prototype) {
				const v = (Object.prototype as any)[prop];
				return typeof v === 'function' ? v.bind(target) : v;
			}
			return self.getFieldValue(prop);
		},
		set(target, prop, value) {
			if (typeof prop !== 'string') {
				(target as any)[prop] = value;
				return true;
			}
			if (prop in target) {
				(target as any)[prop] = value;
				return true;
			}
			self.setFieldValue(prop, value);
			return true;
		},
	});
};

/**
 * createForm2:
 * - `createForm(def, methodsFactory)` の後継（Vue）
 * - options で methods/emits をまとめて指定できる
 */
export function createForm2<
	T extends Record<string, AnyFieldObject>,
	M extends MethodRecord = Record<never, (...args: never[]) => never>,
	E extends EmitFunctions = EmitFunctions,
>(
	formDefinition: T,
	options: CreateForm2Options<M, E>,
): VufFormFactory<
	{ [K in keyof T]: T[K]['value'] } & Omit<VufFormPublicMethods, keyof M> &
		M & { __valueType?: { [K in keyof T]: T[K]['value'] } }
> {
	type FormValues = { [K in keyof T]: T[K]['value'] };

	const methodsFactory: MethodsFactory<M, FormValues> =
		(options.methods as MethodsFactory<M> | undefined) ??
		((() => ({}) as M) as MethodsFactory<M, FormValues>);
	const emitsFactory: EmitsFactory<E, FormValues> | undefined = options.emits as
		| EmitsFactory<E, FormValues>
		| undefined;

	class FormClass extends VufForm<T> {
		constructor(options?: { emits?: EmitFunctions }) {
			super(formDefinition, options);
			// parent は「フォームの公開メソッド + フィールドアクセス」を束ねたプロキシ。
			// これを methodsFactory / emitsFactory に渡すことで、利用側の定義内で
			// parent.fieldName（読み取り）/ parent.fieldName = v（書き込み）/
			// parent.groupIsValid(...) などを自然に記述できるようにする。
			const parent = createParentProxy<FormValues>(
				this as unknown as AnyForm,
				createParentMethods(
					this as unknown as AnyForm,
				) as ParentMethods<FormValues>,
			);

			// 利用側が定義した追加メソッドを実体(this=フォーム本体)へ bind して生やす。
			// 引数の parent はフィールドアクセス用プロキシだが、メソッドの this はフォーム本体になる。
			const methods = methodsFactory(parent);
			const self = this as unknown as Record<string, unknown>;
			Object.entries(methods).forEach(([name, method]) => {
				self[name] = (
					method as unknown as (...args: unknown[]) => unknown
				).bind(this);
			});

			// anyCondition などが参照する emits を、フォーム定義時に登録しておく。
			if (emitsFactory) {
				const emits = emitsFactory(parent);
				Object.entries(emits).forEach(([eventName, handler]) => {
					this.addEmit(
						eventName,
						(handler as unknown as (...args: unknown[]) => unknown).bind(this),
					);
				});
			}
		}
	}

	type ExtendedForm = FormValues &
		Omit<VufFormPublicMethods, keyof M> &
		M & { __valueType?: FormValues };
	const factory = ((options?: { emits?: EmitFunctions }) =>
		new FormClass(
			options,
		) as unknown as ExtendedForm) as VufFormFactory<ExtendedForm>;

	// vuf のネストフォーム生成（setData）互換のため、factory に gen を生やす
	// - setData 側が `.gen()` を呼ぶ前提なので、factory 自体を渡せるようにする
	factory.gen = (options?: { emits?: EmitFunctions }) => factory(options);
	// `prototype instanceof VufForm` 判定も通す（setData のネスト判定用）
	(factory as unknown as { prototype: unknown }).prototype =
		FormClass.prototype;
	return factory;
}
