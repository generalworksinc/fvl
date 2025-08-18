/**
 * Build configuration for library bundling.
 *
 * Purpose of tsup in this project:
 * - Produce ESM outputs and d.ts into `dist/` for GitHub 直接インストール（package.json の exports は dist を指す）
 * - JSR 公開だけであれば必須ではない（jsr.json の exports は TS ソースを指す運用も可）
 * - サブパスエクスポート（core/vue/solid/messages）に対応したエントリ分割
 *
 * 実行方法:
 * - ローカル/CI: `bun run build`（package.json の build スクリプト）
 * - リリース時: タグに dist を同梱すると GitHub 直導入が安定
 */
import { defineConfig } from 'tsup';

export default defineConfig({
	entry: {
		'core/index': 'src/core/mod.ts',
		'vue/index': 'src/vue/mod.ts',
		'solid/index': 'src/solid/mod.ts',
		'messages/ja': 'src/core/messages/ja.ts',
		'messages/en': 'src/core/messages/en.ts',
	},
	format: ['esm'],
	dts: true,
	sourcemap: false,
	clean: true,
	outDir: 'dist',
	target: 'es2022',
	splitting: false,
	minify: false,
});


