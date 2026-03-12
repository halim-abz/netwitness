import fs from 'fs';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/dark:bg-blue-900\/30/g, 'dark:bg-[#BE3B37]\/20');
  content = content.replace(/dark:text-blue-400/g, 'dark:text-[#BE3B37]');
  content = content.replace(/text-blue-600/g, 'text-[#BE3B37]');
  content = content.replace(/focus:ring-blue-500/g, 'focus:ring-[#BE3B37]');
  content = content.replace(/bg-blue-100/g, 'bg-[#BE3B37]\/10');
  content = content.replace(/dark:bg-blue-900\/40/g, 'dark:bg-[#BE3B37]\/20');
  content = content.replace(/text-blue-700/g, 'text-[#BE3B37]');
  content = content.replace(/dark:text-blue-300/g, 'dark:text-[#BE3B37]');
  content = content.replace(/hover:text-blue-500/g, 'hover:text-[#BE3B37]');
  fs.writeFileSync(filePath, content, 'utf8');
}

['src/App.tsx', 'src/components/Sidebar.tsx', 'src/components/DetailsPanel.tsx', 'src/components/GlobeView.tsx', 'src/components/NetworkGraph.tsx'].forEach(replaceInFile);
