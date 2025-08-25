# リポジトリ運用ガイドライン

## プロジェクト構成とモジュール
- ソース: `src/core`（validators, messages）、`src/vue`、`src/solid`。
- メッセージ辞書: `src/core/messages/{ja,en}.ts`（`@generalworks/vuf/messages/{ja,en}` から読み込み）。
- テスト: `__tests__/**/*.test.ts`（`bun:test`）。
- ビルド成果物: `dist/`（tsup により ESM + d.ts）。
- 主要エントリ: `core/mod.ts`、`vue/mod.ts`、`solid/mod.ts`（サブパスエクスポート）。

## ビルド・テスト・開発
- 依存インストール: `bun install`。
- Lint/Format: `bunx biome check .`（自動修正は `--apply`）。
- 型チェック: `bun run typecheck`。
- テスト: `bun test`、監視: `bun test --watch`、カバレッジ: `bun test --coverage`。
- ビルド: `bun run build`（tsup → `dist/`）。
- JSR ドライラン: `bun run jsr:check`、公開: `bunx jsr publish`。

## コーディング規約と命名
- 言語: TypeScript（ESM、`"type": "module"`）。
- フォーマッタ/リンタ: Biome（シングルクォート、`dist/` と `node_modules/` は除外）。
- インデント: Biome 既定（概ね 2 スペース）。PR 前にフォーマッタ実行。
- ファイル命名: 公開エントリは `mod.ts`、メッセージはロケール別（`ja.ts` / `en.ts`）。
- 境界: フレームワーク非依存の処理は `core/` に集約。`vue/`/`solid/` は `core/` に依存を漏らさない。`vue`/`solid-js` は optional peer でバンドル除外。

## テスト方針
- ランナー: `bun:test`（TypeScript）。
- 位置/パターン: `__tests__/*.test.ts`。
- インポート: ビルド前の挙動確認のためソース参照（例: `../src/vue/mod.ts`）。
- カバレッジ: `bun test --coverage` を推奨。新機能・不具合には狙い撃ちのテストを追加。

## コミット／PR ガイドライン
- コミット: 簡潔で命令形（例: `update solid import`, `bump ver`）。関連変更はまとめる。
- PR 前チェック: lint・型チェック・テスト・ビルドをローカル実行。
- PR 説明: 目的/理由、影響範囲（`core/`/`vue`/`solid`）、挙動変更、関連 issue（例: `Closes #123`）。
- UX 影響時は最小再現やスクショを添付。

## アーキテクチャ補足
- Core は validator/message レジストリと i18n ヘルパを提供。
- 各アダプタは Vue/Solid 向け `VufForm` を提供し、validator を `[name, ...params]` 形式にマップ。
- tsup は ESM と型定義を出力し、JSR の exports は TS 消費者向けに `src/` を指す運用。
