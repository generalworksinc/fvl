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

## ドキュメント（TODO）

- Quick Start（Vue/Solid）
- Core API（VufForm/field/検証の流れ）
- Extend Guide（ルール追加/上書き、メッセージ辞書、ロケール切替、フォームローカル上書き）
- i18n（`@generalworks/vuf/messages/*`）
- Migration（`libs/vuf` からの移行手順）

## CI / CD

- ワークフロー: `.github/workflows/ci.yml`
- ジョブ構成:
  - check: Lint（Biome）/ Typecheck（tsc --noEmit）/ Test（bun test）/ Build（bun run build）
  - publish: main ブランチへの push で JSR へ公開（`bunx jsr publish`、OIDC 利用でシークレット不要）
- ローカルでの同等実行:
  - Lint: `bunx biome check .`
  - Typecheck: `bun run typecheck`（なければ `bunx typescript tsc --noEmit`）
  - Test: `bun test`
  - Build: `bun run build`（tsup を使用して `dist/` に ESM + d.ts を生成）
- 推奨運用:
  - PR で check ジョブを必須化
  - main は保護ブランチ、マージ後に publish ジョブが実行される構成
  - リリースタグ作成時は GitHub Release を発行し、必要に応じて `dist/` を同梱

## テスト実行（bun）

- 単体実行（特定ファイルのみ）

```bash
bun test __tests__/vuf2.test.js
```

- 全テスト実行

```bash
bun test
```

- 監視モード（変更検知）

```bash
bun test --watch
```

## カバレッジ確認（bun）

- 特定ファイルのカバレッジ

```bash
bun test --coverage __tests__/vuf2.test.js
```

- 全体カバレッジ

```bash
bun test --coverage
```

出力表の見方:
- % Funcs: 関数カバレッジ
- % Lines: 行カバレッジ
- Uncovered Line #s: 未実行行の一覧（改善の手がかり）

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
mergeMessages("ja", {
  required: "必須です。",
});

// 実行時にロケールを切替
setLocale("ja");
```

- 補足
  - バリデータ名とメッセージキーは1対1に対応（例: `required`, `maxLength`, `isEmail`）。
  - 任意ロケールを追加する場合は `setMessages("xx", yourDict)` を呼び出し、`setLocale("xx")` で選択します。

## ビルド（tsup）について

- 目的:
  - GitHub 直接インストール時に解決できるよう、`dist/` に ESM 出力と型定義（d.ts）を用意
  - サブパス（`@generalworks/vuf/vue` 等）ごとのエントリをまとめて出力
- 実行: `bun run build`
- 補足:
  - JSR 公開のみであれば、jsr.json の `exports` が TS ソース（`src/**/mod.ts`）を指す運用も可能
  - GitHub 直導入運用では、リリースタグに `dist/` を同梱するのが安全

