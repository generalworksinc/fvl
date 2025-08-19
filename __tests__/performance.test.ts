import { describe, expect, test, beforeEach } from "bun:test";
import { VufForm } from '../src/vue/mod.ts';

// パフォーマンステスト用の大きなフォームクラス
class LargeForm extends (VufForm as any) {
  static gen() {
    const model: any = {};
    
    // 多数のフィールドを持つフォームを生成
    for (let i = 0; i < 100; i++) {
      (model as any)[`field${i}`] = {
        value: '',
        validate: []
      };
    }
    
    return new (LargeForm as any)(model);
  }
}

// ネストされたフォームを持つ大きなフォームクラス
class NestedLargeForm extends (VufForm as any) {
  static gen() {
    const model: any = {};
    
    // 多数のネストされたフォームを持つフォームを生成
    for (let i = 0; i < 20; i++) {
      (model as any)[`nestedForm${i}`] = {
        value: {},
        $form: (LargeForm as any).gen()
      };
    }
    
    return new (NestedLargeForm as any)(model);
  }
}

describe('VufForm Performance Tests', () => {
  describe('Large Form Performance', () => {
    let largeForm: any;
    
    beforeEach(() => {
      largeForm = (LargeForm as any).gen();
    });
    
    test('getJson performance for large form', () => {
      const startTime = performance.now();
      
      // 100回実行して平均を取る
      for (let i = 0; i < 100; i++) {
        largeForm.getJson();
      }
      
      const endTime = performance.now();
      const averageTime = (endTime - startTime) / 100;
      
      console.log(`Average getJson execution time: ${averageTime.toFixed(3)}ms`);
      
      // パフォーマンス基準を設定（例: 5ms以下であること）
      expect(averageTime).toBeLessThan(5);
    });
    
    // validateWatchはVueのwatchに依存しているため、モックなしではテストできない
    // 代わりにgroupIsValidのパフォーマンスをテストする
    test('groupIsValid performance for large form', () => {
      const startTime = performance.now();
      
      // 100回実行して平均を取る
      for (let i = 0; i < 100; i++) {
        largeForm.groupIsValid();
      }
      
      const endTime = performance.now();
      const averageTime = (endTime - startTime) / 100;
      
      console.log(`Average groupIsValid execution time: ${averageTime.toFixed(3)}ms`);
      
      // パフォーマンス基準を設定（例: 10ms以下であること）
      expect(averageTime).toBeLessThan(10);
    });
  });
  
  describe('Nested Form Performance', () => {
    let nestedLargeForm: any;
    
    beforeEach(() => {
      nestedLargeForm = (NestedLargeForm as any).gen();
    });
    
    test('getJson performance for nested form', () => {
      const startTime = performance.now();
      
      // 50回実行して平均を取る
      for (let i = 0; i < 50; i++) {
        nestedLargeForm.getJson();
      }
      
      const endTime = performance.now();
      const averageTime = (endTime - startTime) / 50;
      
      console.log(`Average getJson execution time for nested form: ${averageTime.toFixed(3)}ms`);
      
      // パフォーマンス基準を設定（例: 20ms以下であること）
      expect(averageTime).toBeLessThan(20);
    });
  });
  
  describe('Memory Usage Tests', () => {
    test('memory usage for creating many forms', () => {
      const forms: any[] = [];
      const startTime = performance.now();
      
      // 1000個のフォームを作成
      for (let i = 0; i < 1000; i++) {
        forms.push((LargeForm as any).gen());
      }
      
      const endTime = performance.now();
      console.log(`Time to create 1000 large forms: ${(endTime - startTime).toFixed(3)}ms`);
      
      // フォームの数を確認
      expect(forms.length).toBe(1000);
      
      // メモリリークを防ぐためにフォームを解放
      forms.length = 0;
    });
  });
  
  describe('Stress Tests', () => {
    test('rapid form data setting', () => {
      const form: any = (LargeForm as any).gen();
      const startTime = performance.now();
      
      // フォームのデータを1000回更新（setDataを使用）
      for (let i = 0; i < 1000; i++) {
        const data: any = {};
        for (let j = 0; j < 100; j++) {
          (data as any)[`field${j}`] = `value-${i}-${j}`;
        }
        form.setData(data);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`Time for 1000 form data updates: ${totalTime.toFixed(3)}ms`);
      console.log(`Average time per update: ${(totalTime / 1000).toFixed(3)}ms`);
      
      // パフォーマンス基準を設定（例: 1回の更新あたり1ms以下であること）
      expect(totalTime / 1000).toBeLessThan(1);
    });
  });
}); 