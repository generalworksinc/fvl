import { watch as vueWatch } from 'vue';
import {
  getValidatorMap,
  makeRule,
  getMessages,
} from '../core/mod';

// ----------------------------
// 型定義（Vue アダプタ専用）
// ----------------------------

export type ValidateList = Array<string | [string, ...any[]]>;

export interface Validator {
  error: boolean;
  message: string;
}

export type FieldConfig<T = any, U = any> = {
  value: T;
  name?: string;
  validate?: ValidateList;
  type?: NumberConstructor | StringConstructor | DateConstructor | ArrayConstructor | any;
  subType?: U;
  [key: string]: any;
};

export interface FieldObject<T = any> extends FieldConfig<T> {
  validator?: Validator;
  [KEY_FORM]?: VufForm<any>;
  $startValid?: boolean;
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

const KEY_FORM = Symbol('$form');
const KEY_RANDOM = Symbol('$key');
const KEY_EMITS = Symbol('$emits');

const headLower = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s);
const headUpper = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

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

export class VufForm<T extends Record<string, FieldObject<any>>> {
  private _fields: T;
  private _watch: WatchFunction;

  $startValid: boolean = false;
  [KEY_RANDOM]: { value: number; name: string };
  [KEY_EMITS]: EmitFunctions;

  constructor(model: T, options?: { emits?: EmitFunctions; watchFn?: WatchFunction }) {
    const clonedModel = { ...model } as T;
    this._fields = {} as T;
    for (const key in clonedModel) {
      if (Object.prototype.hasOwnProperty.call(clonedModel, key) && clonedModel[key] !== undefined) {
        const obj = { ...(clonedModel as any)[key] } as FieldObject;
        obj.validator = { error: false, message: '' };
        obj[KEY_FORM] = this as any;
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
    this[KEY_RANDOM] = { value: randomKey(), name: '$key' };
    this[KEY_EMITS] = options?.emits || {};
    this._watch = options?.watchFn || (vueWatch as unknown as WatchFunction);
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
    return JSON.stringify(this.getValueJson(options));
  }

  getJson(options: GetValueJsonOptions = {}): Record<string, any> {
    return this.getValueJson(options);
  }

  getJsonHeadUpper(options: GetValueJsonOptions = {}): Record<string, any> {
    const newObj = this.getValueJson(options);
    const retObj: Record<string, any> = {};
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) retObj[headUpper(key)] = (newObj as any)[key];
    }
    return retObj;
  }

  getValueJson({ keys = [], exceptKeys = [], format = null, isIgnoreBlank = true }: GetValueJsonOptions): Record<string, any> {
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
    for (const key in this._fields as any) {
      if (!key.includes('$')) {
        this._watch((this._fields as any)[key], (next: any) => {
          if (isValidateImmediately || this.$startValid) this.isErrorField(key);
        });
      }
    }
  }

  startValid(): void {
    this.$startValid = true;
  }

  isErrorField(fieldName: string): boolean {
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

