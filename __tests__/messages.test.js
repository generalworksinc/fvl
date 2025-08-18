import { describe, expect, test, jest } from "bun:test";
// import messages from '../messages.js';
import messages from '../messages.ts';

describe('messages', () => {
  test('必須バリデーションメッセージが定義されている', () => {
    expect(messages.required).toBeDefined();
    expect(messages.required).toBe('※必須入力項目です。');
  });

  test('主要なバリデーションメッセージが定義されている', () => {
    // 長さ関連
    expect(messages.minLength).toBeDefined();
    expect(messages.maxLength).toBeDefined();
    expect(messages.length).toBeDefined();
    expect(messages.textLength).toBeDefined();

    // 値の大きさ関連
    expect(messages.minValue).toBeDefined();
    expect(messages.maxValue).toBeDefined();
    expect(messages.between).toBeDefined();

    // タイプ関連
    expect(messages.alpha).toBeDefined();
    expect(messages.alphaNum).toBeDefined();
    expect(messages.numeric).toBeDefined();
    expect(messages.positiveInteger).toBeDefined();
    expect(messages.email).toBeDefined();
    expect(messages.ipAddress).toBeDefined();
    expect(messages.macAddress).toBeDefined();
    expect(messages.url).toBeDefined();
    expect(messages.tel).toBeDefined();

    // 条件関連
    expect(messages.requiredIf).toBeDefined();
    expect(messages.requiredUnless).toBeDefined();
    expect(messages.sameAs).toBeDefined();
    expect(messages.anyCondition).toBeDefined();
  });

  test('プレースホルダー {param} が正しく定義されている', () => {
    expect(messages.requiredUnless).toContain('{param}');
    expect(messages.minValue).toContain('{param}');
    expect(messages.maxValue).toContain('{param}');
    expect(messages.between).toContain('{param}');
    expect(messages.alpha).toContain('{param}');
    expect(messages.alphaNum).toContain('{param}');
    expect(messages.numeric).toContain('{param}');
    expect(messages.ipAddress).toContain('{param}');
    expect(messages.macAddress).toContain('{param}');
    expect(messages.sameAs).toContain('{param}');
    expect(messages.url).toContain('{param}');
    expect(messages.requiredTos).toContain('{param}');
  });

  test('数値プレースホルダーが正しく定義されている', () => {
    expect(messages.minLength).toContain('{0}');
    expect(messages.maxLength).toContain('{0}');
    expect(messages.length).toContain('{0}');
    expect(messages.textLength).toContain('{0}');
    expect(messages.minValue).toContain('{0}');
    expect(messages.maxValue).toContain('{0}');
    expect(messages.between).toContain('{0}');
    expect(messages.between).toContain('{1}');
  });

  test('比較関連のメッセージが正しく定義されている', () => {
    expect(messages.gt).toContain('{param}');
    expect(messages.gt).toContain('{paramCompared}');
    expect(messages.ge).toContain('{param}');
    expect(messages.ge).toContain('{paramCompared}');
    expect(messages.lt).toContain('{param}');
    expect(messages.lt).toContain('{paramCompared}');
    expect(messages.le).toContain('{param}');
    expect(messages.le).toContain('{paramCompared}');
    expect(messages.gtStr).toContain('{param}');
    expect(messages.gtStr).toContain('{paramCompared}');
  });
}); 