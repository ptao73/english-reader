// 简单的语法检查脚本
import fs from 'fs';
import path from 'path';

const filesToCheck = [
  'src/utils/textParser.js',
  'src/utils/ai.js',
  'src/db/schema.js',
  'src/components/SentenceCard.jsx',
  'src/components/Reader.jsx',
  'src/components/ArticleImport.jsx',
  'src/App.jsx',
  'src/main.jsx'
];

console.log('检查JavaScript语法...\n');

filesToCheck.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // 检查常见问题
    const issues = [];
    
    // 1. 检查保留字
    if (content.match(/\bconst\s+protected\b/)) {
      issues.push('使用了保留字 "protected" 作为变量名');
    }
    
    // 2. 检查import语句
    const imports = content.match(/^import\s+.*$/gm) || [];
    imports.forEach(imp => {
      if (imp.includes('.js') && !imp.includes('.jsx') && imp.includes('components')) {
        issues.push(`可能的错误import: ${imp}`);
      }
    });
    
    if (issues.length > 0) {
      console.log(`❌ ${file}:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log(`✅ ${file}`);
    }
  } catch (err) {
    console.log(`❌ ${file}: ${err.message}`);
  }
});

console.log('\n检查完成!');
