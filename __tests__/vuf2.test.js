import { describe, test, expect, jest } from 'bun:test';
import { VufForm, maxLength, required, anyCondition, sameAs, isEmail, field } from '../vuf2.ts';

// テスト用の watch モック
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
});


