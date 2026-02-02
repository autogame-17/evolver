const { execSync } = require('child_process');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const path = require('path');
const fs = require('fs');

async function main() {
    const argv = yargs(hideBin(process.argv))
        .command('publish <skillPath>', 'Publish a skill to a remote repo', (yargs) => {
            yargs
                .positional('skillPath', { type: 'string', describe: 'Path to skill directory' })
                .option('remote', { type: 'string', describe: 'Remote Git URL', demandOption: true })
                .option('branch', { type: 'string', default: 'main', describe: 'Target branch' })
                .option('release', { type: 'boolean', default: false, describe: 'Create GitHub Release' })
                .option('tag', { type: 'string', describe: 'Tag for release (required if --release)' })
                .option('notes', { type: 'string', describe: 'Release notes' })
        })
        .demandCommand(1)
        .help()
        .argv;

    const command = argv._[0];
    if (command === 'publish') {
        const skillPath = argv.skillPath;
        const remoteUrl = argv.remote;
        const targetBranch = argv.branch;
        
        console.log(`🚀 Publishing ${skillPath} to ${remoteUrl}...`);

        try {
            // 1. Subtree Push
            const tempBranch = `release-${Date.now()}`;
            console.log(`✂️  Splitting subtree to ${tempBranch}...`);
            execSync(`git subtree split --prefix ${skillPath} -b ${tempBranch}`, { stdio: 'inherit' });
            
            console.log(`📤 Pushing to remote ${targetBranch} (Force)...`);
            execSync(`git push ${remoteUrl} ${tempBranch}:${targetBranch} --force`, { stdio: 'inherit' });
            
            console.log(`🧹 Cleaning up branch ${tempBranch}...`);
            execSync(`git branch -D ${tempBranch}`, { stdio: 'inherit' });
            
            console.log('✅ Code Sync Success!');

            // 2. GitHub Release (Optional)
            if (argv.release) {
                if (!argv.tag) {
                    console.error('❌ Error: --tag is required for release.');
                    process.exit(1);
                }
                console.log(`📦 Creating GitHub Release ${argv.tag}...`);
                
                // Use 'gh' CLI if available (assumed pre-installed in workspace)
                // Need to ensure we are targeting the REMOTE repo, not the current one.
                // gh release create <tag> --repo <url>
                
                const notes = argv.notes || `Release ${argv.tag}`;
                const ghCmd = `gh release create ${argv.tag} --repo ${remoteUrl} --title "${argv.tag}" --notes "${notes}"`;
                
                execSync(ghCmd, { stdio: 'inherit' });
                console.log('🎉 Release Created!');
            }

        } catch (e) {
            console.error(`❌ Publish Failed: ${e.message}`);
            process.exit(1);
        }
    }
}

main();
