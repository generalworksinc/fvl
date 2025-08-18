import v8n from 'v8n';
import type { IVufForm } from './types';

export type ValidatorFunction = (value: any, form: IVufForm, ...args: any[]) => boolean;

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
  anyCondition: (value: any, form: IVufForm, funcName: string, message: string): boolean => {
    if (value == null || value === '') return true;
    return form.emit(funcName, value, message);
  },
  sameAs: (): boolean => {
    throw Error('sameAs is not implemented');
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
    } catch {
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


