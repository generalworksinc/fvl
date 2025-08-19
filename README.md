# @generalworks/vuf

フォームバリデーション基盤（コア + Vue/Solid アダプタ）。JSR で配布し、Bun で利用できます。

## インストール（JSR）

```bash
bunx jsr add @generalworks/vuf@^1
bun install
```

## 使い方（例）

```ts
// Vue/Nuxt
import { VufForm, field } from "@generalworks/vuf/vue";

// Solid/SolidStart
import { VufForm, field } from "@generalworks/vuf/solid";

// Core API（拡張）
import { registerValidator, setMessages, setLocale } from "@generalworks/vuf";
```

## i18n & Messages

- ロケール別辞書の取り込み（サブパス）

```ts
import ja from "@generalworks/vuf/messages/ja";
import en from "@generalworks/vuf/messages/en";
```

- ロケール切替 / 辞書登録・拡張

```ts
import { setLocale, setMessages, mergeMessages } from "@generalworks/vuf";

// 既定ロケールの登録（必要に応じて）
setMessages("ja", ja);
setMessages("en", en);

// 部分的な上書き（例: 表記ゆれの調整）
mergeMessages("ja", { required: "必須です。" });

// 実行時にロケールを切替
setLocale("ja");
```

- 補足
  - バリデータ名とメッセージキーは1対1に対応（例: `required`, `maxLength`, `isEmail`）。
  - 任意ロケールを追加する場合は `setMessages("xx", yourDict)` を呼び出し、`setLocale("xx")` で選択します。

## Vue の watch 解決ポリシー

- 解決順序（Vue アダプタの `validateWatch` などで使用する監視関数）
  1. `new VufForm(model, { watchFn })` で注入された `watchFn`
  2. `globalThis.watch`
  3. 監視なし（no-op）
- Nuxt での推奨設定例（グローバル注入）

```ts
// plugins/watch.global.ts
import { watch } from 'vue';
export default defineNuxtPlugin(() => {
  (globalThis as any).watch = watch;
});
```

- 補足
  - ライブラリは Vue を直接 import しません。Solid だけ使う場合に Vue が依存に入らないようにするためです。
  - 監視が設定されていない場合でも他機能は動作します（必要なら `watchFn` を明示注入してください）。

## Solid の監視ポリシー

- 解決方針（Solid アダプタの `validateWatch`）
  - フィールド値は Signal `[get, set]` で保持
  - 監視は `globalThis.createEffect` を使用して購読
  - したがって、実行環境で `createEffect`/`createSignal` を提供する必要があります
- SolidStart 等での簡易設定例（グローバル注入）

```ts
// entry file or a setup module
import { createEffect, createSignal } from 'solid-js';
(globalThis as any).createEffect = createEffect;
(globalThis as any).createSignal = createSignal;
```

- 補足
  - 通常のSolid環境（SolidStart）では上記は不要です。テスト等のスタンドアロン環境で必要に応じて注入してください。

## 開発者ガイド（Bun / Biome / TypeScript）

- Lint/Format（Biome）
  - 全体: `bunx biome check .`
  - 自動修正: `bunx biome check . --apply`
- 型チェック（TypeScript）
  - `bun run typecheck`（`tsc --noEmit`）
- テスト（bun test）
  - 全体: `bun test`
  - 監視: `bun test --watch`
  - カバレッジ: `bun test --coverage`
- ビルド（GitHub 直導入向けに dist/ 出力）
  - 実行: `bun run build`（tsupで ESM + d.ts を `dist/` へ）
  - 目的: GitHub 直接インストール対応、サブパスごとのエントリをまとめて出力
  - 補足: JSR 公開のみなら jsr.json の `exports` が TS ソース（`src/**/mod.ts`）を指す運用も可
- 公開（JSR）
  - 事前チェック: `bun run jsr:check`（JSRドライラン）
  - ドライラン直実行: `bunx jsr publish --dry-run`
  - 本番公開: `bunx jsr publish`
- 規約/補足
  - テストは TypeScript（`__tests__/**/*.test.ts`）で記述
  - テストの import はソース直参照（例: `../src/vue/mod.ts`）
  - フレームワーク依存（Vue/Solid）は optional peerDependencies

## CI / CD（概要）

- ワークフロー: `.github/workflows/ci.yml`
- ジョブ構成:
  - check: Lint / Typecheck / Test / Build / JSRドライラン（`bun run jsr:check`）
  - publish: main への push で JSR へ公開（`bunx jsr publish`、OIDC 利用でシークレット不要）
- 推奨運用:
  - PR で check ジョブを必須化
  - main は保護ブランチ、マージ後に publish ジョブが実行される構成
  - リリースタグ作成時は GitHub Release を発行し、必要に応じて `dist/` を同梱

