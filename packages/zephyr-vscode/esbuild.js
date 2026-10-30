const esbuild = require('esbuild');

async function main() {
  const isWatch = process.argv.includes('--watch');

  const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: false,
    sourcemap: true,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  };

  const webviewConfig = {
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    format: 'iife',
    minify: true,
    sourcemap: true,
    platform: 'browser',
    outfile: 'dist/webview.js',
    logLevel: 'info',
  };

  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const wvCtx = await esbuild.context(webviewConfig);
    await extCtx.watch();
    await wvCtx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    console.log('Build completed successfully.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
