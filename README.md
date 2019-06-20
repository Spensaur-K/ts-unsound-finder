# Mine TypeScript projects for unsafe type casts

## Dependencies
- Bash
- Git
- Node.js / NPM (latest version)
- Yarn `npm install -g yarn`
- TypeScript (latest) `npm install -g typescript`
- TS-node (latest) `npm install -g ts-node`

## Building and running

The program is contained within `index.ts` which is used by mine.bash.  
Running mine.bash will fetch the repositories from repo_list.txt and run `yarn install` if the repos folder is not present.  
After the repositories are fetched, the analysis results will be stored in `results`  
Open this file in VSCode's terminal for hyperlinked source URLs