import { describe, test, expect, jest, beforeEach } from 'bun:test';
import { VufForm, maxLength, required, anyCondition, sameAs, isEmail, field } from '../vuf2.ts';

// テスト用の watch モック（Vue の watch 相当）
const watch = jest.fn((source, cb) => {
  if (typeof cb === 'function') cb(source.value, undefined);
});
global.watch = watch;

describe('VufForm (vuf2.ts)', () => {
  function makeForm(emits = {}) {
    const model = {
      name: { value: '', name: '名前', validate: [required(), maxLength(50)] },
      email: { value: '', name: 'メール', validate: [required(), isEmail()] },
      age: { value: null, name: '年齢', validate: [required()], type: Number },
      description: { value: '', name: '説明', validate: [] },
    };
    return new VufForm(model, { emits, watchFn: watch });
  }

  describe('constructor', () => {
    test('初期化', () => {
      const form = makeForm();
      expect(form).toBeInstanceOf(VufForm);
      expect(form.name).toBe('');
      expect(form.email).toBe('');
      expect(typeof form.getKey()).toBe('number');
    });

    test('static gen が未実装の場合は例外', () => {
      class InvalidForm extends VufForm {}
      expect(() => InvalidForm.gen()).toThrow();
    });
  });

  describe('setData', () => {
    test('通常オブジェクトをセット', () => {
      const form = makeForm();
      form.setData({ name: 'John', email: 'john@example.com' });
      expect(form.name).toBe('John');
      expect(form.email).toBe('john@example.com');
    });

    test('null/undefined は無視', () => {
      const form = makeForm();
      form.setData(null);
      expect(form.name).toBe('');
      // @ts-ignore
      form.setData(undefined);
      expect(form.name).toBe('');
    });

    test('keyAndFunc でカスタム処理', () => {
      const form = makeForm();
      const fn = jest.fn((v) => (form)._fields.name.value = `Custom:${v}`);
      form.setData({ name: 'John' }, { name: fn });
      expect(fn).toHaveBeenCalledWith('John');
      expect(form.name).toBe('Custom:John');
    });

    test('ネストした VufForm を再帰的に生成', () => {
      class Child extends VufForm {
        static gen() {
          return new Child({ first: { value: '', validate: [required()] } }, { watchFn: watch });
        }
      }
      const form = new VufForm({ child: { value: null, type: Child, validate: [] } }, { watchFn: watch });
      form.setData({ child: { first: 'Taro' } });
      expect((form)._fields.child.value.getJson().first).toBe('Taro');
    });

    test('VufForm 配列を再帰的に生成', () => {
      class Item extends VufForm {
        static gen() {
          return new Item({ name: { value: '', validate: [] } }, { watchFn: watch });
        }
      }
      const form = new VufForm({ items: { value: [], type: Array, subType: Item, validate: [] } }, { watchFn: watch });
      form.setData({ items: [{ name: 'item1' }, { name: 'item2' }] });
      const json = form.getJson();
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items[0].name).toBe('item1');
      expect(json.items[1].name).toBe('item2');
    });
  });

  describe('getValueJson / getJson / getJsonHeadUpper', () => {
    test('基本 JSON 化', () => {
      const form = makeForm();
      form.name = 'John';
      form.email = 'john@example.com';
      form.age = 30;
      const json = form.getValueJson({});
      expect(json).toHaveProperty('name', 'John');
      expect(json).toHaveProperty('email', 'john@example.com');
      expect(json).toHaveProperty('age', 30);
    });

    test('isIgnoreBlank=true で空文字フィルタ', () => {
      const form = makeForm();
      form.name = 'John';
      form.email = '';
      const json = form.getValueJson({ isIgnoreBlank: true });
      expect(json).toHaveProperty('name', 'John');
      expect(json.email).toBeUndefined();
    });

    test('format キー変換', () => {
      const form = makeForm();
      form.name = 'John';
      const json = form.getValueJson({ format: (k) => `x_${k}` });
      expect(json).toHaveProperty('x_name', 'John');
      expect(json).not.toHaveProperty('name');
    });

    test('getJson エイリアス', () => {
      const form = makeForm();
      const spy = jest.spyOn(form, 'getValueJson');
      form.getJson({});
      expect(spy).toHaveBeenCalled();
    });

    test('getJsonHeadUpper', () => {
      const form = makeForm();
      form.name = 'John';
      form.email = 'a@b.c';
      const json = form.getJsonHeadUpper({});
      expect(json).toHaveProperty('Name', 'John');
      expect(json).toHaveProperty('Email', 'a@b.c');
    });
  });

  describe('数値変換', () => {
    test('Number 型: 文字列→数値', () => {
      const form = makeForm();
      form.age = '30';
      const json = form.getValueJson({});
      expect(json.age).toBe(30);
      expect(typeof json.age).toBe('number');
    });

    test('Number 型: NaN は null にしログ出力', () => {
      const form = makeForm();
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      form.age = 'not-a-number';
      const json = form.getValueJson({});
      expect(json.age).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('バリデーション', () => {
    test('startValid 前は isErrorField=false', () => {
      const form = makeForm();
      expect(form.isErrorField('name')).toBe(false);
    });

    test('必須/Email 判定', () => {
      const form = makeForm();
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
      const emits = { custom: jest.fn(() => true) };
      const form = new VufForm({ x: { value: 'v', validate: [anyCondition('custom', 'msg')] } }, { emits, watchFn: watch });
      form.startValid();
      expect(form.isErrorField('x')).toBe(false);
      expect(emits.custom).toHaveBeenCalledWith('v', 'msg');
    });

    test('groupIsValid', () => {
      const form = makeForm();
      form.startValid();
      form.name = '';
      expect(form.groupIsValid(['name'])).toBe(false);
      form.name = 'ok';
      expect(form.groupIsValid(['name'])).toBe(true);
    });
  });

  describe('validateWatch', () => {
    test('即時検証フラグで isErrorField を呼ぶ', () => {
      const form = makeForm();
      const spy = jest.spyOn(form, 'isErrorField');
      form.validateWatch(true);
      expect(watch).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('field ヘルパ', () => {
    test('FieldObject を生成', () => {
      const obj = field({ value: 'x', name: 'X', validate: [] });
      expect(obj.value).toBe('x');
      expect(obj.name).toBe('X');
    });
  });

  describe('バリデータマップ（フォーム用）', () => {
    test('代表的な関数が存在し、[name,...params] を返す', () => {
      expect(required).toBeDefined();
      expect(maxLength).toBeDefined();
      expect(isEmail).toBeDefined();
      expect(anyCondition).toBeDefined();
      expect(sameAs).toBeDefined();

      expect(required()[0]).toBe('required');
      expect(maxLength(10)[0]).toBe('maxLength');
    });
  });

  describe('ユーティリティ/内部API', () => {
    test('getFieldObject / getFieldValue / setFieldValue', () => {
      const form = makeForm();
      form.name = 'Alice';
      expect(form.getFieldObject('name').value).toBe('Alice');
      expect(form.getFieldValue('name')).toBe('Alice');

      form.setFieldValue('name', 'Bob');
      expect(form.name).toBe('Bob');
    });

    test('addEmit / emit / removeEmit', () => {
      const form = makeForm();
      const handler = jest.fn((v) => `ok:${v}`);
      form.addEmit('hello', handler);
      const ret = form.emit('hello', 123);
      expect(handler).toHaveBeenCalledWith(123);
      expect(ret).toBe('ok:123');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      form.removeEmit('hello');
      const ret2 = form.emit('hello', 1);
      expect(ret2).toBeNull();
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    test('getValueJsonStr', () => {
      const form = makeForm();
      form.name = 'JsonStr';
      const str = form.getValueJsonStr({ isIgnoreBlank: false });
      const obj = JSON.parse(str);
      expect(obj.name).toBe('JsonStr');
    });
  });
});


