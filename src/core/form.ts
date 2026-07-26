let nextKey = 0;

// バリデーションルールは `[ルール名, ...パラメータ]` のタプルで表す（例: ['maxLength', 50]）。
export type ValidatorRule = [string, ...any[]];
// バリデータは「必ず呼び出した結果」を validate に渡す（例: required(), maxLength(50)）。
// required のような関数参照をそのまま渡すと検証されないため、ファクトリの戻り値（ルールタプル）
// を渡す運用にし、型レベルでも関数参照の渡し漏れをコンパイルエラーにする狙いがある。
export type ValidatorRuleFactory = (...params: any[]) => ValidatorRule;
export type ValidateList = Array<string | ValidatorRule>;

export interface Validator {
	error: boolean;
	message: string;
}

// フィールド定義。value は初期値、name は表示名（メッセージ生成などで使用）。
export type FieldConfig<T = any, U = any> = {
	value: T;
	name?: string;
	validate?: ValidateList;
	// 値の型変換／ネスト構造の指定に使う「コンストラクタ」。
	//   - Number      : getValueJson 時に数値化を試みる（NaN は null にフォールバック）。
	//   - VufForm 派生 : ネストしたサブフォーム。setData で再帰生成される。
	//   - Array + subType(VufForm 派生): サブフォームの配列。要素ごとに再帰生成される。
	type?:
		| NumberConstructor
		| StringConstructor
		| DateConstructor
		| ArrayConstructor
		| any;
	// type === Array のときの要素型（VufForm 派生コンストラクタ）。
	subType?: U;
	[key: string]: any;
};

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

// フィールド値の読み書きを抽象化するアクセサ。
// core のロジックは「値がどう保持されているか（Vue の reactive な raw 値か、
// Solid の Signal タプルか）」を知らずに済むよう、必ずこの read/write 経由で
// 値に触れる。各アダプタが自分の保持方式に合わせた実装を注入する:
//   - Vue  : read = field.value           / write = (field.value = v)
//   - Solid: read = field.value[0]()      / write = field.value[1](v)
// これにより getValueJson / setData / isErrorField 等の中身を1つに統合できる。
export type FieldAccessor<TField> = {
	read(field: TField): any;
	write(field: TField, value: any): void;
};

export type CoreField = {
	validate?: ValidateList;
	validator?: Validator;
	type?: any;
	subType?: any;
	$startValid?: boolean;
	[key: string | symbol]: any;
};

type CoreForm = {
	getJson(options?: GetValueJsonOptions): Record<string, any>;
	isErrorField(fieldName: string): boolean;
	setData(data: Record<string, any>): void;
	startValid(): void;
};

type CoreFormConstructor = {
	gen(): CoreForm;
};

export const headLower = (value: string): string =>
	value ? value[0].toLowerCase() + value.slice(1) : value;

export const headUpper = (value: string): string =>
	value ? value[0].toUpperCase() + value.slice(1) : value;

/**
 * プロセス内で一意な連番キーを生成する（フォーム/フィールドの識別子に使用）。
 *
 * 旧実装は `時刻(~1e10) * 1e8 + カウンタ` を返していたが、この値は約 1e18 で
 * Number.MAX_SAFE_INTEGER(~9e15) を超え、浮動小数点の精度で下位のカウンタが
 * 丸め落ちしていた。結果、同一ミリ秒内に生成したキーが衝突する不具合があった。
 * ここでは単純な単調増加カウンタにして、値が常に安全整数かつ真に一意になるようにする。
 * 実運用でカウンタを枯渇させることはまずないが、万一超えたら黙って破綻させず明示的に throw する。
 */
export function makeRandomKey(): number {
	if (nextKey >= Number.MAX_SAFE_INTEGER) {
		throw new Error('VufForm key space exhausted');
	}
	nextKey += 1;
	return nextKey;
}

// 値を JSON 化に適した形へ整形する。
//   - 配列   : 各要素を再帰的に整形する。要素自体には型情報（field.type）が無いため、
//              空フィールド `{}` を渡して「素の値として」整形させる。
//   - VufForm: getJson() でネストを再帰的に JSON 化する。
//   - Number 型指定: 数値化し、変換できない値（NaN）は null にフォールバックする。
export function coreFormatValue<TField extends CoreField>(
	field: TField,
	value: any,
	isFormInstance: (value: unknown) => value is CoreForm,
): any {
	if (Array.isArray(value)) {
		return value.map((item) =>
			coreFormatValue({} as TField, item, isFormInstance),
		);
	}
	if (isFormInstance(value)) return value.getJson();
	if (field.type === Number) {
		const numberValue = Number(value);
		if (Number.isNaN(numberValue)) {
			console.log('Number parse error. value:', value);
			return null;
		}
		return numberValue;
	}
	return value;
}

// フィールド群から値を取り出して素の JSON オブジェクトにする。
//   - `$` 始まりの内部キーは除外する。
//   - isIgnoreBlank=true のとき、文字列フィールドの空文字は出力から除外する。
//   - VufForm はここで getJson() 済みにしておく（後段の formatValue で二重処理されないように）。
//   - 取り出した値は最後に formatValue で型整形（Number 変換や配列の再帰整形）する。
export function coreExtractData<TField extends CoreField>(
	fields: Record<string, TField>,
	accessor: FieldAccessor<TField>,
	isIgnoreBlank: boolean,
	isFormInstance: (value: unknown) => value is CoreForm,
): Record<string, any> {
	const result: Record<string, any> = {};
	for (const key of Object.keys(fields)) {
		if (key.startsWith('$')) continue;
		const field = fields[key];
		const currentValue = accessor.read(field);
		let value: any = null;
		if (isIgnoreBlank && typeof currentValue === 'string') {
			if (currentValue) value = currentValue;
		} else if (isFormInstance(currentValue)) {
			value = currentValue.getJson();
		} else if (currentValue !== null && currentValue !== undefined) {
			value = currentValue;
		}
		if (value !== null && value !== undefined) {
			result[key] = coreFormatValue(field, value, isFormInstance);
		}
	}
	return result;
}

// フォーム値を JSON 化する公開ロジック。
//   - keys 指定があればそれを対象に、無ければ全キーから exceptKeys を除いたものを対象にする。
//   - 存在しないキーは対象から外す。
//   - format 指定があれば出力キー名を変換する（例: 先頭大文字化）。
export function coreGetValueJson<TField extends CoreField>(
	fields: Record<string, TField>,
	accessor: FieldAccessor<TField>,
	options: GetValueJsonOptions,
	isFormInstance: (value: unknown) => value is CoreForm,
): Record<string, any> {
	const {
		keys = [],
		exceptKeys = [],
		format = null,
		isIgnoreBlank = true,
	} = options;
	let targetKeys =
		keys.length > 0
			? keys
			: Object.keys(fields).filter((key) => !exceptKeys.includes(key));
	targetKeys = targetKeys.filter((key) => fields[key] !== undefined);
	const selected = Object.fromEntries(
		targetKeys.map((key) => [key, fields[key]]),
	) as Record<string, TField>;
	const result = coreExtractData(
		selected,
		accessor,
		isIgnoreBlank,
		isFormInstance,
	);
	if (!format) return result;
	return Object.fromEntries(
		Object.entries(result).map(([key, value]) => [format(key), value]),
	);
}

export function coreGetJsonHeadUpper(
	value: Record<string, any>,
): Record<string, any> {
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [headUpper(key), item]),
	);
}

// 外部オブジェクト（API レスポンス等）をフォームへ流し込む。
//   - キーは headLower で整形する（例: 受信 JSON の "FirstName" → フィールド "firstName"）。
//   - フィールドの type が VufForm 派生コンストラクタなら、gen() で子フォームを生成し
//     再帰的に setData してからセットする（ネスト構造の復元）。
//   - type === Array かつ subType が VufForm 派生なら、配列の各要素を子フォームとして生成する。
//   - keyAndFunc で特定キーの代入処理を差し替えられる（整形済みキー／元キーの両方で照合）。
export function coreSetData<TField extends CoreField>(
	fields: Record<string, TField>,
	accessor: FieldAccessor<TField>,
	obj: Record<string, any> | null,
	keyAndFunc: Record<string, (value: any) => void> | undefined,
	isFormConstructor: (value: unknown) => value is CoreFormConstructor,
): void {
	if (!obj) return;
	for (const key in obj) {
		const formattedKey = headLower(key);
		// 既定の代入処理。ネスト／配列ネストを判定して適切に生成・セットする。
		let setValue = (value: any): void => {
			const field = fields[formattedKey];
			if (!field) return;
			if (value && isFormConstructor(field.type)) {
				// 単一のネストサブフォーム
				const nested = field.type.gen();
				nested.setData(value);
				accessor.write(field, nested);
			} else if (
				value &&
				Array.isArray(value) &&
				field.type === Array &&
				isFormConstructor(field.subType)
			) {
				// サブフォームの配列（要素ごとに生成して setData）
				accessor.write(
					field,
					value.map((item) => {
						const nested = field.subType.gen();
						nested.setData(item);
						return nested;
					}),
				);
			} else {
				accessor.write(field, value);
			}
		};
		// キーごとのカスタム代入処理があれば、既定処理を上書きする。
		if (keyAndFunc) {
			if (Object.hasOwn(keyAndFunc, formattedKey)) {
				setValue = keyAndFunc[formattedKey];
			} else if (Object.hasOwn(keyAndFunc, key)) {
				setValue = keyAndFunc[key];
			}
		}
		setValue(obj[key]);
	}
}

// startValid() の検証開始状態を、ネストしたサブフォーム／サブフォーム配列へ再帰伝播する。
// これを行わないと、groupIsValid(['parent.child']) やリアルタイム検証が、子側の
// $startValid=false（＝ isErrorField が即 false を返す）によって無効化されてしまう。
export function coreStartNested<TField extends CoreField>(
	fields: Record<string, TField>,
	accessor: FieldAccessor<TField>,
	isFormInstance: (value: unknown) => value is CoreForm,
): void {
	for (const field of Object.values(fields)) {
		const value = accessor.read(field);
		if (isFormInstance(value)) {
			value.startValid();
		} else if (Array.isArray(value)) {
			for (const item of value) {
				if (isFormInstance(item)) item.startValid();
			}
		}
	}
}

// 単一フィールドを検証し、エラー有無を validator に反映して返す。
//   - 検証未開始（isValidationStarted=false）なら何もせず false。
//     ※ この引数はアダプタが渡す（Vue は this.$startValid、Solid は this.$startValid[0]()）。
//   - validate 配列の各ルールを順に評価する。ルールは 'name' 文字列か ['name', ...params] タプル。
//     関数参照がそのまま入っていたら「呼び出し忘れ」なので検知して console.error し、スキップする。
//   - メッセージは辞書引き後に補間する: {param} → ルール名、{0}/{1}… → params[0]/params[1]…。
//   - バリデータ実行が例外を投げても検証全体は止めず、汎用メッセージにしてエラー扱いにする。
export function coreIsErrorField<TField extends CoreField>(
	fields: Record<string, TField>,
	accessor: FieldAccessor<TField>,
	fieldName: string,
	isValidationStarted: boolean,
	form: CoreForm,
	validators: Readonly<Record<string, (...args: any[]) => boolean>>,
	messages: Readonly<Record<string, string>>,
): boolean {
	if (!isValidationStarted) return false;
	const field = fields[fieldName];
	if (!field) {
		console.error(`isErrorField error: ${fieldName} is not found in _fields`);
		return false;
	}
	if (!field.validate) return false;
	field.validator ??= { error: false, message: '' };
	let hasError = false;
	for (const rule of field.validate) {
		// ルールから「バリデータ名」と「パラメータ列」を取り出す。
		let name = '';
		let params: any[] = [];
		if (typeof rule === 'string') {
			name = rule;
		} else if (typeof rule === 'function') {
			// 関数参照のまま渡された（required を required() と呼び出し忘れた）ケース。
			// 検証できないので知らせてスキップする。
			console.error(
				`validate error: field "${fieldName}" のバリデータに関数参照が渡されています。` +
					'required() / maxLength(n) のように呼び出した結果を渡してください。',
			);
			continue;
		} else if (rule?.length > 0) {
			[name, ...params] = rule;
		}
		const validate = validators[name];
		// メッセージ補間: {param}=ルール名、{0}{1}…=各パラメータ。辞書に無ければ汎用文言。
		let message = messages[name] ?? `Validation error: ${name}`;
		if (messages[name]) {
			message = message.replace('{param}', name);
			for (const index in params) {
				message = message.replace(`{${index}}`, params[index]);
			}
		}
		try {
			// 実際の検証。false（不合格）ならメッセージを立ててエラーにする。
			if (validate && !validate(accessor.read(field), form, ...params)) {
				field.validator.message = message;
				hasError = true;
			}
		} catch (error) {
			// バリデータ内の例外でも検証ループは止めず、汎用メッセージで継続する。
			console.error(`バリデーションエラー [${name}]:`, error);
			field.validator.message = '検証中にエラーが発生しました';
			hasError = true;
		}
	}
	field.validator.error = hasError;
	if (!hasError) field.validator.message = '';
	// このフィールドは一度検証されたことを記録（UI のエラー表示タイミング制御用）。
	field.$startValid = true;
	return hasError;
}

// 複数フィールドをまとめて検証し、全体の合否を返す。
//   - 先に startValid() を呼ぶ（＝以降エラー表示が有効になり、ネストへも伝播する）。
//   - fieldNames 未指定なら（内部キー以外の）全フィールドが対象。
//   - "parent.child" 形式のキーはネスト指定。親フィールドの値（サブフォーム）の
//     isErrorField(child) を呼んで子フィールドを検証する。
//   - 途中で false があっても全キーを評価しきる（全エラーの validator を更新するため）。
export function coreGroupIsValid<TField extends CoreField>(
	fields: Record<string, TField>,
	accessor: FieldAccessor<TField>,
	fieldNames: string[] | undefined,
	startValid: () => void,
	isErrorField: (fieldName: string) => boolean,
): boolean {
	startValid();
	const keys =
		fieldNames && fieldNames.length > 0
			? fieldNames
			: Object.keys(fields).filter((key) => !key.startsWith('$'));
	let isValid = true;
	for (const key of keys) {
		if (key.startsWith('$')) continue;
		if (key.includes('.')) {
			// ネスト指定 "parent.child": 親の値がサブフォームであれば、その子を検証する。
			try {
				const [parentKey, childKey] = key.split('.');
				const parentField = parentKey ? fields[parentKey] : undefined;
				const nested = parentField ? accessor.read(parentField) : undefined;
				if (
					nested &&
					typeof nested.isErrorField === 'function' &&
					nested.isErrorField(childKey)
				) {
					isValid = false;
				}
			} catch (error) {
				console.error(`Error processing nested field: ${key}`, error);
			}
		} else if (isErrorField(key)) {
			isValid = false;
		}
	}
	return isValid;
}
