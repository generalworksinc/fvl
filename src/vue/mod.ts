import { watch as vueWatch } from 'vue';
import {
  getValidatorMap,
  makeRule,
  getMessages,
} from '../core/mod';

// ----------------------------
// 型定義（Vue アダプタ専用）
// ----------------------------
// 旧 vuf2.ts と同等の概念を、Vue3 向けのアダプタ層で利用するための型定義。
// コアはフレームワーク非依存だが、ここでは watch の扱いなどを含め Vue 寄りの表現を用いる。

export type ValidateList = Array<string | [string, ...any[]]>;

export interface Validator {
  error: boolean;
  message: string;
}

export type FieldConfig<T = any, U = any> = {
  value: T;
  // 表示名（メッセージ生成などで使用）
  name?: string;
  validate?: ValidateList;
  // 値の型変換のためのコンストラクタ。
  // Number を指定した場合は getValueJson 時に数値化を試みる（NaN は null にフォールバック）。
  type?: NumberConstructor | StringConstructor | DateConstructor | ArrayConstructor | any;
  subType?: U;
  [key: string]: any;
};

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

export type EmitFunction = (...args: any[]) => any;
export interface EmitFunctions { [eventName: string]: EmitFunction }

export interface GetValueJsonOptions {
  keys?: string[];
  exceptKeys?: string[];
  format?: ((key: string) => string) | null;
  isIgnoreBlank?: boolean;
}

export type WatchFunction = <T>(source: T, callback: (newValue: T, oldValue: T) => void) => void;

// ----------------------------
// 内部シンボル/ヘルパ
// ----------------------------
// ランタイム上で重複・衝突なくメタ情報を保持するため、内部キーは Symbol で付与する。

const KEY_FORM = Symbol('$form');
const KEY_RANDOM = Symbol('$key');
const KEY_EMITS = Symbol('$emits');

// 先頭のみを小文字/大文字にするユーティリティ（キー変換用）
const headLower = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s);
const headUpper = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// フォームやフィールドに割り当てるユニークなキーを生成。
// 時刻成分 + カウンタを組み合わせ、同一プロセス内での衝突を避ける。
const randomKey = (() => {
  let atomicKeyIndex = Math.floor(Math.random() * 1000000);
  const COUNTER_PART = 100000000;
  return (): number => {
    atomicKeyIndex = (atomicKeyIndex + 1) % COUNTER_PART;
    const timeComponent = Date.now() % 10000000000;
    return timeComponent * COUNTER_PART + atomicKeyIndex;
  };
})();

// ----------------------------
// VufForm（Vue アダプタ）
// ----------------------------
// 各フィールド（FieldObject）を束ねるフォームクラス。
// Object.defineProperty により form.fieldName で value にアクセスできるようにする。
// 旧 vuf2.ts と等価な挙動を保ちつつ、Vue の watch を差し替え可能にしている。

export class VufForm<T extends Record<string, FieldObject<any>>> {
  private _fields: T;
  private _watch: WatchFunction;

  $startValid: boolean = false;
  [KEY_RANDOM]: { value: number; name: string };
  [KEY_EMITS]: EmitFunctions;

  constructor(model: T, options?: { emits?: EmitFunctions; watchFn?: WatchFunction }) {
    // モデルのシャローコピーから内部フィールドを初期化
    const clonedModel = { ...model } as T;
    this._fields = {} as T;
    for (const key in clonedModel) {
      if (Object.prototype.hasOwnProperty.call(clonedModel, key) && clonedModel[key] !== undefined) {
        const obj = { ...(clonedModel as any)[key] } as FieldObject;
        // バリデーション結果の初期化とフォーム参照の付与
        obj.validator = { error: false, message: '' };
        obj[KEY_FORM] = this as any;
        // id 未指定なら自動採番
        if (!obj.id) obj.id = key + '_' + randomKey();
        (this._fields as any)[key] = obj;
        Object.defineProperty(this, key, {
          enumerable: true,
          configurable: false,
          get: () => (this._fields as any)[key]?.value,
          set: (newValue: any) => {
            if ((this._fields as any)[key]) {
              (this._fields as any)[key].value = newValue;
            } else {
              console.error(`setFieldValue error: ${key} is not found in _fields`);
            }
          },
        });
      }
    }
    // 内部キーとイベントマップを初期化
    this[KEY_RANDOM] = { value: randomKey(), name: '$key' };
    this[KEY_EMITS] = options?.emits || {};
    // watch の解決優先度: 注入 > グローバル（テスト用） > Vue の watch
    this._watch =
      options?.watchFn ||
      (((globalThis as any).watch as WatchFunction | undefined) ?? (vueWatch as unknown as WatchFunction));
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

  setData(obj: Record<string, any> | null, keyAndFunc?: Record<string, (value: any) => void>): void {
    // 外部オブジェクトを受け取り、キー整形後に各フィールドに代入。
    // 値が VufForm の場合は再帰的に setData、配列 + subType が VufForm の場合は要素ごとに生成。
    if (!obj) return;
    for (const key in obj) {
      const formattedKey = headLower(key);
      let setFunc: Function | undefined = (value: any) => {
        if (Object.prototype.hasOwnProperty.call(this._fields, formattedKey) && (this._fields as any)[formattedKey] !== undefined) {
          const thisField = (this._fields as any)[formattedKey] as FieldObject;
          if (value && thisField.type && (thisField.type as any).prototype instanceof VufForm) {
            const vufFormInstance = (thisField.type as any).gen();
            vufFormInstance.setData(value);
            thisField.value = vufFormInstance;
          } else if (value && Array.isArray(value) && thisField.type === Array && thisField.subType && (thisField.subType as any).prototype instanceof VufForm) {
            const elmArray: VufForm<any>[] = [];
            for (const elm of value) {
              const vufFormInstance = (thisField.subType as any).gen();
              vufFormInstance.setData(elm);
              elmArray.push(vufFormInstance);
            }
            thisField.value = elmArray;
          } else {
            thisField.value = value;
          }
        }
      };
      if (keyAndFunc) {
        if (Object.prototype.hasOwnProperty.call(keyAndFunc, formattedKey)) setFunc = keyAndFunc[formattedKey];
        else if (Object.prototype.hasOwnProperty.call(keyAndFunc, key)) setFunc = keyAndFunc[key];
      }
      setFunc?.(obj[key]);
    }
  }

  getValueJsonStr(options: GetValueJsonOptions = {}): string {
    // 値の抽出ロジックは getValueJson に集約し、ここでは JSON 文字列化のみを担う。
    return JSON.stringify(this.getValueJson(options));
  }

  getJson(options: GetValueJsonOptions = {}): Record<string, any> {
    // 旧 API 互換のエイリアス。実体は getValueJson。
    return this.getValueJson(options);
  }

  getJsonHeadUpper(options: GetValueJsonOptions = {}): Record<string, any> {
    // 抽出結果のキー先頭を大文字化して返却。
    const newObj = this.getValueJson(options);
    const retObj: Record<string, any> = {};
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) retObj[headUpper(key)] = (newObj as any)[key];
    }
    return retObj;
  }

  getValueJson({ keys = [], exceptKeys = [], format = null, isIgnoreBlank = true }: GetValueJsonOptions): Record<string, any> {
    // keys/exceptKeys で抽出対象を制御。値は extractData 経由で型変換（formatValue）される。
    let targetKeys: string[];
    if (keys && keys.length > 0) targetKeys = keys;
    else {
      targetKeys = Object.keys(this._fields as any);
      if (exceptKeys && exceptKeys.length > 0) targetKeys = targetKeys.filter(key => exceptKeys.indexOf(key) < 0);
    }
    const filteredObj: Record<string, FieldObject<any>> = {};
    targetKeys.forEach(key => {
      if ((this._fields as any)[key]) filteredObj[key] = (this._fields as any)[key];
    });
    const result = extractData(filteredObj, isIgnoreBlank);
    if (format) {
      const formattedResult: Record<string, any> = {};
      for (const key in result) formattedResult[format(key)] = (result as any)[key];
      return formattedResult;
    }
    return result;
  }

  validateWatch(isValidateImmediately = false): void {
    // 各フィールドの変更を watch で監視し、即時または startValid 後に検証を呼び出す。
    for (const key in this._fields as any) {
      if (!key.includes('$')) {
        this._watch((this._fields as any)[key], (next: any) => {
          if (isValidateImmediately || this.$startValid) this.isErrorField(key);
        });
      }
    }
  }

  startValid(): void {
    // 以降の変更でバリデーションを行うフラグを有効化。
    this.$startValid = true;
  }

  // 旧 vuf2.ts 互換API
  getFieldObject<K extends keyof T>(key: K): T[K] {
    return (this._fields as any)[key];
  }

  getFieldValue<K extends keyof T>(key: K): T[K] extends FieldObject<infer U> ? U : never {
    return ((this._fields as any)[key]?.value) as any;
  }

  setFieldValue<K extends keyof T>(key: K, value: T[K] extends FieldObject<infer U> ? U : never): void {
    if ((this._fields as any)[key]) {
      (this._fields as any)[key].value = value as any;
    } else {
      console.error(`setFieldValue error: ${String(key)} is not found in _fields`);
    }
  }

  getKey(): number {
    return this[KEY_RANDOM].value;
  }

  groupIsValid(fieldNames?: string[]): boolean {
    // 指定フィールド群（未指定なら全フィールド）を検証し、全体として有効かどうかを返す。
    // ネスト（"parent.child"）指定にも対応（旧 vuf2.ts 互換）。
    this.startValid();
    const keys: string[] = fieldNames && fieldNames.length > 0
      ? (fieldNames as string[])
      : Object.keys(this._fields as any).filter(key => !key.startsWith('$'));
    let isValid = true;
    for (const key of keys) {
      if (key.startsWith('$')) continue;
      if (key.indexOf('.') >= 0) {
        try {
          const [parentKey, childKey] = key.split('.');
          if (parentKey && (this._fields as any)[parentKey] && (this._fields as any)[parentKey].value) {
            const nestedForm = (this._fields as any)[parentKey].value;
            if (nestedForm && typeof nestedForm.isErrorField === 'function' && nestedForm.isErrorField(childKey)) {
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

  isErrorField(fieldName: string): boolean {
    // 単一フィールドの検証を実行し、エラー有無を返却。
    // 旧 vuf2.ts と同様に、ルール関数の取得・メッセージ差し替え・例外時の継続動作を踏襲する。
    if (!this.$startValid) return false;
    let hasError = false;
    const obj = (this._fields as any)[fieldName] as FieldObject;
    if (!obj) {
      console.error(`isErrorField error: ${fieldName} is not found in _fields`);
      return false;
    }
    const validatorList = obj.validate;
    if (!validatorList) return false;
    if (!obj.validator) obj.validator = { error: false, message: '' };

    const validators = getValidatorMap();
    const localeMessages = getMessages();

    for (const validator of validatorList) {
      let validFunc: ((...args: any[]) => boolean) | undefined = undefined;
      let validMessage: string | undefined = undefined;
      let params: any[] = [];
      let validStr = '';
      if (typeof validator === 'string') validStr = validator;
      else if (validator && (validator as any).length > 0) {
        validStr = (validator as any)[0];
        params = (validator as any).slice(1);
      }
      validFunc = validators[validStr];
      validMessage = localeMessages[validStr];
      if (validMessage) {
        validMessage = validMessage.replace('{param}', validStr);
        for (const ind in params) validMessage = validMessage.replace(`{${ind}}`, params[ind]);
      } else {
        validMessage = `Validation error: ${validStr}`;
      }
      try {
        if (validFunc && !validFunc(obj.value, this as any, ...params)) {
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
    (obj as any).$startValid = true;
    return obj.validator.error;
  }
}

// ----------------------------
// ヘルパー
// ----------------------------

// 値を JSON 化に適した形へ整形。
// 配列は要素ごとに再帰、VufForm は getJson、Number は NaN を null にフォールバック。
const formatValue = (obj: FieldObject<any>, value: any): any => {
  let retVal = value;
  if (Array.isArray(value)) {
    retVal = value.reduce((newArray: any[], currentValue: any) => {
      newArray.push(formatValue({} as FieldObject<any>, currentValue));
      return newArray;
    }, [] as any[]);
  } else if (value !== null && value !== undefined && Object.getPrototypeOf(value) instanceof VufForm) {
    retVal = (value as any as VufForm<any>).getJson();
  } else if (obj.type === Number) {
    retVal = Number(value);
    if (Number.isNaN(retVal)) {
      console.log('Number parse error. value:', value);
      retVal = null;
    }
  }
  return retVal;
};

// 抽出対象の FieldObject 群から、空文字・内部キーを除外しつつ値を取り出す。
// 取り出し後は formatValue で最終整形する。
const extractData = (formObj: Record<string, FieldObject<any>>, isIgnoreBlank = true): Record<string, any> => {
  const valueObj: Record<string, any> = {};
  Object.keys(formObj).forEach(key => {
    if (key.startsWith('$')) return;
    const obj = formObj[key];
    if (obj?.value !== undefined) {
      let value: any = null;
      if (isIgnoreBlank && typeof obj.value === 'string') {
        if (obj.value) value = obj.value;
      } else if (obj.value instanceof VufForm) {
        if (obj.value) value = obj.value.getJson();
      } else {
        if (obj.value !== null && obj.value !== undefined) value = obj.value;
      }
      if (value !== null && value !== undefined) valueObj[key] = formatValue(obj, value);
    }
  });
  return valueObj;
};

// フィールド定義ヘルパ。与えられた構成をそのまま FieldObject に昇格させる。
export function field<T>(config: FieldConfig<T>): FieldObject<T> {
  return { ...config } as FieldObject<T>;
}

// validators を [name, ...params] 形式で使いやすくするマップ
const validatorMapForForm: Record<string, (...params: any[]) => [string, ...any[]]> = {};
Object.keys(getValidatorMap()).forEach((validatorName) => {
  validatorMapForForm[validatorName] = (...params: any[]) => makeRule(validatorName)(...params) as [string, ...any[]];
});

// 代表的なものをエクスポート（全量必要なら利用側で Object から参照も可能）
export const maxLength = validatorMapForForm.maxLength!;
export const required = validatorMapForForm.required!;
export const anyCondition = validatorMapForForm.anyCondition!;
export const sameAs = validatorMapForForm.sameAs!;
export const isEmail = validatorMapForForm.isEmail!;

