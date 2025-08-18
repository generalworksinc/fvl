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

## ビルド（tsup）について

- 目的:
  - GitHub 直接インストール時に解決できるよう、`dist/` に ESM 出力と型定義（d.ts）を用意
  - サブパス（`@generalworks/vuf/vue` 等）ごとのエントリをまとめて出力
- 実行: `bun run build`
- 補足:
  - JSR 公開のみであれば、jsr.json の `exports` が TS ソース（`src/**/mod.ts`）を指す運用も可能
  - GitHub 直導入運用では、リリースタグに `dist/` を同梱するのが安全

