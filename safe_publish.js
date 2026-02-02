const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const skillPath = process.argv[2];
if (!skillPath) {
    console.error('Usage: node safe_publish.js <skill-path>');
    process.exit(1);
}

const fullPath = path.resolve(process.cwd(), skillPath);
const pkgPath = path.join(fullPath, 'package.json');

if (!fs.existsSync(pkgPath)) {
    console.log(`ℹ️ No package.json in ${skillPath}, skipping ClawHub publish.`);
    process.exit(0);
}

// 1. Check Auth & CLI Availability
console.log('🔍 Checking ClawHub authentication...');
try {
    execSync('which clawhub', { stdio: 'ignore' });
} catch (e) {
    console.log('⚠️ ClawHub CLI not found. Skipping publish.');
    process.exit(0);
}

try {
    execSync('clawhub whoami', { stdio: 'ignore' });
} catch (e) {
    console.log('⚠️ ClawHub Auth Missing (Unauthorized). Skipping publish.');
    console.log('   👉 Run `clawhub login` in the terminal to enable auto-publishing.');
    process.exit(0); // Exit cleanly so we don't break the chain
}

// 2. Bump Version
let originalContent = '';
try {
    originalContent = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(originalContent);
    
    if (!pkg.version) {
        throw new Error('No version field in package.json');
    }

    const versionParts = pkg.version.split('.').map(Number);
    if (versionParts.some(isNaN)) {
         throw new Error(`Invalid version format: ${pkg.version}`);
    }
    
    versionParts[2] += 1; // Patch bump
    pkg.version = versionParts.join('.');
    
    // Write with newline at EOF
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`✅ Bumped version to ${pkg.version}`);
} catch (e) {
    console.error(`❌ Failed to bump version: ${e.message}`);
    process.exit(1);
}

// 3. Publish
try {
    console.log(`🚀 Publishing ${skillPath}...`);
    execSync(`clawhub publish "${skillPath}"`, { stdio: 'inherit' });
    console.log('✅ Publish complete.');
} catch (e) {
    console.error(`❌ Publish failed: ${e.message}`);
    // Optional: Revert version on failure? 
    // For now, we leave it as the file is already modified on disk.
    // Restoring original content might interfere with git flow if not careful.
    process.exit(1);
}
