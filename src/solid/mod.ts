import { getValidatorMap, getMessages, makeRule } from '../core/mod';

// ----------------------------
// 型定義（Solid アダプタ専用）
// ----------------------------
// Solid では値は Signal（[get, set]）で表現する前提だが、
// ここではアダプタ層としてフォーム構造とAPIの整合を保つことに集中する。

export type ValidateList = Array<string | [string, ...any[]]>;

export interface Validator { error: boolean; message: string }

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
  id?: string;
}

// NOTE: Solid の完全適合は別実装（vufSolid.ts）に任せ、本アダプタはコアAPIのブリッジのみを担う。
// 互換のため、代表的な validator マップを [name, ...params] 形式で提供する。

const validatorMapForForm: Record<string, (...params: any[]) => [string, ...any[]]> = {};
Object.keys(getValidatorMap()).forEach((validatorName) => {
  validatorMapForForm[validatorName] = (...params: any[]) => makeRule(validatorName)(...params) as [string, ...any[]];
});

export const maxLength = validatorMapForForm.maxLength!;
export const required = validatorMapForForm.required!;
export const anyCondition = validatorMapForForm.anyCondition!;
export const sameAs = validatorMapForForm.sameAs!;
export const isEmail = validatorMapForForm.isEmail!;

// 将来の Solid 用 VufForm は vufSolid.ts をベースに導入予定。
// ここでは占位の型/エクスポートのみ。
export const solidAdapterReady = true;

