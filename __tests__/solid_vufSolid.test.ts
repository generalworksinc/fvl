import { describe, test, expect, jest, beforeEach } from 'bun:test';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  interface Global { createEffect?: any; createSignal?: any }
}

// SolidJS の最低限モック
const effects = new Set<Function>();
(global as any).createEffect = (fn: Function) => { effects.add(fn); fn(); };
(global as any).createSignal = (initial: any) => {
  let v = initial;
  const get = () => v;
  const set = (nv: any) => { v = nv; effects.forEach((e) => e()); return nv; };
  return [get, set] as const;
};

import { VufForm, required, maxLength, isEmail, anyCondition, field } from '../src/solid/mod.ts';

describe('VufForm (solidjs/vufSolid.ts)', () => {
  function makeForm(emits: Record<string, any> = {}) {
    const model: any = {
      name: { value: '', name: '名前', validate: [required(), maxLength(50)] },
      email: { value: '', name: 'メール', validate: [required(), isEmail()] },
      age: { value: null, name: '年齢', validate: [required()], type: Number },
      description: { value: '', name: '説明', validate: [] },
    };
    return new VufForm(model, { emits });
  }

  beforeEach(() => {
    effects.clear();
  });

  describe('constructor', () => {
    test('初期化', () => {
      const form: any = makeForm();
      expect(form).toBeInstanceOf(VufForm as any);
      expect(form.name).toBe('');
      expect(form.email).toBe('');
      expect(typeof form.getKey()).toBe('number');
    });

    test('static gen が未実装の場合は例外', () => {
      class InvalidForm extends (VufForm as any) {}
      expect(() => (InvalidForm as any).gen()).toThrow();
    });
  });

  describe('基本操作', () => {
    test('get/set と Field API', () => {
      const form: any = makeForm();
      form.name = 'Alice';
      expect(form.getFieldValue('name')).toBe('Alice');
      form.setFieldValue('name', 'Bob');
      expect(form.name).toBe('Bob');
      expect(form.getFieldObject('name')).toBeDefined();
    });

    test('emit/addEmit/removeEmit', () => {
      const form: any = makeForm();
      const handler = jest.fn((v: any) => `ok:${v}`);
      form.addEmit('hello', handler);
      const ret = form.emit('hello', 1);
      expect(handler).toHaveBeenCalledWith(1);
      expect(ret).toBe('ok:1');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      form.removeEmit('hello');
      const ret2 = form.emit('hello', 2);
      expect(ret2).toBeNull();
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('JSON 取得', () => {
    test('getValueJson / getJson / getJsonHeadUpper', () => {
      const form: any = makeForm();
      form.name = 'John';
      form.email = 'john@example.com';
      form.age = 30;
      const json = form.getValueJson({});
      expect(json).toHaveProperty('name', 'John');
      expect(json).toHaveProperty('email', 'john@example.com');
      expect(json).toHaveProperty('age', 30);

      const json2 = form.getJson({});
      expect(json2.name).toBe('John');

      const upper = form.getJsonHeadUpper({});
      expect(upper).toHaveProperty('Name', 'John');
      expect(upper).toHaveProperty('Email', 'john@example.com');
    });

    test('isIgnoreBlank / format / getValueJsonStr', () => {
      const form: any = makeForm();
      form.name = 'John';
      form.email = '';
      const filtered = form.getValueJson({ isIgnoreBlank: true });
      expect(filtered).toHaveProperty('name', 'John');
      expect(filtered.email).toBeUndefined();

      const formatted = form.getValueJson({ format: (k: string) => `x_${k}` });
      expect(formatted).toHaveProperty('x_name', 'John');
      expect(formatted).not.toHaveProperty('name');

      const str = form.getValueJsonStr({});
      const obj = JSON.parse(str);
      expect(obj.name).toBe('John');
    });

    test('Number 型: 文字列→数値', () => {
      const form: any = makeForm();
      form.age = '30';
      const json = form.getValueJson({});
      expect(json.age).toBe(30);
      expect(typeof json.age).toBe('number');
    });

    test('formatValue: 配列値を処理', () => {
      const form: any = new (VufForm as any)({ tags: { value: [], name: 'タグ', validate: [] } });
      form.setData({ tags: ['a', 'b'] });
      const json = form.getValueJson({});
      expect(Array.isArray(json.tags)).toBe(true);
      expect(json.tags).toEqual(['a', 'b']);
    });
  });

  describe('バリデーション', () => {
    test('必須/Email 判定', () => {
      const form: any = makeForm();
      form.startValid();
      form.name = '';
      expect(form.isErrorField('name')).toBe(true);
      form.name = 'John';
      expect(form.isErrorField('name')).toBe(false);

      form.email = 'invalid';
      expect(form.isErrorField('email')).toBe(true);
      form.email = 'user@example.com';
      expect(form.isErrorField('email')).toBe(false);
    });

    test('anyCondition は emit を呼ぶ（値非空時）', () => {
      const emits = { custom: jest.fn(() => true) } as any;
      const form: any = new (VufForm as any)({ x: { value: 'v', validate: [anyCondition('custom', 'msg')] } }, { emits });
      form.startValid();
      expect(form.isErrorField('x')).toBe(false);
      expect(emits.custom).toHaveBeenCalledWith('v', 'msg');
    });

    test('groupIsValid', () => {
      const form: any = makeForm();
      form.startValid();
      form.name = '';
      expect(form.groupIsValid(['name'])).toBe(false);
      form.name = 'ok';
      expect(form.groupIsValid(['name'])).toBe(true);
    });
  });

  describe('validateWatch', () => {
    test('即時検証フラグで isErrorField を呼ぶ', () => {
      const form: any = makeForm();
      const spy = jest.spyOn(form, 'isErrorField');
      form.validateWatch(true);
      expect(spy).toHaveBeenCalled();

      form.name = 'Z';
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('setData（ネスト/配列/カスタム処理）', () => {
    test('ネストした VufForm を再帰的に生成', () => {
      class Child extends (VufForm as any) {
        static gen() {
          return new (Child as any)({ first: { value: '', name: 'first', validate: [required()] } });
        }
      }
      const form: any = new (VufForm as any)({ child: { value: null, name: '子', validate: [], type: Child } });
      form.setData({ child: { first: 'Taro' } });
      expect(form.getJson().child.first).toBe('Taro');
    });

    test('VufForm 配列を再帰的に生成', () => {
      class Item extends (VufForm as any) {
        static gen() { return new (Item as any)({ name: { value: '', name: 'n', validate: [] } }); }
      }
      const form: any = new (VufForm as any)({ items: { value: [], name: 'items', validate: [], type: Array, subType: Item } });
      form.setData({ items: [{ name: 'i1' }, { name: 'i2' }] });
      const json = form.getJson({});
      expect(json.items[0].name).toBe('i1');
      expect(json.items[1].name).toBe('i2');
    });

    test('keyAndFunc でカスタム処理', () => {
      const form: any = makeForm();
      const fn = jest.fn((v: any) => (form.getFieldObject('name') as any).value[1](`Custom:${v}`));
      form.setData({ name: 'John' }, { name: fn });
      expect(fn).toHaveBeenCalledWith('John');
      expect(form.name).toBe('Custom:John');
    });
  });

  describe('field ヘルパ', () => {
    test('Field 構築', () => {
      const obj: any = field({ value: 'x', name: 'X', validate: [] } as any);
      expect(obj.value).toBe('x');
      expect(obj.name).toBe('X');
    });
  });
});


