import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/extension.ts'),
            formats: ['cjs'],
            fileName: 'extension',
        },
        rollupOptions: {
            external: ['vscode'],
            output: {
                // Provide global variables to use in the UMD build
                globals: {
                    vscode: 'vscode',
                },
            },
        },
        sourcemap: true,
        outDir: 'dist',
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
}); 