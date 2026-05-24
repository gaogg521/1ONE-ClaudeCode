const fs = require('fs');
const path = 'src/common/config/constants.ts';
let content = fs.readFileSync(path, 'utf8');

// Step 1: Remove ALL lines containing PASSWORD_MASK or LDAP_PASSWORD_MASK exports
const lines = content.split('\n');
const cleaned = lines.filter(line => {
  return !line.includes("export const PASSWORD_MASK = '******';") &&
         !line.includes("export const LDAP_PASSWORD_MASK = '******';");
});

// Step 2: Remove orphan comments that mention password mask
let result = cleaned.join('\n');

// Remove consecutive empty lines
result = result.replace(/\n{3,}/g, '\n\n');

// Step 3: Add a single clean declaration at the end
result = result.trimEnd() + '\n\n// ===== Enterprise Auth 常量 =====\n\n/** 密码掩码占位符，用于 UI 中隐藏真实密码（LDAP、SMTP 等） */\nexport const PASSWORD_MASK = "******";\n';

fs.writeFileSync(path, result);
console.log('Cleaned up constants.ts - removed all duplicate PASSWORD_MASK declarations');
