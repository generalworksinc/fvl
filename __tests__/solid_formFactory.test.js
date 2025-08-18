import { describe, test, expect, beforeEach } from 'bun:test';

// SolidJS の最低限モック
const effects = new Set();
global.createEffect = (fn) => { effects.add(fn); fn(); };
global.createSignal = (initial) => {
  let v = initial;
  const get = () => v;
  const set = (nv) => { v = nv; effects.forEach((e) => e()); return nv; };
  return [get, set];
};

import { createForm } from '../solidjs/formFactory.ts';
import { required } from '../solidjs/vufSolid.ts';

describe('createForm (solidjs/formFactory.ts)', () => {
  beforeEach(() => { effects.clear(); });

  test('親メソッドを使って validate を実装し、拡張メソッドとして利用できる', () => {
    const factory = createForm({
      name: { value: '', name: 'Name', validate: [required()] },
      email: { value: '', name: 'Email', validate: [] },
    }, (parent) => ({
      validateAll() { return parent.groupIsValid(); },
      upperName() { parent.setFieldValue('name', String(parent.getFieldValue('name')).toUpperCase()); },
    }));

    const form = factory();
    expect(typeof form.validateAll).toBe('function');
    form.upperName();
    expect(form.name).toBe(''); // 空のため変化なし
    form.setFieldValue('name', 'john');
    form.upperName();
    expect(form.name).toBe('JOHN');

    form.startValid();
    form.setFieldValue('name', '');
    expect(form.validateAll()).toBe(false);
    form.setFieldValue('name', 'OK');
    expect(form.validateAll()).toBe(true);
  });

  test('parent.validate ラッパーの実行（createParentMethods 内の関数カバレッジ）', () => {
    const factory = createForm({
      name: { value: 'OK', name: 'Name', validate: [required()] },
    }, (parent) => ({
      run() {
        return parent.validate();
      },
    }));

    const form = factory();
    form.startValid();
    expect(form.run()).toBe(true);
  });
});


