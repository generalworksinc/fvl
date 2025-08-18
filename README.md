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

