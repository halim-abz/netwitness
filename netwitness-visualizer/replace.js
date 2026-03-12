import fs from 'fs';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/dark:focus:ring-cyan-500/g, 'dark:focus:ring-[#BE3B37]');
  content = content.replace(/dark:text-cyan-600/g, 'dark:text-[#BE3B37]');
  content = content.replace(/dark:text-cyan-500/g, 'dark:text-[#BE3B37]');
  content = content.replace(/dark:text-cyan-400/g, 'dark:text-[#BE3B37]');
  content = content.replace(/dark:hover:bg-cyan-900\/30/g, 'dark:hover:bg-[#BE3B37]\/20');
  content = content.replace(/dark:hover:border-cyan-500/g, 'dark:hover:border-[#BE3B37]\/50');
  fs.writeFileSync(filePath, content, 'utf8');
}

['src/components/Sidebar.tsx', 'src/components/DetailsPanel.tsx', 'src/components/GlobeView.tsx'].forEach(replaceInFile);
