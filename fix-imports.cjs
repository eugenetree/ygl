const fs = require('fs');
const path = require('path');

const dirs = [
  'src/modules/scrapers/search-queries',
  'src/modules/scrapers/channel-entries',
  'src/modules/scrapers/channels',
  'src/modules/scrapers/video-entries'
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');

      const basename = path.basename(dir);
      content = content.replace(/queue-orchestrator\.js/g, basename + '.queue.js');
      content = content.replace(/QueueOrchestrator/g, 'Queue');

      const importRegex = /from "((?:\.\.\/)+)([^"]+)"/g;

      content = content.replace(importRegex, (match, upPath, rest) => {
        const upCount = upPath.length / 3; // count of "../"
        const newUpCount = upCount > 1 ? upCount - 1 : 0;

        let newUpPath = '';
        if (newUpCount > 0) {
          newUpPath = '../'.repeat(newUpCount);
        } else {
          newUpPath = './';
        }
        return `from "${newUpPath}${rest}"`;
      });

      fs.writeFileSync(fullPath, content);
    }
  }
}

dirs.forEach(processDir);
console.log("Imports adjusted.");
