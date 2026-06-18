#!/usr/bin/env node

/**
 * 剧本杀游戏系统 - 自动化质量检查脚本
 * 
 * 用法：node scripts/quality-check.js <剧本目录>
 * 
 * 功能：
 * 1. JSON格式检查
 * 2. Schema验证
 * 3. 机制兼容性检查
 * 4. 生成质量报告
 */

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// 检查JSON格式
function checkJsonFormat(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    return { success: true, file: filePath };
  } catch (error) {
    return { success: false, file: filePath, error: error.message };
  }
}

// 检查必填字段
function checkRequiredFields(data, requiredFields, fileName) {
  const missing = [];
  for (const field of requiredFields) {
    if (!(field in data)) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    return { success: false, file: fileName, missing };
  }
  return { success: true, file: fileName };
}

// 检查meta.json
function checkMetaJson(filePath) {
  const requiredFields = ['id', 'title', 'theme', 'playerCount', 'difficulty', 'durationMin', 'synopsis', 'schemaVersion', 'status', 'genre'];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return checkRequiredFields(data, requiredFields, filePath);
}

// 检查characters/*.json
function checkCharacterJson(filePath) {
  const requiredFields = ['id', 'name', 'gender', 'isVictim', 'isMurderer', 'publicProfile', 'privateScript', 'objectives', 'secrets', 'timeline', 'relationships', 'visual'];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return checkRequiredFields(data, requiredFields, filePath);
}

// 检查clues.json
function checkCluesJson(filePath) {
  const requiredFields = ['id', 'title', 'content', 'visibility', 'isKey', 'pointsTo'];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(data)) {
    return { success: false, file: filePath, error: '应该是一个数组' };
  }
  for (let i = 0; i < data.length; i++) {
    const result = checkRequiredFields(data[i], requiredFields, `${filePath}[${i}]`);
    if (!result.success) return result;
  }
  return { success: true, file: filePath };
}

// 检查scenes.json
function checkScenesJson(filePath) {
  const requiredFields = ['id', 'name', 'description', 'visual'];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(data)) {
    return { success: false, file: filePath, error: '应该是一个数组' };
  }
  for (let i = 0; i < data.length; i++) {
    const result = checkRequiredFields(data[i], requiredFields, `${filePath}[${i}]`);
    if (!result.success) return result;
  }
  return { success: true, file: filePath };
}

// 检查phases.json
function checkPhasesJson(filePath) {
  const requiredFields = ['id', 'kind', 'title', 'instruction', 'participants', 'allowedActions', 'exit'];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(data)) {
    return { success: false, file: filePath, error: '应该是一个数组' };
  }
  for (let i = 0; i < data.length; i++) {
    const result = checkRequiredFields(data[i], requiredFields, `${filePath}[${i}]`);
    if (!result.success) return result;
  }
  return { success: true, file: filePath };
}

// 检查flow.json
function checkFlowJson(filePath) {
  const requiredFields = ['phases'];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return checkRequiredFields(data, requiredFields, filePath);
}

// 检查truth.json
function checkTruthJson(filePath) {
  const requiredFields = ['murdererCharIds', 'method', 'motive', 'crimeTimeline', 'solutionChain', 'reveal', 'endings'];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return checkRequiredFields(data, requiredFields, filePath);
}

// 检查机制兼容性
function checkMechanismCompatibility(scriptDir) {
  const mechanisms = [];
  const issues = [];

  // 检查是否使用了关键词触发
  const charactersDir = path.join(scriptDir, 'characters');
  if (fs.existsSync(charactersDir)) {
    const files = fs.readdirSync(charactersDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(charactersDir, file), 'utf-8'));
      if (data.keywordMemories && data.keywordMemories.length > 0) {
        mechanisms.push('keywordMemories');
        break;
      }
    }
  }

  // 检查是否使用了抉择机制
  const phasesFile = path.join(scriptDir, 'phases.json');
  if (fs.existsSync(phasesFile)) {
    const phases = JSON.parse(fs.readFileSync(phasesFile, 'utf-8'));
    for (const phase of phases) {
      if (phase.choice) {
        mechanisms.push('choice');
        break;
      }
    }
  }

  // 检查是否使用了时钟机制
  if (fs.existsSync(phasesFile)) {
    const phases = JSON.parse(fs.readFileSync(phasesFile, 'utf-8'));
    for (const phase of phases) {
      if (phase.clock) {
        mechanisms.push('clock');
        break;
      }
    }
  }

  // 检查是否使用了轮次搜查
  if (fs.existsSync(phasesFile)) {
    const phases = JSON.parse(fs.readFileSync(phasesFile, 'utf-8'));
    for (const phase of phases) {
      if (phase.maxRounds) {
        mechanisms.push('maxRounds');
        break;
      }
    }
  }

  return { mechanisms, issues };
}

// 生成质量报告
function generateReport(scriptName, results) {
  const report = {
    script: scriptName,
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    details: results
  };

  return report;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    log(colors.red, '用法：node scripts/quality-check.js <剧本目录>');
    process.exit(1);
  }

  const scriptDir = args[0];
  if (!fs.existsSync(scriptDir)) {
    log(colors.red, `目录不存在：${scriptDir}`);
    process.exit(1);
  }

  const scriptName = path.basename(scriptDir);
  log(colors.blue, `\n=== 质量检查：${scriptName} ===\n`);

  const results = [];

  // 1. JSON格式检查
  log(colors.yellow, '1. JSON格式检查');
  const jsonFiles = [
    'meta.json',
    'clues.json',
    'scenes.json',
    'phases.json',
    'flow.json',
    'truth.json'
  ];

  for (const file of jsonFiles) {
    const filePath = path.join(scriptDir, file);
    if (fs.existsSync(filePath)) {
      const result = checkJsonFormat(filePath);
      results.push(result);
      log(result.success ? colors.green : colors.red, `  ${result.success ? '✓' : '✗'} ${file}`);
      if (!result.success) {
        log(colors.red, `    错误：${result.error}`);
      }
    }
  }

  // 检查characters目录
  const charactersDir = path.join(scriptDir, 'characters');
  if (fs.existsSync(charactersDir)) {
    const files = fs.readdirSync(charactersDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(charactersDir, file);
      const result = checkJsonFormat(filePath);
      results.push(result);
      log(result.success ? colors.green : colors.red, `  ${result.success ? '✓' : '✗'} characters/${file}`);
      if (!result.success) {
        log(colors.red, `    错误：${result.error}`);
      }
    }
  }

  // 2. Schema验证
  log(colors.yellow, '\n2. Schema验证');
  const metaFile = path.join(scriptDir, 'meta.json');
  if (fs.existsSync(metaFile)) {
    const result = checkMetaJson(metaFile);
    results.push(result);
    log(result.success ? colors.green : colors.red, `  ${result.success ? '✓' : '✗'} meta.json`);
    if (!result.success) {
      log(colors.red, `    缺少字段：${result.missing.join(', ')}`);
    }
  }

  // 3. 机制兼容性检查
  log(colors.yellow, '\n3. 机制兼容性检查');
  const mechanismResult = checkMechanismCompatibility(scriptDir);
  log(colors.blue, `  使用的机制：${mechanismResult.mechanisms.join(', ') || '无'}`);
  if (mechanismResult.issues.length > 0) {
    log(colors.red, `  问题：${mechanismResult.issues.join(', ')}`);
  }

  // 生成报告
  const report = generateReport(scriptName, results);
  const reportFile = path.join(scriptDir, 'quality-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  // 输出总结
  log(colors.blue, `\n=== 检查完成 ===`);
  log(colors.green, `通过：${report.summary.passed}`);
  log(colors.red, `失败：${report.summary.failed}`);
  log(colors.blue, `报告已保存：${reportFile}`);

  // 如果有失败，退出码为1
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main();
