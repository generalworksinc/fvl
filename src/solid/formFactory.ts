import { type EmitFunctions, type FieldConfig, VufForm } from './mod';

type AnyFieldConfig = FieldConfig<unknown>;
type AnyForm = VufForm<Record<string, AnyFieldConfig>>;

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

// Vue 版と同じく、methods では実用上引数を具体化して使うため any[] を許容する。
export type MethodRecord = Record<string, (...args: any[]) => any>;

export type ParentMethods = VufFormPublicMethods & { validate(): boolean };

export type MethodsFactory<M extends MethodRecord> = (
	parent: ParentMethods,
) => M;

export type EmitsFactory<E extends EmitFunctions> = (
	parent: ParentMethods,
) => E;

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
 * createForm2:
 * - `createForm(def, methodsFactory)` の後継
 * - options で methods/emits をまとめて指定できる
 */
export function createForm2<
	T extends Record<string, AnyFieldConfig>,
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

	const methodsFactory: MethodsFactory<M> =
		(options.methods as MethodsFactory<M> | undefined) ??
		((() => ({}) as M) as MethodsFactory<M>);
	const emitsFactory: EmitsFactory<E> | undefined = options.emits;

	class FormClass extends VufForm<T> {
		constructor(options?: { emits?: EmitFunctions }) {
			super(formDefinition, options);
			const parent = createParentMethods(this as unknown as AnyForm);

			// methods
			const methods = methodsFactory(parent);
			const self = this as unknown as Record<string, unknown>;
			Object.entries(methods).forEach(([name, method]) => {
				self[name] = method.bind(this);
			});

			// emits (definition-time)
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

/**
 * @deprecated Use createForm2(formDefinition, { methods }) instead.
 */
export function createForm<
	T extends Record<string, AnyFieldConfig>,
	M extends MethodRecord,
>(
	formDefinition: T,
	methodsFactory: MethodsFactory<M>,
): (options?: {
	emits?: EmitFunctions;
}) => { [K in keyof T]: T[K]['value'] } & Omit<VufFormPublicMethods, keyof M> &
	M & { __valueType?: { [K in keyof T]: T[K]['value'] } } {
	type FormValues = { [K in keyof T]: T[K]['value'] };

	class FormClass extends VufForm<T> {
		constructor(options?: { emits?: EmitFunctions }) {
			super(formDefinition, options);
			const parent = createParentMethods(this as unknown as AnyForm);
			const methods = methodsFactory(parent);
			const self = this as unknown as Record<string, unknown>;
			Object.entries(methods).forEach(([name, method]) => {
				self[name] = method.bind(this);
			});
		}
	}

	type ExtendedForm = FormValues &
		Omit<VufFormPublicMethods, keyof M> &
		M & { __valueType?: FormValues };
	const factory = (options?: { emits?: EmitFunctions }) =>
		new FormClass(options) as unknown as ExtendedForm;
	return factory;
}
