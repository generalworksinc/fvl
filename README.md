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
  - Build: `bun run build`
- 推奨運用:
  - PR で check ジョブを必須化
  - main は保護ブランチ、マージ後に publish ジョブが実行される構成
  - リリースタグ作成時は GitHub Release を発行し、必要に応じて `dist/` を同梱

