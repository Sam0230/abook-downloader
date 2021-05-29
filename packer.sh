#!/bin/bash
npm i --save-dev rollup --save-dev @rollup/plugin-node-resolve --save-dev @rollup/plugin-commonjs --save-dev @rollup/plugin-json --save-dev uglify-js --save-dev pkg --save-dev
npm i --save progress request string-width performance-now
rm -rf binary
mkdir binary
pushd binary
npx rollup ../abook-downloader.js --format cjs -p node-resolve,commonjs,json 2>/dev/null | sed -E 's/^util\$g.inherits\(PrivateKey\$4\, Key\$5\);$//' | npx uglify-js -m eval=true,v8=true -c -e >abook-downloader.bundle.min.js
cat >executeJS.js <<END
let vm = require("vm"), zlib = require("zlib");
let file = module.filename = process.argv.splice(2, 1)[0];
let decompress = function (n) {
	// return zlib.brotliDecompressSync(n);
	return n;
};
let moduleFunction = vm.runInThisContext('(function(a,b,c){return c.compileFunction(a,["exports","require","module","__filename","__dirname"],{filename:b});})')(decompress(require("fs").readFileSync(file)).toString(), module.filename, vm);
/*
let moduleFunction = vm.runInThisContext('(function (code, filename, vm) { \
	return vm.compileFunction(code, ["exports", "require", "module", "__filename", "__dirname"], { \
		filename: filename \
	}); \
})')(decompress(require("fs").readFileSync(file)).toString(), module.filename, vm);
*/
moduleFunction(module.exports, module.require, module, file, __dirname);
END
npx pkg --public -t node16-mac-arm64 executeJS.js -o node-mac-arm64
codesign --remove-signature node-mac-arm64
echo -e '#!/bin/bash\nmkdir -p ~/Desktop/Abook; cd ~/Desktop/Abook; xattr -c "$(dirname "$0")"/node-mac-arm64; codesign -fs - "$(dirname "$0")"/node-mac-arm64 >/dev/null 2>/dev/null; "$(dirname "$0")"/node-mac-arm64 "$(dirname "$0")"/abook-downloader.bundle.min.js' >launch-mac-arm64.sh
chmod +x launch-mac-arm64.sh
zip 'macOS on Apple Silicon.zip' launch-mac-arm64.sh node-mac-arm64 abook-downloader.bundle.min.js
npx pkg --public -t node16-mac-x64 executeJS.js -o node-mac-x64
codesign --remove-signature node-mac-x64
echo -e '#!/bin/bash\nmkdir -p ~/Desktop/Abook; cd ~/Desktop/Abook; xattr -c "$(dirname "$0")"/node-mac-x64; codesign -fs - "$(dirname "$0")"/node-mac-arm64 >/dev/null 2>/dev/null; "$(dirname "$0")"/node-mac-x64 "$(dirname "$0")"/abook-downloader.bundle.min.js' >launch-mac-x64.sh
chmod +x launch-mac-arm64.sh
zip 'macOS on Intel CPU.zip' launch-mac-x64.sh node-mac-x64 abook-downloader.bundle.min.js
npx pkg --public -t node16-windows-arm64 executeJS.js -o node-windows-arm64.exe
echo -e '@ECHO OFF\r\nMD "%USERPROFILE%\\Desktop\\Abook" >NUL 2>NUL\r\nCD /D "%USERPROFILE%\\Desktop\\Abook"\r\nSET NODE_SKIP_PLATFORM_CHECK=1\r\n"%~DP0\\node-windows-arm64.exe" "%~DP0\\abook-downloader.bundle.min.js"' >launch-windows-arm64.bat
zip 'virtualized Windows on Mac with Apple Silicon.zip' launch-windows-arm64.bat node-windows-arm64.exe abook-downloader.bundle.min.js
npx pkg --public -t node16-windows-x64 executeJS.js -o node-windows-x64.exe
echo -e '@ECHO OFF\r\nMD "%USERPROFILE%\\Desktop\\Abook" >NUL 2>NUL\r\nCD /D "%USERPROFILE%\\Desktop\\Abook"\r\nSET NODE_SKIP_PLATFORM_CHECK=1\r\n"%~DP0\\node-windows-x64.exe" "%~DP0\\abook-downloader.bundle.min.js"' >launch-windows-x64.bat
zip 'Windows on x86 CPU.zip' launch-windows-x64.bat node-windows-x64.exe abook-downloader.bundle.min.js
popd
# rm package-lock.json package.json
# rm -r node_modules