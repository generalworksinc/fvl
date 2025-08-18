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


