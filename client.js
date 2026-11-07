/**
 * Browser half of Prompt Ledger.
 *
 * Registers the left-sidebar entry and the main panel. Plain JavaScript, no
 * build step. Every visible string goes through ctx.locale; every surface uses
 * the host's --dsw-alias-* tokens so light/dark follow the application.
 */
window.__ModuleLoader__.load({
  id: '@local/prompt-ledger',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const {
      useCallback, useEffect, useMemo, useRef, useState,
    } = React;

    const NS = 'prompt-ledger';

    /* ------------------------------------------------------------------ */
    /* Locale                                                              */
    /* ------------------------------------------------------------------ */

    const ZH = {
      'panel.title': '提示词账本',
      'panel.subtitle': '本地 SQLite · 全链路复盘',
      'nav.overview': '总览',
      'nav.prompts': '提示词',
      'nav.analytics': '效果分析',
      'nav.connect': '接入与设置',
      'action.refresh': '刷新',
      'action.export': '导出 CSV',
      'action.retry': '重试',
      'action.close': '关闭',
      'action.copy': '复制',
      'action.copied': '已复制',
      'state.loading': '正在读取本地账本…',
      'state.error': '读取失败',
      'state.empty': '还没有记录',
      'state.emptyHint': '在任意会话里提交第一条提示词后，这里会自动出现。',
      'foot.local': '数据仅存本机 · SQLite WAL · SHA-256 链式校验',
      'kpi.prompts': '提示词',
      'kpi.rating': '人工均分',
      'kpi.success': '完成率',
      'kpi.tokens': '总 Token',
      'kpi.tools': '工具调用',
      'kpi.auto': '自动均分',
      'kpi.rated': '已评分',
      'kpi.runs': '次运行',
      'kpi.noRating': '暂无评分',
      'overview.trend': '最近 14 天',
      'overview.trendHint': '柱：提示词数 · 线：Token',
      'overview.insights': '复盘提示',
      'overview.models': '模型表现',
      'overview.recent': '最近提示词',
      'overview.viewAll': '查看全部',
      'overview.noModels': '暂无模型数据',
      'overview.topTools': '常用工具',
      'overview.insight.bestModel': '最佳模型：{model}，人工均分 {rating}（{count} 次）',
      'overview.insight.toolErrors': '工具 {tool} 失败率偏高：{errors}/{calls}',
      'overview.insight.lowRated': '最近有 {count} 条低分记录，建议回看提示词与工具组合。',
      'overview.insight.highRated': '最近有 {count} 条高分记录，可作为模板复用。',
      'overview.insight.empty': '提交提示词后，这里会生成复盘信号。',
      'overview.insight.avgTokens': '平均每条消耗 {avg} Token。',
      'prompts.search': '搜索提示词、结果、标签…',
      'prompts.filter.range': '时间',
      'prompts.filter.platform': '平台',
      'prompts.filter.model': '模型',
      'prompts.filter.tool': '工具',
      'prompts.filter.rating': '最低评分',
      'prompts.filter.all': '全部',
      'prompts.filter.platformAll': '全部平台',
      'prompts.filter.modelAll': '全部模型',
      'prompts.filter.toolAll': '全部工具',
      'prompts.filter.anyRating': '不限',
      'prompts.sort.newest': '最新优先',
      'prompts.sort.rating': '评分优先',
      'prompts.sort.tokens': 'Token 优先',
      'prompts.sort.auto': '自动分优先',
      'prompts.count': '{count} 条记录',
      'prompts.loadMore': '加载更多',
      'prompts.selected': '已选',
      'prompts.detail': '提示词详情',
      'prompts.prompt': '提示词',
      'prompts.response': '执行结果',
      'prompts.metadata': '元数据',
      'prompts.evaluation': '双评闭环',
      'prompts.autoEval': '自动评分',
      'prompts.humanEval': '人工评分',
      'prompts.toolsUsed': '工具与会话',
      'prompts.noResponse': '暂无最终回答',
      'prompts.noTools': '未调用工具',
      'prompts.rateHint': '点亮星级即可保存人工评分',
      'prompts.notePlaceholder': '复盘备注：哪里好、哪里可以更好…',
      'prompts.saveNote': '保存备注',
      'prompts.tagsPlaceholder': '标签，用逗号分隔',
      'prompts.saveTags': '保存标签',
      'prompts.favorite': '收藏',
      'prompts.favorited': '已收藏',
      'prompts.audit': '审计链',
      'prompts.auditHint': '{count} 个事件，链头 {hash}',
      'prompts.submissions': '{count} 次提交',
      'prompts.dimensions': '个维度',
      'prompts.rubricVersion': '评估体系 v{version}',
      'prompts.autoNone': '尚未生成自动评分',
      'prompts.modelMeta': '{provider} / {model}',
      'prompts.turn': '第 {turn} 轮',
      'prompts.noDetail': '从左侧选择一条提示词查看完整复盘',
      'prompts.submissionsLabel': '原始提交',
      'prompts.auditShow': '查看事件',
      'prompts.auditHide': '收起事件',
      'status.completed': '完成',
      'status.failed': '失败',
      'status.aborted': '中止',
      'status.interrupted': '中断',
      'status.running': '进行中',
      'status.pending': '待处理',
      'metric.input': '输入',
      'metric.output': '输出',
      'metric.total': '总计',
      'metric.cache': '缓存读',
      'metric.reasoning': '推理',
      'metric.latency': '耗时',
      'metric.toolCalls': '工具调用',
      'metric.tools': '工具',
      'metric.errors': '错误',
      'metric.tokens': 'Token',
      'metric.success': '成功率',
      'metric.rating': '人工评分',
      'metric.auto': '自动评分',
      'metric.runs': '运行',
      'metric.model': '模型',
      'metric.tool': '工具',
      'metric.combo': '组合',
      'metric.avg': '平均',
      'analytics.title': '多维交叉分析',
      'analytics.models': '模型',
      'analytics.tools': '工具',
      'analytics.skills': 'Skill',
      'analytics.mcp': 'MCP',
      'analytics.combos': '最佳组合',
      'analytics.distribution': '人工评分分布',
      'analytics.calibration': '双评校准',
      'analytics.calibrationHint': '按自动分分组的人工均分；越接近对角线越一致。',
      'analytics.noCalibration': '需要同时有人工评分与自动评分的数据。',
      'analytics.empty': '当前筛选下没有数据',
      'analytics.errorRate': '失败率',
      'analytics.ratingShort': '评分',
      'analytics.count': '次数',
      'analytics.autoBucket': '自动分',
      'analytics.humanAvg': '人工均分',
      'analytics.table.model': '模型',
      'analytics.table.tool': '工具',
      'analytics.table.runs': '运行',
      'analytics.table.success': '成功率',
      'analytics.table.rating': '人工',
      'analytics.table.auto': '自动',
      'analytics.table.tokens': 'Token',
      'analytics.table.latency': '耗时',
      'analytics.table.errors': '错误',
      'analytics.table.combo': '模型 + 工具',
      'analytics.autoHumanGap': '平均偏差',
      'connect.title': '接入与设置',
      'connect.subtitle': '一套账本，多个入口；所有适配器写入同一个本地 SQLite。',
      'connect.native': '原生接入',
      'connect.native.desc': 'DSH 会话自动采集，无需配置。',
      'connect.active': '已启用',
      'connect.install': '安装方式',
      'connect.platform': '平台',
      'connect.method': '接入方式',
      'connect.status': '状态',
      'connect.chatgpt': 'ChatGPT',
      'connect.chatgpt.method': '自定义 GPT Action + 对话导出导入',
      'connect.codex': 'Codex',
      'connect.codex.method': 'MCP server + 会话同步 CLI',
      'connect.workbuddy': 'Work Buddy',
      'connect.workbuddy.method': 'Skill + 本地 MCP',
      'connect.doubao': '豆包工作版',
      'connect.doubao.method': 'Skill + 本地 MCP',
      'connect.trae': 'TRAE',
      'connect.trae.method': '原生 MCP',
      'connect.ready': '可用',
      'connect.partial': '需配置',
      'connect.endpoint': '本地写入端点',
      'connect.token': '写入令牌',
      'connect.reveal': '显示',
      'connect.hide': '隐藏',
      'connect.noEndpoint': '当前未运行 Web 服务，使用 MCP 或 CLI 写入。',
      'connect.settings': '采集与评估',
      'connect.autoEval': '本地规则自动评分',
      'connect.autoEval.desc': '回合结束后用可配置权重计算 1–5 分。',
      'connect.modelEval': '模型评审（使用当轮模型）',
      'connect.modelEval.desc': '开启后会额外调用一次模型，产生 Token 消耗。',
      'connect.backfill': '启动时回填当前会话',
      'connect.save': '保存设置',
      'connect.saved': '设置已保存',
      'connect.integrity': '数据完整性',
      'connect.integrity.ok': '哈希链完整',
      'connect.integrity.bad': '发现 {count} 个问题',
      'connect.integrity.check': '立即校验',
      'connect.integrity.events': '{count} 个事件',
      'connect.integrity.prompts': '{count} 条已封存提示词',
      'connect.integrity.head': '链头 {hash}',
      'connect.database': '数据库',
      'connect.privacy': '所有内容只写入本机；不调用云端归档服务。模型评审会把当轮文本发给你已经配置的模型提供商。',
      'connect.exportAll': '导出全部 CSV',
      'connect.rubric': '评估维度',
      'connect.rubric.desc': '权重会自动归一化；至少保留 3 个维度。',
      'connect.rubric.add': '添加维度',
      'connect.rubric.remove': '删除',
      'connect.rubric.labelZh': '中文名',
      'connect.rubric.labelEn': '英文名',
      'connect.rubric.weight': '权重',
      'connect.rubric.save': '保存评估体系',
      'connect.rubric.saved': '评估体系已保存',
      'connect.rubric.error': '保存失败：{message}',
      'connect.mcpHint': '在支持 MCP 的客户端中添加下面这条本地命令。',
      'dock.turns': '{count} 轮',
      'dock.tokens': '{count} Token',
      'dock.tools': '{count} 工具',
      'dock.auto': '自动 {score}',
      'dock.empty': '本会话尚无记录',
      'dock.open': '打开账本',
      'dock.tokenShort': 'tok',
      'dock.cache': '缓存',
      'dock.row.auto': '自动评分',
      'dock.row.human': '人工评分',
      'dock.row.tokens': '本会话 Token',
      'dock.row.tools': '工具调用',
      'dock.row.model': '最近模型',
      'dock.session': '本会话',
      'dock.promptLabel': '提示词',
      'dock.promptUnit': '{count} 条',
      'dock.tokenLabel': 'Token',
      'dock.toolsLabel': '工具 / Skill / MCP',
      'dock.autoLabel': '自动评分',
      'dock.humanLabel': '人工评分',
      'dock.chainLabel': '数据链',
      'dock.chainOk': '完整',
      'dock.chainBad': '异常',
      'dock.chainChecking': '校验中',
      'dock.chainSub': 'SHA-256',
      'dock.rated': '{count} 条已评',
      'dock.skillsMcp': '{skills} Skill · {mcp} MCP',
      'dock.local': '本地 SQLite',
      'dock.openFull': '打开完整账本',
      'dock.close': '收起',
      'dock.tokensSub': '缓存 {rate}%',
      'dock.autoSub': '规则评分',
      'dock.noData': '提交提示词后自动记录',
      'turn.tail': '提示词账本',
      'turn.detail': '查看复盘',
      'turn.auto': '自动',
      'turn.noRating': '待评分',
      'turn.ratingError': '评分失败：{message}',
      'connect.mcpCommand': 'MCP 启动命令',
      'common.na': '暂无',
      'common.all': '全部',
      'common.today': '今天',
      'common.7d': '近 7 天',
      'common.30d': '近 30 天',
      'common.90d': '近 90 天',
      'common.stars': '{count} 星',
      'common.untitled': '未命名',
      'common.unknown': '未知',
      'common.local': '本地',
      'common.more': '更多',
      'common.less': '收起',
      'common.loading': '加载中…',
      'common.error': '错误',
      'integrity.short': '链校验',
      'integrity.ok': '完整',
      'integrity.fail': '异常',
      'toast.rated': '人工评分已保存',
      'toast.noteSaved': '备注已保存',
      'toast.tagsSaved': '标签已保存',
      'toast.favorite': '收藏状态已更新',
      'toast.exported': 'CSV 已导出',
      'toast.error': '操作失败：{message}',
      'toast.rateFirst': '请先点亮星级，再保存备注',
      'detail.status': '状态',
      'detail.platform': '平台',
      'detail.turn': '轮次',
      'detail.session': '会话',
      'detail.hash': '内容哈希',
      'detail.eventChain': '事件链',
      'detail.noEvents': '暂无事件',
    };

    const EN = {
      'panel.title': 'Prompt ledger',
      'panel.subtitle': 'Local SQLite · full-loop review',
      'nav.overview': 'Overview',
      'nav.prompts': 'Prompts',
      'nav.analytics': 'Analytics',
      'nav.connect': 'Connect',
      'action.refresh': 'Refresh',
      'action.export': 'Export CSV',
      'action.retry': 'Retry',
      'action.close': 'Close',
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'state.loading': 'Reading the local ledger…',
      'state.error': 'Could not read the ledger',
      'state.empty': 'No records yet',
      'state.emptyHint': 'Submit a prompt in any session and it will appear here automatically.',
      'foot.local': 'Local only · SQLite WAL · SHA-256 chain',
      'kpi.prompts': 'Prompts',
      'kpi.rating': 'Human rating',
      'kpi.success': 'Completion',
      'kpi.tokens': 'Total tokens',
      'kpi.tools': 'Tool calls',
      'kpi.auto': 'Auto score',
      'kpi.rated': 'rated',
      'kpi.runs': 'runs',
      'kpi.noRating': 'Not rated',
      'overview.trend': 'Last 14 days',
      'overview.trendHint': 'Bars: prompts · line: tokens',
      'overview.insights': 'Review signals',
      'overview.models': 'Model performance',
      'overview.recent': 'Recent prompts',
      'overview.viewAll': 'View all',
      'overview.noModels': 'No model data yet',
      'overview.topTools': 'Top tools',
      'overview.insight.bestModel': 'Best model: {model}, human average {rating} ({count} runs)',
      'overview.insight.toolErrors': 'Tool {tool} has a high failure rate: {errors}/{calls}',
      'overview.insight.lowRated': '{count} recent low-rated turns; review the prompt/tool combination.',
      'overview.insight.highRated': '{count} recent high-rated turns are good template candidates.',
      'overview.insight.empty': 'Submit a prompt to generate review signals.',
      'overview.insight.avgTokens': 'Average {avg} tokens per turn.',
      'prompts.search': 'Search prompts, results, tags…',
      'prompts.filter.range': 'Time',
      'prompts.filter.platform': 'Platform',
      'prompts.filter.model': 'Model',
      'prompts.filter.tool': 'Tool',
      'prompts.filter.rating': 'Min rating',
      'prompts.filter.all': 'All',
      'prompts.filter.platformAll': 'All platforms',
      'prompts.filter.modelAll': 'All models',
      'prompts.filter.toolAll': 'All tools',
      'prompts.filter.anyRating': 'Any',
      'prompts.sort.newest': 'Newest',
      'prompts.sort.rating': 'Rating',
      'prompts.sort.tokens': 'Tokens',
      'prompts.sort.auto': 'Auto score',
      'prompts.count': '{count} records',
      'prompts.loadMore': 'Load more',
      'prompts.selected': 'selected',
      'prompts.detail': 'Prompt detail',
      'prompts.prompt': 'Prompt',
      'prompts.response': 'Result',
      'prompts.metadata': 'Metadata',
      'prompts.evaluation': 'Dual evaluation',
      'prompts.autoEval': 'Auto score',
      'prompts.humanEval': 'Human rating',
      'prompts.toolsUsed': 'Tools & session',
      'prompts.noResponse': 'No final answer',
      'prompts.noTools': 'No tools called',
      'prompts.rateHint': 'Click a star to save your rating',
      'prompts.notePlaceholder': 'Review note: what worked, what could improve…',
      'prompts.saveNote': 'Save note',
      'prompts.tagsPlaceholder': 'Tags, comma separated',
      'prompts.saveTags': 'Save tags',
      'prompts.favorite': 'Favourite',
      'prompts.favorited': 'Favourited',
      'prompts.audit': 'Audit trail',
      'prompts.auditHint': '{count} events, head {hash}',
      'prompts.submissions': '{count} submissions',
      'prompts.dimensions': 'dimensions',
      'prompts.rubricVersion': 'Rubric v{version}',
      'prompts.autoNone': 'No auto score yet',
      'prompts.modelMeta': '{provider} / {model}',
      'prompts.turn': 'Turn {turn}',
      'prompts.noDetail': 'Select a prompt to review it',
      'prompts.submissionsLabel': 'Original submissions',
      'prompts.auditShow': 'Show events',
      'prompts.auditHide': 'Hide events',
      'status.completed': 'Completed',
      'status.failed': 'Failed',
      'status.aborted': 'Aborted',
      'status.interrupted': 'Interrupted',
      'status.running': 'Running',
      'status.pending': 'Pending',
      'metric.input': 'Input',
      'metric.output': 'Output',
      'metric.total': 'Total',
      'metric.cache': 'Cache read',
      'metric.reasoning': 'Reasoning',
      'metric.latency': 'Latency',
      'metric.toolCalls': 'Tool calls',
      'metric.tools': 'tools',
      'metric.errors': 'Errors',
      'metric.tokens': 'Tokens',
      'metric.success': 'Success',
      'metric.rating': 'Human',
      'metric.auto': 'Auto',
      'metric.runs': 'Runs',
      'metric.model': 'Model',
      'metric.tool': 'Tool',
      'metric.combo': 'Combination',
      'metric.avg': 'Avg',
      'analytics.title': 'Cross-analysis',
      'analytics.models': 'Models',
      'analytics.tools': 'Tools',
      'analytics.skills': 'Skills',
      'analytics.mcp': 'MCP',
      'analytics.combos': 'Best combinations',
      'analytics.distribution': 'Human rating distribution',
      'analytics.calibration': 'Auto vs human',
      'analytics.calibrationHint': 'Human average per auto-score bucket; closer means better agreement.',
      'analytics.noCalibration': 'Needs turns that have both human and auto scores.',
      'analytics.empty': 'No data for these filters',
      'analytics.errorRate': 'Error rate',
      'analytics.ratingShort': 'Rating',
      'analytics.count': 'Count',
      'analytics.autoBucket': 'Auto',
      'analytics.humanAvg': 'Human avg',
      'analytics.table.model': 'Model',
      'analytics.table.tool': 'Tool',
      'analytics.table.runs': 'Runs',
      'analytics.table.success': 'Success',
      'analytics.table.rating': 'Human',
      'analytics.table.auto': 'Auto',
      'analytics.table.tokens': 'Tokens',
      'analytics.table.latency': 'Latency',
      'analytics.table.errors': 'Errors',
      'analytics.table.combo': 'Model + tool',
      'analytics.autoHumanGap': 'Mean gap',
      'connect.title': 'Connect & settings',
      'connect.subtitle': 'One ledger, many entrances; every adapter writes the same local SQLite file.',
      'connect.native': 'Native capture',
      'connect.native.desc': 'Automatic capture for DSH sessions, no setup.',
      'connect.active': 'Active',
      'connect.install': 'Install',
      'connect.platform': 'Platform',
      'connect.method': 'Integration',
      'connect.status': 'Status',
      'connect.chatgpt': 'ChatGPT',
      'connect.chatgpt.method': 'Custom GPT Action + conversation import',
      'connect.codex': 'Codex',
      'connect.codex.method': 'MCP server + session sync CLI',
      'connect.workbuddy': 'Work Buddy',
      'connect.workbuddy.method': 'Skill + local MCP',
      'connect.doubao': 'Doubao Work',
      'connect.doubao.method': 'Skill + local MCP',
      'connect.trae': 'TRAE',
      'connect.trae.method': 'Native MCP',
      'connect.ready': 'Ready',
      'connect.partial': 'Setup needed',
      'connect.endpoint': 'Local ingest endpoint',
      'connect.token': 'Ingest token',
      'connect.reveal': 'Reveal',
      'connect.hide': 'Hide',
      'connect.noEndpoint': 'No web server origin; use MCP or CLI instead.',
      'connect.settings': 'Capture & evaluation',
      'connect.autoEval': 'Local rule evaluation',
      'connect.autoEval.desc': 'Scores each finished turn 1–5 with configurable weights.',
      'connect.modelEval': 'Model review (same turn model)',
      'connect.modelEval.desc': 'Enables one extra model call and token cost.',
      'connect.backfill': 'Backfill live sessions on startup',
      'connect.save': 'Save settings',
      'connect.saved': 'Settings saved',
      'connect.integrity': 'Data integrity',
      'connect.integrity.ok': 'Hash chain intact',
      'connect.integrity.bad': '{count} issues found',
      'connect.integrity.check': 'Check now',
      'connect.integrity.events': '{count} events',
      'connect.integrity.prompts': '{count} sealed prompts',
      'connect.integrity.head': 'Head {hash}',
      'connect.database': 'Database',
      'connect.privacy': 'Everything stays on this machine; no archive cloud. Model review sends the turn to the model provider you already configured.',
      'connect.exportAll': 'Export all CSV',
      'connect.rubric': 'Rubric dimensions',
      'connect.rubric.desc': 'Weights are normalised automatically; keep at least 3 dimensions.',
      'connect.rubric.add': 'Add dimension',
      'connect.rubric.remove': 'Remove',
      'connect.rubric.labelZh': 'Chinese label',
      'connect.rubric.labelEn': 'English label',
      'connect.rubric.weight': 'Weight',
      'connect.rubric.save': 'Save rubric',
      'connect.rubric.saved': 'Rubric saved',
      'connect.rubric.error': 'Could not save: {message}',
      'connect.mcpHint': 'Add this local command to any MCP-capable client.',
      'dock.turns': '{count} turns',
      'dock.tokens': '{count} tokens',
      'dock.tools': '{count} tools',
      'dock.auto': 'Auto {score}',
      'dock.empty': 'No records in this session',
      'dock.open': 'Open ledger',
      'dock.tokenShort': 'tok',
      'dock.cache': 'cache',
      'dock.row.auto': 'Auto score',
      'dock.row.human': 'Human rating',
      'dock.row.tokens': 'Session tokens',
      'dock.row.tools': 'Tool calls',
      'dock.row.model': 'Latest model',
      'dock.session': 'This session',
      'dock.promptLabel': 'Prompts',
      'dock.promptUnit': '{count} total',
      'dock.tokenLabel': 'Tokens',
      'dock.toolsLabel': 'Tools / Skills / MCP',
      'dock.autoLabel': 'Auto score',
      'dock.humanLabel': 'Human rating',
      'dock.chainLabel': 'Data chain',
      'dock.chainOk': 'Intact',
      'dock.chainBad': 'Issue',
      'dock.chainChecking': 'Checking',
      'dock.chainSub': 'SHA-256',
      'dock.rated': '{count} rated',
      'dock.skillsMcp': '{skills} Skills · {mcp} MCP',
      'dock.local': 'Local SQLite',
      'dock.openFull': 'Open full ledger',
      'dock.close': 'Collapse',
      'dock.tokensSub': 'Cache {rate}%',
      'dock.autoSub': 'rule score',
      'dock.noData': 'Captured automatically after you send',
      'turn.tail': 'Prompt ledger',
      'turn.detail': 'Review',
      'turn.auto': 'Auto',
      'turn.noRating': 'Unrated',
      'turn.ratingError': 'Rating failed: {message}',
      'connect.mcpCommand': 'MCP command',
      'common.na': 'n/a',
      'common.all': 'All',
      'common.today': 'Today',
      'common.7d': '7 days',
      'common.30d': '30 days',
      'common.90d': '90 days',
      'common.stars': '{count} stars',
      'common.untitled': 'Untitled',
      'common.unknown': 'Unknown',
      'common.local': 'Local',
      'common.more': 'more',
      'common.less': 'less',
      'common.loading': 'Loading…',
      'common.error': 'Error',
      'integrity.short': 'Chain',
      'integrity.ok': 'OK',
      'integrity.fail': 'Issue',
      'toast.rated': 'Human rating saved',
      'toast.noteSaved': 'Note saved',
      'toast.tagsSaved': 'Tags saved',
      'toast.favorite': 'Favourite updated',
      'toast.exported': 'CSV exported',
      'toast.error': 'Action failed: {message}',
      'toast.rateFirst': 'Choose a star rating before saving a note',
      'detail.status': 'Status',
      'detail.platform': 'Platform',
      'detail.turn': 'Turn',
      'detail.session': 'Session',
      'detail.hash': 'Content hash',
      'detail.eventChain': 'Event chain',
      'detail.noEvents': 'No events',
    };

    function interpolate(template, values) {
      return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => (
        values[key] === undefined || values[key] === null ? match : String(values[key])
      ));
    }

    function useLocaleTick(ctx) {
      const [, bump] = useState(0);
      useEffect(() => ctx.locale.subscribe(() => bump((value) => value + 1)), [ctx]);
    }

    function isChinese(active) {
      return typeof active === 'string' && /^zh/i.test(active);
    }

    /* ------------------------------------------------------------------ */
    /* Formatting                                                          */
    /* ------------------------------------------------------------------ */

    function pad(value) {
      return String(value).padStart(2, '0');
    }

    function formatDate(timestamp, zh) {
      if (!Number.isFinite(Number(timestamp))) return '';
      const date = new Date(Number(timestamp));
      const now = new Date();
      const sameDay = date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
      if (sameDay) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      if (zh) return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatFullDate(timestamp, zh) {
      if (!Number.isFinite(Number(timestamp))) return '';
      const date = new Date(Number(timestamp));
      return zh
        ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
        : date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatNumber(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '0';
      return number.toLocaleString('en-US');
    }

    function formatTokens(value) {
      const number = Number(value) || 0;
      if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
      if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`;
      return String(number);
    }

    function formatDuration(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms <= 0) return '—';
      if (ms < 1_000) return `${Math.round(ms)} ms`;
      if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)} s`;
      const minutes = Math.floor(ms / 60_000);
      const seconds = Math.round((ms % 60_000) / 1_000);
      return `${minutes}m ${seconds}s`;
    }

    function truncate(value, max) {
      const text = typeof value === 'string' ? value : '';
      return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
    }

    function platformName(id, zh, bootstrap) {
      const entry = bootstrap?.platforms?.[id];
      if (entry !== undefined) return entry[zh ? 'zh' : 'en'] ?? id;
      return id ?? '—';
    }

    function statusLabel(status, t) {
      const key = `status.${typeof status === 'string' ? status : 'unknown'}`;
      const value = t(key);
      return value === key ? t('common.unknown') : value;
    }

    function modelLabel(prompt) {
      if (typeof prompt?.model === 'string' && prompt.model !== '') return prompt.model;
      if (Array.isArray(prompt?.models) && prompt.models.length > 0) return prompt.models[0];
      return '—';
    }

    function buildQuery(filters, extra = {}) {
      const params = new URLSearchParams();
      for (const key of ['range', 'platform', 'model', 'tool', 'minRating', 'q', 'sort']) {
        const value = filters?.[key];
        if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
      }
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
      }
      return params.toString();
    }

    async function requestJson(path, options) {
      const response = await fetch(path, {
        cache: 'no-store',
        ...options,
        headers: {
          accept: 'application/json',
          ...(options?.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(options?.headers ?? {}),
        },
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        /* non-JSON error */
      }
      if (!response.ok) {
        const message = body?.error?.message ?? `HTTP ${response.status}`;
        throw new Error(message);
      }
      return body;
    }


    /* ------------------------------------------------------------------ */
    /* Session ledger cache + composer/turn surfaces                        */
    /* ------------------------------------------------------------------ */

    const SESSION_CACHE_MS = 5_000;
    const sessionPromptCache = new Map();
    const sessionPromptInflight = new Map();
    const ledgerChangeListeners = new Set();
    let pendingPromptId = null;
    let pendingPanelTab = null;

    function markLedgerChanged() {
      sessionPromptCache.clear();
      for (const listener of ledgerChangeListeners) listener();
    }

    function useLedgerPulse() {
      const [pulse, bump] = useState(0);
      useEffect(() => {
        const listener = () => bump((value) => value + 1);
        ledgerChangeListeners.add(listener);
        return () => ledgerChangeListeners.delete(listener);
      }, []);
      return pulse;
    }

    async function loadSessionPrompts(sessionId, force = false) {
      if (typeof sessionId !== 'string' || sessionId === '') {
        return { items: [], total: 0, at: Date.now() };
      }
      const cached = sessionPromptCache.get(sessionId);
      if (!force && cached !== undefined && Date.now() - cached.at < SESSION_CACHE_MS) return cached;
      const inflight = sessionPromptInflight.get(sessionId);
      if (inflight !== undefined) return inflight;
      const request = requestJson(`/api/prompt-ledger/prompts?sessionId=${encodeURIComponent(sessionId)}&limit=200&sort=oldest`)
        .then((body) => {
          const value = {
            items: Array.isArray(body.items) ? body.items : [],
            total: body.total ?? 0,
            at: Date.now(),
          };
          sessionPromptCache.set(sessionId, value);
          return value;
        })
        .finally(() => sessionPromptInflight.delete(sessionId));
      sessionPromptInflight.set(sessionId, request);
      return request;
    }

    const integrityCache = { at: 0, value: null, error: null };

    async function loadIntegrity(force = false) {
      if (!force && integrityCache.value !== null && Date.now() - integrityCache.at < 30_000) {
        return integrityCache;
      }
      const body = await requestJson('/api/prompt-ledger/integrity');
      integrityCache.at = Date.now();
      integrityCache.value = body.integrity ?? null;
      integrityCache.error = null;
      return integrityCache;
    }

    function useLedgerIntegrity(active) {
      const pulse = useLedgerPulse();
      const [state, setState] = useState(integrityCache.value);
      useEffect(() => {
        if (!active) return undefined;
        let mounted = true;
        loadIntegrity()
          .then((cache) => {
            if (mounted) setState(cache.value);
          })
          .catch((error) => {
            if (mounted) setState({ ok: false, error: error.message, issues: [] });
          });
        return () => {
          mounted = false;
        };
      }, [active, pulse]);
      return state;
    }

    function useSessionPrompts(sessionId) {
      const pulse = useLedgerPulse();
      const [state, setState] = useState(() => (
        typeof sessionId === 'string' ? sessionPromptCache.get(sessionId) ?? null : null
      ));
      useEffect(() => {
        let active = true;
        if (typeof sessionId !== 'string' || sessionId === '') {
          setState(null);
          return undefined;
        }
        const cached = sessionPromptCache.get(sessionId);
        if (cached !== undefined) setState(cached);
        setState((current) => ({
          items: current?.items ?? [],
          total: current?.total ?? 0,
          at: current?.at ?? 0,
          loading: current === null,
          error: null,
        }));
        loadSessionPrompts(sessionId)
          .then((value) => {
            if (active) setState(value);
          })
          .catch((error) => {
            if (active) {
              setState((current) => ({
                items: current?.items ?? [],
                total: current?.total ?? 0,
                at: current?.at ?? 0,
                loading: false,
                error: error.message,
              }));
            }
          });
        return () => {
          active = false;
        };
      }, [sessionId, pulse]);
      return state;
    }

    function openLedger(ctx, promptId, tab) {
      pendingPromptId = typeof promptId === 'string' && promptId !== '' ? promptId : null;
      const targetTab = typeof tab === 'string' && tab !== ''
        ? tab
        : (typeof promptId === 'string' && promptId !== '' ? 'prompts' : null);
      pendingPanelTab = targetTab;
      try {
        ctx.layout?.selectPanel?.('prompt-ledger');
      } catch {
        /* layout is optional in embedded surfaces */
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('prompt-ledger:open', {
          detail: {
            id: typeof promptId === 'string' ? promptId : null,
            tab: targetTab,
          },
        }));
      }
    }

    function matchPromptForTurn(items, turn, seq) {
      if (!Array.isArray(items) || items.length === 0) return null;
      const turnNumber = Number(turn?.turn ?? turn?.number ?? turn?.index);
      if (Number.isFinite(turnNumber)) {
        const exact = [...items].reverse().find((item) => Number(item.turn) === turnNumber);
        if (exact !== undefined) return exact;
      }
      const closing = Number(seq ?? turn?.endSeq ?? turn?.end ?? turn?.seq);
      if (!Number.isFinite(closing)) return null;
      let candidate = null;
      for (const item of items) {
        const sourceSeq = Number(item.sourceSeq);
        if (Number.isFinite(sourceSeq) && sourceSeq <= closing) candidate = item;
      }
      return candidate;
    }

    function LedgerDock({ ctx, t, sessionId, session }) {
      useLocaleTick(ctx);
      const id = typeof sessionId === 'string' && sessionId !== '' ? sessionId : session?.id;
      const snap = useSessionPrompts(id);
      const AUTO_KEY = 'prompt-ledger.dock.seen.v3';
      const [open, setOpen] = useState(() => {
        try {
          return localStorage.getItem(AUTO_KEY) !== '1';
        } catch {
          return true;
        }
      });
      const autoOpened = useRef(false);
      const wrapRef = useRef(null);
      const chain = useLedgerIntegrity(open);
      const markSeen = () => {
        try {
          localStorage.setItem(AUTO_KEY, '1');
        } catch {
          /* private mode */
        }
      };
      const collapse = () => {
        setOpen(false);
        markSeen();
      };

      useEffect(() => {
        if (!open || autoOpened.current) return undefined;
        autoOpened.current = true;
        const timer = setTimeout(() => {
          setOpen(false);
          markSeen();
        }, 10_000);
        return () => clearTimeout(timer);
        // Only the first install-time reveal is automatic; manual opens persist.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          if (wrapRef.current !== null && !wrapRef.current.contains(event.target)) collapse();
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') collapse();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
        };
      }, [open]);

      const items = Array.isArray(snap?.items) ? snap.items : [];
      const ready = snap !== null && snap?.loading !== true;
      const tokens = items.reduce((sum, item) => sum + Number(item.tokens?.total ?? 0), 0);
      const inputTokens = items.reduce((sum, item) => sum + Number(item.tokens?.input ?? 0), 0);
      const cacheRead = items.reduce((sum, item) => sum + Number(item.tokens?.cacheRead ?? 0), 0);
      const cacheRate = inputTokens > 0 ? Math.min(100, Math.round((cacheRead / inputTokens) * 100)) : 0;
      const toolCalls = items.reduce((sum, item) => sum + Number(item.toolCalls ?? 0), 0);
      const skillCount = new Set(items.flatMap((item) => Array.isArray(item.skills) ? item.skills : [])).size;
      const mcpCount = new Set(items.flatMap((item) => Array.isArray(item.mcp) ? item.mcp : [])).size;
      const rated = items.filter((item) => Number.isFinite(Number(item.rating?.stars)));
      const autoRated = items.filter((item) => Number.isFinite(Number(item.auto?.total)));
      const average = (entries, read) => (
        entries.length === 0
          ? null
          : entries.reduce((sum, item) => sum + Number(read(item)), 0) / entries.length
      );
      const humanScore = average(rated, (item) => item.rating.stars);
      const autoScore = average(autoRated, (item) => item.auto.total);
      const humanLabel = humanScore === null ? '—' : `${humanScore.toFixed(1)}★`;
      const autoLabel = autoScore === null ? '—' : autoScore.toFixed(1);
      const chainLabel = chain === null
        ? t('dock.chainChecking')
        : chain.ok === true
          ? t('dock.chainOk')
          : t('dock.chainBad');
      const chainTone = chain === null ? 'loading' : chain.ok === true ? 'success' : 'error';

      const modules = [
        {
          key: 'prompts',
          icon: h(PanelIcon, { size: 17, active: true }),
          label: t('dock.promptLabel'),
          value: ready ? String(items.length) : '—',
          sub: t('dock.session'),
          tone: 'brand',
          target: 'prompts',
        },
        {
          key: 'tokens',
          icon: h(DatabaseIcon, { size: 17 }),
          label: t('dock.tokenLabel'),
          value: ready ? formatTokens(tokens) : '—',
          sub: interpolate(t('dock.tokensSub'), { rate: cacheRate }),
          tone: 'plain',
          target: 'analytics',
        },
        {
          key: 'tools',
          icon: h(ToolIcon, { size: 17 }),
          label: t('dock.toolsLabel'),
          value: ready ? String(toolCalls) : '—',
          sub: interpolate(t('dock.skillsMcp'), { skills: skillCount, mcp: mcpCount }),
          tone: 'plain',
          target: 'analytics',
        },
        {
          key: 'auto',
          icon: h(SparkIcon, { size: 17 }),
          label: t('dock.autoLabel'),
          value: autoLabel,
          sub: interpolate(t('dock.rated'), { count: autoRated.length }),
          tone: 'brand',
          target: 'analytics',
        },
        {
          key: 'human',
          icon: h(StarIcon, { size: 17, filled: true }),
          label: t('dock.humanLabel'),
          value: humanLabel,
          sub: interpolate(t('dock.rated'), { count: rated.length }),
          tone: 'warm',
          target: 'prompts',
        },
        {
          key: 'chain',
          icon: h(ShieldIcon, { size: 17 }),
          label: t('dock.chainLabel'),
          value: chainLabel,
          sub: t('dock.chainSub'),
          tone: chainTone,
          target: 'connect',
        },
      ];

      const pillStats = items.length === 0
        ? h('span', { className: 'pl-ledger-pill-empty' }, t('dock.noData'))
        : h(React.Fragment, null,
          h('span', { className: 'pl-ledger-pill-stat' }, `${items.length} ${t('dock.promptLabel')}`),
          h('span', { className: 'pl-ledger-pill-sep' }),
          h('span', { className: 'pl-ledger-pill-stat is-tokens' }, formatTokens(tokens)),
          h('span', { className: 'pl-ledger-pill-sep' }),
          h('span', { className: 'pl-ledger-pill-stat is-warm' }, humanLabel));

      return h('div', { className: 'pl-ledger-center', ref: wrapRef },
        open
          ? h('div', {
            className: 'pl-ledger-panel',
            role: 'dialog',
            'aria-label': t('panel.title'),
            onClick: (event) => event.stopPropagation(),
          },
          h('div', { className: 'pl-ledger-head' },
            h('span', { className: 'pl-ledger-mark' }, h(PanelIcon, { size: 19, active: true })),
            h('span', { className: 'pl-ledger-title' },
              h('strong', null, t('panel.title')),
              h('span', null, `${t('dock.session')} · ${t('dock.local')}`)),
            h('span', { className: `pl-ledger-chain is-${chainTone}` },
              h('span', { className: 'pl-ledger-chain-dot' }),
              chainLabel),
            h('button', {
              type: 'button',
              className: 'pl-ledger-close',
              onClick: collapse,
              title: t('dock.close'),
              'aria-label': t('dock.close'),
            }, h(CloseIcon, { size: 13 }))),

          h('div', { className: 'pl-ledger-grid' },
            modules.map((module) => h('button', {
              key: module.key,
              type: 'button',
              className: `pl-ledger-module is-${module.tone}`,
              onClick: () => {
                markSeen();
                openLedger(ctx, null, module.target);
              },
              title: `${module.label} · ${module.value}`,
            },
            h('span', { className: 'pl-ledger-module-top' },
              h('span', { className: 'pl-ledger-module-icon' }, module.icon),
              h('span', { className: 'pl-ledger-module-label' }, module.label)),
            h('strong', { className: 'pl-ledger-module-value' }, module.value),
            h('span', { className: 'pl-ledger-module-sub' }, module.sub)))),

          h('div', { className: 'pl-ledger-foot' },
            h('span', null, 'SQLite · SHA-256 · ', t('common.local')),
            h('button', {
              type: 'button',
              className: 'pl-ledger-open',
              onClick: () => {
                markSeen();
                openLedger(ctx, null, 'overview');
              },
            }, t('dock.openFull'), h(ChevronIcon, { size: 11 }))))
          : null,

        h('button', {
          type: 'button',
          className: `pl-ledger-pill${open ? ' is-open' : ''}`,
          onClick: () => {
            if (open) collapse();
            else setOpen(true);
          },
          'aria-expanded': open ? 'true' : 'false',
          'aria-haspopup': 'dialog',
          title: open ? t('dock.close') : t('dock.open'),
        },
        h('span', { className: 'pl-ledger-pill-mark' }, h(PanelIcon, { size: 14, active: true })),
        h('span', { className: 'pl-ledger-pill-title' }, t('panel.title')),
        h('span', { className: 'pl-ledger-pill-divider' }),
        pillStats,
        h('span', { className: 'pl-ledger-chev' }, h(ChevronIcon, { size: 11, open: !open }))));
    }

    function TurnLedgerMetrics({ ctx, t, sessionId, turn, seq }) {
      useLocaleTick(ctx);
      const snap = useSessionPrompts(sessionId);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const item = matchPromptForTurn(snap?.items ?? [], turn, seq);
      const retried = useRef(false);
      useEffect(() => {
        if (item !== null || snap === null || retried.current) return undefined;
        retried.current = true;
        const timer = setTimeout(() => markLedgerChanged(), 450);
        return () => clearTimeout(timer);
      }, [item, snap]);
      if (item === null) return null;
      const rate = async (stars) => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
          await requestJson('/api/prompt-ledger/rate', {
            method: 'POST',
            body: JSON.stringify({ id: item.id, stars, note: item.rating?.note ?? '' }),
          });
          markLedgerChanged();
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy(false);
        }
      };
      const auto = item.auto?.total;
      return h('div', { className: 'pl-turn' },
        h('span', { className: 'pl-turn-title' }, h(PanelIcon, { size: 12, active: true }), t('turn.tail')),
        h('span', { className: `pl-turn-status is-${item.status ?? 'unknown'}` },
          h('span', { className: 'pl-turn-dot' }),
          statusLabel(item.status, t)),
        h('span', { className: 'pl-turn-meta' },
          h('span', { className: 'pl-turn-model' }, item.model ?? '—'),
          h('span', { className: 'pl-turn-sep' }, '·'),
          h('span', null, `${formatTokens(item.tokens?.total)} ${t('dock.tokenShort')}`),
          h('span', { className: 'pl-turn-sep' }, '·'),
          h('span', null, `${item.toolCalls ?? 0} ${t('metric.tools')}`),
          auto === null || auto === undefined
            ? null
            : h('span', { className: 'pl-turn-auto' }, `${t('turn.auto')} ${Number(auto).toFixed(1)}`)),
        h('span', { className: 'pl-turn-rating' },
          h(Stars, {
            value: item.rating?.stars ?? 0,
            size: 11,
            onRate: rate,
            label: item.rating?.stars ? t('prompts.humanEval') : t('turn.noRating'),
          })),
        error === null ? null : h('span', { className: 'pl-turn-error', title: error }, interpolate(t('turn.ratingError'), { message: error })),
        h('button', {
          type: 'button',
          className: 'pl-turn-detail',
          onClick: () => openLedger(ctx, item.id),
        }, t('turn.detail'), h(ChevronIcon, { size: 10 })));
    }

    /* ------------------------------------------------------------------ */
    /* Icons                                                               */
    /* ------------------------------------------------------------------ */

    function PanelIcon({ size = 20, active = false }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': true,
        style: { display: 'block', color: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' },
      },
      h('rect', {
        x: 4.2, y: 3.2, width: 15.6, height: 17.6, rx: 3,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        opacity: active ? 1 : 0.9,
      }),
      h('path', {
        d: 'M8 8.2h8M8 11.7h8M8 15.2h4.6',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M17.1 3.1l.8 1.7 1.9.2-1.4 1.3.4 1.9-1.7-1-1.7 1 .4-1.9-1.4-1.3 1.9-.2.8-1.7z',
        fill: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor',
        opacity: active ? 1 : 0.75,
      }));
    }

    function RefreshIcon({ size = 14, spinning = false }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        className: spinning ? 'pl-spin' : undefined,
        style: { display: 'block' },
      },
      h('path', { d: 'M20.4 12a8.4 8.4 0 1 1-2.5-6' }),
      h('path', { d: 'M20.6 4.4v5.8h-5.8' }));
    }

    function ExportIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
      h('path', { d: 'M12 3v12' }),
      h('path', { d: 'm7.5 10.5 4.5 4.5 4.5-4.5' }),
      h('path', { d: 'M4.5 17.5v2.2h15v-2.2' }));
    }

    function SearchIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
      },
      h('circle', { cx: 11, cy: 11, r: 7 }),
      h('path', { d: 'm20 20-3.6-3.6' }));
    }

    function ChevronIcon({ size = 14, open = false }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' },
      }, h('path', { d: 'm6 9 6 6 6-6' }));
    }

    function CloseIcon({ size = 15 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
      }, h('path', { d: 'M6 6l12 12M18 6 6 18' }));
    }

    function DatabaseIcon({ size = 12 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('ellipse', { cx: 12, cy: 6, rx: 7.2, ry: 2.8 }),
      h('path', { d: 'M4.8 6v6c0 1.5 3.2 2.8 7.2 2.8s7.2-1.3 7.2-2.8V6' }),
      h('path', { d: 'M4.8 12v6c0 1.5 3.2 2.8 7.2 2.8s7.2-1.3 7.2-2.8v-6' }));
    }

    function ToolIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('path', { d: 'M14.7 6.3a4 4 0 0 0-5.2 5.2l-4.7 4.7a1.8 1.8 0 0 0 2.6 2.6l4.7-4.7a4 4 0 0 0 5.2-5.2l-2.2 2.2-2.4-.4-.4-2.4 2.4-2.4z' }));
    }

    function StarIcon({ size = 16, filled = false }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round',
      }, h('path', { d: 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6z' }));
    }

    function CheckIcon({ size = 13 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, h('path', { d: 'm4.5 12.5 5 5 10-11' }));
    }

    function CopyIcon({ size = 12 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('rect', { x: 8, y: 8, width: 11.5, height: 12, rx: 2.2 }),
      h('path', { d: 'M16 8V6.2A2.2 2.2 0 0 0 13.8 4H6.2A2.2 2.2 0 0 0 4 6.2v9.6A2.2 2.2 0 0 0 6.2 18H8' }));
    }

    function ShieldIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('path', { d: 'M12 3.2 19 6v5.4c0 4.5-2.9 7.7-7 9.4-4.1-1.7-7-4.9-7-9.4V6l7-2.8z' }),
      h('path', { d: 'm8.7 12.1 2.2 2.2 4.5-4.7' }));
    }

    function SparkIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('path', { d: 'M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.8 2.8M15.2 15.2 18 18M18 6l-2.8 2.8M8.8 15.2 6 18' }));
    }

    function PlusIcon({ size = 13 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
      }, h('path', { d: 'M12 5v14M5 12h14' }));
    }

    function TrashIcon({ size = 13 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('path', { d: 'M4.5 6.5h15M9 6.5V4.8h6v1.7M7 6.5l.8 13h8.4l.8-13' }));
    }

    /* ------------------------------------------------------------------ */
    /* Small pieces                                                        */
    /* ------------------------------------------------------------------ */

    function Stars({ value = 0, onRate, size = 16, readOnly = false, label }) {
      const stars = [1, 2, 3, 4, 5];
      if (readOnly || typeof onRate !== 'function') {
        return h('span', {
          className: 'pl-stars is-readonly',
          role: 'img',
          'aria-label': label ?? `${value} / 5`,
          title: label ?? `${value} / 5`,
        }, stars.map((star) => h('span', {
          key: star,
          className: star <= value ? 'is-on' : undefined,
        }, h(StarIcon, { size, filled: star <= value }))));
      }
      return h('span', { className: 'pl-stars', role: 'group', 'aria-label': label ?? 'Rating' },
        stars.map((star) => h('button', {
          key: star,
          type: 'button',
          className: star <= value ? 'is-on' : undefined,
          'aria-label': `${star} / 5`,
          title: `${star} / 5`,
          onClick: (event) => {
            event.stopPropagation();
            onRate(star);
          },
          onKeyDown: (event) => event.stopPropagation(),
        }, h(StarIcon, { size, filled: star <= value }))));
    }

    function Badge({ children, tone = 'neutral', title }) {
      return h('span', { className: `pl-badge is-${tone}`, title }, children);
    }

    function StatusBadge({ status, t }) {
      const tone = status === 'completed'
        ? 'success'
        : status === 'failed'
          ? 'error'
          : status === 'running'
            ? 'warn'
            : 'neutral';
      return h(Badge, { tone }, statusLabel(status, t));
    }

    function Toggle({ checked, onChange, label, description }) {
      return h('label', { className: 'pl-toggle-row' },
        h('span', { className: 'pl-toggle-copy' },
          h('span', { className: 'pl-toggle-label' }, label),
          description === undefined ? null : h('span', { className: 'pl-toggle-desc' }, description)),
        h('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          className: `pl-switch${checked ? ' is-on' : ''}`,
          onClick: () => onChange(!checked),
        }, h('span', { className: 'pl-switch-thumb' })));
    }

    function Section({ title, hint, actions, children, className = '' }) {
      return h('section', { className: `pl-card ${className}`.trim() },
        h('div', { className: 'pl-card-head' },
          h('div', null,
            h('h2', { className: 'pl-card-title' }, title),
            hint === undefined ? null : h('p', { className: 'pl-card-hint' }, hint)),
          actions === undefined ? null : h('div', { className: 'pl-card-actions' }, actions)),
        children);
    }

    function EmptyState({ title, hint, actionLabel, onAction }) {
      return h('div', { className: 'pl-empty' },
        h('span', { className: 'pl-empty-mark' }, h(SparkIcon, { size: 18 })),
        h('strong', null, title),
        hint === undefined ? null : h('p', null, hint),
        actionLabel === undefined ? null : h('button', { type: 'button', className: 'pl-btn', onClick: onAction }, actionLabel));
    }

    function ErrorState({ title, message, onRetry, retryLabel }) {
      return h('div', { className: 'pl-empty is-error' },
        h('strong', null, title),
        h('p', null, message),
        onRetry === undefined ? null : h('button', { type: 'button', className: 'pl-btn', onClick: onRetry }, retryLabel ?? 'Retry'));
    }

    function LoadingRows({ rows = 6 }) {
      return h('div', { className: 'pl-skel', 'aria-hidden': true },
        Array.from({ length: rows }, (_, index) => h('div', {
          key: index,
          className: 'pl-skel-row',
          style: { animationDelay: `${index * 70}ms` },
        })));
    }

    function StarText({ value, t }) {
      if (value === null || value === undefined) return h('span', { className: 'pl-muted' }, t('kpi.noRating'));
      return h('span', { className: 'pl-rating-text' },
        h(StarIcon, { size: 13, filled: true }),
        h('span', null, Number(value).toFixed(1)));
    }

    function MiniBar({ value, max, tone = 'brand' }) {
      const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
      return h('span', { className: `pl-mini-bar is-${tone}`, 'aria-hidden': true },
        h('span', { style: { width: `${ratio * 100}%` } }));
    }

    function ToolChips({ tools = [], skills = [], mcp = [], limit = 4, t }) {
      const all = [
        ...tools.map((name) => ({ name, tone: 'neutral' })),
        ...skills.map((name) => ({ name, tone: 'skill' })),
        ...mcp.map((name) => ({ name, tone: 'mcp' })),
      ];
      if (all.length === 0) return h('span', { className: 'pl-muted' }, t('prompts.noTools'));
      return h('span', { className: 'pl-chips' },
        all.slice(0, limit).map((item) => h('span', {
          key: `${item.tone}:${item.name}`,
          className: `pl-chip is-${item.tone}`,
          title: item.name,
        }, item.name)),
        all.length > limit ? h('span', { className: 'pl-chip is-more' }, `+${all.length - limit}`) : null);
    }

    /* ------------------------------------------------------------------ */
    /* Charts                                                              */
    /* ------------------------------------------------------------------ */

    function TrendChart({ data, zh, t }) {
      const entries = Array.isArray(data) ? data : [];
      if (entries.length === 0) return h('div', { className: 'pl-chart-empty' }, t('state.empty'));
      const width = 720;
      const height = 188;
      const left = 34;
      const right = 16;
      const top = 18;
      const bottom = 30;
      const plotW = width - left - right;
      const plotH = height - top - bottom;
      const maxCount = Math.max(1, ...entries.map((entry) => entry.count));
      const maxTokens = Math.max(1, ...entries.map((entry) => entry.tokens));
      const slot = plotW / entries.length;
      const barW = Math.min(26, slot * 0.46);
      const points = entries.map((entry, index) => {
        const x = left + slot * index + slot / 2;
        const y = top + plotH - (entry.tokens / maxTokens) * plotH;
        return { x, y, entry };
      });
      const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
      const labelEvery = Math.max(1, Math.ceil(entries.length / 7));
      return h('svg', {
        viewBox: `0 0 ${width} ${height}`,
        className: 'pl-trend',
        role: 'img',
        'aria-label': t('overview.trend'),
      },
      [0, 0.25, 0.5, 0.75, 1].map((ratio) => h('line', {
        key: ratio,
        x1: left,
        x2: width - right,
        y1: top + plotH * ratio,
        y2: top + plotH * ratio,
        className: 'pl-grid-line',
      })),
      entries.map((entry, index) => {
        const barH = Math.max(entry.count === 0 ? 0 : 3, (entry.count / maxCount) * plotH);
        const x = left + slot * index + slot / 2 - barW / 2;
        return h('rect', {
          key: `bar-${entry.day}`,
          x,
          y: top + plotH - barH,
          width: barW,
          height: barH,
          rx: 3,
          className: 'pl-trend-bar',
        });
      }),
      h('path', { d: path, className: 'pl-trend-line' }),
      points.map((point) => h('circle', {
        key: `dot-${point.entry.day}`,
        cx: point.x,
        cy: point.y,
        r: 2.5,
        className: 'pl-trend-dot',
      })),
      entries.map((entry, index) => {
        if (index % labelEvery !== 0 && index !== entries.length - 1) return null;
        const x = left + slot * index + slot / 2;
        const date = new Date(`${entry.day}T00:00:00`);
        const label = zh ? `${date.getMonth() + 1}/${date.getDate()}` : `${date.getMonth() + 1}/${date.getDate()}`;
        return h('text', {
          key: `label-${entry.day}`,
          x,
          y: height - 9,
          textAnchor: 'middle',
          className: 'pl-axis-label',
        }, label);
      }),
      h('text', { x: left, y: 11, className: 'pl-axis-label' }, String(maxCount)),
      h('text', { x: width - right, y: 11, textAnchor: 'end', className: 'pl-axis-label' }, formatTokens(maxTokens)));
    }

    function RatingDistribution({ data, t }) {
      const entries = Array.isArray(data) ? data : [];
      const max = Math.max(1, ...entries.map((entry) => entry.count));
      return h('div', { className: 'pl-distribution' },
        entries.map((entry) => h('div', { key: entry.stars, className: 'pl-dist-row' },
          h('span', { className: 'pl-dist-star' }, h(StarIcon, { size: 13, filled: true }), String(entry.stars)),
          h(MiniBar, { value: entry.count, max, tone: entry.stars >= 4 ? 'success' : entry.stars <= 2 ? 'error' : 'brand' }),
          h('span', { className: 'pl-dist-count' }, formatNumber(entry.count)))));
    }

    function CalibrationChart({ data, t }) {
      const entries = Array.isArray(data) ? data : [];
      if (entries.length === 0) {
        return h('p', { className: 'pl-muted pl-small' }, t('analytics.noCalibration'));
      }
      const width = 340;
      const height = 180;
      const left = 30;
      const top = 12;
      const plotW = 290;
      const plotH = 138;
      const x = (value) => left + ((value - 0.5) / 5) * plotW;
      const y = (value) => top + plotH - ((value - 0.5) / 5) * plotH;
      return h('svg', { viewBox: `0 0 ${width} ${height}`, className: 'pl-calibration', role: 'img', 'aria-label': t('analytics.calibration') },
        h('line', { x1: x(1), y1: y(1), x2: x(5.5), y2: y(5.5), className: 'pl-diagonal' }),
        h('line', { x1: left, y1: top + plotH, x2: left + plotW, y2: top + plotH, className: 'pl-grid-line' }),
        h('line', { x1: left, y1: top, x2: left, y2: top + plotH, className: 'pl-grid-line' }),
        entries.map((entry) => {
          const radius = 4 + Math.min(8, Math.sqrt(entry.count) * 2);
          return h('g', { key: entry.auto },
            h('circle', {
              cx: x(entry.auto),
              cy: y(entry.human),
              r: radius,
              className: 'pl-calibration-dot',
            }),
            h('text', {
              x: x(entry.auto),
              y: y(entry.human) - radius - 4,
              textAnchor: 'middle',
              className: 'pl-axis-label',
            }, `${entry.human}`));
        }),
        h('text', { x: left + plotW / 2, y: height - 4, textAnchor: 'middle', className: 'pl-axis-label' }, t('analytics.autoBucket')),
        h('text', { x: 10, y: top + plotH / 2, textAnchor: 'middle', transform: `rotate(-90 10 ${top + plotH / 2})`, className: 'pl-axis-label' }, t('analytics.humanAvg')));
    }

    /* ------------------------------------------------------------------ */
    /* Filter bar                                                          */
    /* ------------------------------------------------------------------ */

    const RANGES = [
      ['today', 'common.today'],
      ['7d', 'common.7d'],
      ['30d', 'common.30d'],
      ['90d', 'common.90d'],
      ['all', 'common.all'],
    ];

    function FilterBar({ filters, setFilters, facets, t, zh, bootstrap }) {
      const [search, setSearch] = useState(filters.q ?? '');
      useEffect(() => setSearch(filters.q ?? ''), [filters.q]);
      const update = (patch) => setFilters({ ...filters, ...patch });
      const submitSearch = () => update({ q: search.trim() });
      const models = Array.isArray(facets?.models) ? facets.models : [];
      const tools = Array.isArray(facets?.tools) ? facets.tools : [];
      const platforms = Array.isArray(facets?.platforms) ? facets.platforms : [];
      return h('div', { className: 'pl-filters' },
        h('div', { className: 'pl-range-group', role: 'group', 'aria-label': t('prompts.filter.range') },
          RANGES.map(([value, key]) => h('button', {
            key: value,
            type: 'button',
            className: `pl-range${(filters.range ?? 'all') === value ? ' is-active' : ''}`,
            onClick: () => update({ range: value }),
          }, t(key)))),
        h('div', { className: 'pl-search' },
          h(SearchIcon),
          h('input', {
            type: 'search',
            value: search,
            placeholder: t('prompts.search'),
            'aria-label': t('prompts.search'),
            onChange: (event) => setSearch(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') submitSearch();
            },
          }),
          search === '' ? null : h('button', {
            type: 'button',
            className: 'pl-search-clear',
            onClick: () => {
              setSearch('');
              update({ q: '' });
            },
            'aria-label': t('common.all'),
          }, h(CloseIcon, { size: 12 }))),
        h('select', {
          className: 'pl-select',
          value: filters.platform ?? '',
          'aria-label': t('prompts.filter.platform'),
          onChange: (event) => update({ platform: event.target.value }),
        },
        h('option', { value: '' }, t('prompts.filter.platformAll')),
        platforms.map((entry) => h('option', { key: entry.value, value: entry.value }, platformName(entry.value, zh, bootstrap)))),
        h('select', {
          className: 'pl-select',
          value: filters.model ?? '',
          'aria-label': t('prompts.filter.model'),
          onChange: (event) => update({ model: event.target.value }),
        },
        h('option', { value: '' }, t('prompts.filter.modelAll')),
        models.map((entry) => h('option', { key: entry.value, value: entry.value }, entry.value))),
        h('select', {
          className: 'pl-select',
          value: filters.tool ?? '',
          'aria-label': t('prompts.filter.tool'),
          onChange: (event) => update({ tool: event.target.value }),
        },
        h('option', { value: '' }, t('prompts.filter.toolAll')),
        tools.map((entry) => h('option', { key: `${entry.category}:${entry.value}`, value: entry.value }, entry.value))),
        h('select', {
          className: 'pl-select is-narrow',
          value: filters.minRating ?? '',
          'aria-label': t('prompts.filter.rating'),
          onChange: (event) => update({ minRating: event.target.value }),
        },
        h('option', { value: '' }, t('prompts.filter.anyRating')),
        [5, 4, 3, 2, 1].map((stars) => h('option', { key: stars, value: String(stars) }, `${stars}★+`))),
        h('select', {
          className: 'pl-select is-narrow',
          value: filters.sort ?? 'newest',
          'aria-label': 'sort',
          onChange: (event) => update({ sort: event.target.value }),
        },
        h('option', { value: 'newest' }, t('prompts.sort.newest')),
        h('option', { value: 'rating' }, t('prompts.sort.rating')),
        h('option', { value: 'tokens' }, t('prompts.sort.tokens')),
        h('option', { value: 'auto' }, t('prompts.sort.auto'))));
    }

    /* ------------------------------------------------------------------ */
    /* Prompt rows                                                         */
    /* ------------------------------------------------------------------ */

    function PromptRow({ item, selected, onSelect, onRate, t, bootstrap, zh }) {
      const rating = item.rating?.stars ?? 0;
      return h('div', {
        role: 'button',
        tabIndex: 0,
        className: `pl-prompt-row${selected ? ' is-selected' : ''}`,
        onClick: () => onSelect(item.id),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(item.id);
          }
        },
        'aria-pressed': selected ? 'true' : 'false',
      },
      h('span', { className: 'pl-row-top' },
        h('span', { className: 'pl-row-platform' }, platformName(item.platform, zh, bootstrap)),
        h('span', { className: 'pl-dot', 'aria-hidden': true }),
        h('span', { className: 'pl-row-model' }, modelLabel(item)),
        h('span', { className: 'pl-row-time' }, formatDate(item.createdAt, zh)),
        h(StatusBadge, { status: item.status, t })),
      h('span', { className: 'pl-row-prompt' }, item.promptPreview ?? item.prompt),
      h('span', { className: 'pl-row-bottom' },
        h('span', { className: 'pl-row-rating' },
          h(Stars, { value: rating, size: 13, onRate: (stars) => onRate(item.id, stars), label: t('prompts.humanEval') }),
          item.auto?.total === null || item.auto?.total === undefined
            ? null
            : h('span', { className: 'pl-auto-mini', title: t('prompts.autoEval') },
              h(SparkIcon, { size: 11 }),
              Number(item.auto.total).toFixed(1))),
        h('span', { className: 'pl-row-tokens' }, `${formatTokens(item.tokens?.total)} ${t('metric.tokens')}`),
        h(ToolChips, {
          tools: item.tools,
          skills: item.skills,
          mcp: item.mcp,
          limit: 3,
          t,
        })));
    }

    function PromptList({ data, selectedId, onSelect, onRate, t, bootstrap, zh, loadingMore, onLoadMore }) {
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) {
        return h(EmptyState, { title: t('state.empty'), hint: t('state.emptyHint') });
      }
      return h('div', { className: 'pl-prompt-list' },
        items.map((item) => h(PromptRow, {
          key: item.id,
          item,
          selected: item.id === selectedId,
          onSelect,
          onRate,
          t,
          bootstrap,
          zh,
        })),
        data.total > items.length
          ? h('button', {
            type: 'button',
            className: 'pl-btn is-wide',
            disabled: loadingMore,
            onClick: onLoadMore,
          }, loadingMore ? t('common.loading') : `${t('prompts.loadMore')} · ${data.total - items.length}`)
          : null);
    }

    /* ------------------------------------------------------------------ */
    /* Prompt detail                                                       */
    /* ------------------------------------------------------------------ */

    function Metric({ label, value, hint }) {
      return h('div', { className: 'pl-metric' },
        h('span', { className: 'pl-metric-label' }, label),
        h('span', { className: 'pl-metric-value' }, value),
        hint === undefined ? null : h('span', { className: 'pl-metric-hint' }, hint));
    }

    function DimensionBars({ dimensions, rubric, t, zh }) {
      const entries = Array.isArray(rubric?.dimensions) ? rubric.dimensions : [];
      const values = dimensions ?? {};
      if (entries.length === 0) return null;
      return h('div', { className: 'pl-dimensions' },
        entries.map((dimension) => {
          const value = Number(values[dimension.id] ?? 0);
          const label = zh ? (dimension.zh || dimension.en) : (dimension.en || dimension.zh);
          return h('div', { key: dimension.id, className: 'pl-dimension-row' },
            h('span', { className: 'pl-dimension-label' }, label),
            h(MiniBar, { value, max: 5, tone: value >= 4 ? 'success' : value <= 2 ? 'error' : 'brand' }),
            h('span', { className: 'pl-dimension-value' }, Number.isFinite(value) && value > 0 ? value.toFixed(1) : '—'));
        }));
    }

    function PromptDetail({ prompt, t, zh, bootstrap, onClose, onRate, onSaveNote, onSaveTags, onToggleFavorite, onRetry }) {
      const [note, setNote] = useState('');
      const [tags, setTags] = useState('');
      const [showAudit, setShowAudit] = useState(false);
      const promptId = prompt?.id;
      useEffect(() => {
        setNote(prompt?.rating?.note ?? prompt?.note ?? '');
        setTags(Array.isArray(prompt?.tags) ? prompt.tags.join(', ') : '');
        setShowAudit(false);
      }, [promptId]);
      if (prompt === null || prompt === undefined) {
        return h('div', { className: 'pl-detail-empty' },
          h('span', { className: 'pl-empty-mark' }, h(StarIcon, { size: 18, filled: false })),
          h('p', null, t('prompts.noDetail')));
      }
      const rating = prompt.rating?.stars ?? 0;
      const tokens = prompt.tokens ?? {};
      const auto = prompt.auto;
      const events = Array.isArray(prompt.events) ? prompt.events : [];
      const lastHash = events.length > 0 ? events[events.length - 1].hash : prompt.rowHash;
      return h('div', { className: 'pl-detail' },
        h('div', { className: 'pl-detail-head' },
          h('div', null,
            h('h2', null, t('prompts.detail')),
            h('p', { className: 'pl-detail-sub' },
              platformName(prompt.platform, zh, bootstrap),
              ' · ',
              formatFullDate(prompt.createdAt, zh),
              prompt.turn === null || prompt.turn === undefined ? null : ` · ${interpolate(t('prompts.turn'), { turn: prompt.turn })}`)),
          h('div', { className: 'pl-detail-actions' },
            h('button', {
              type: 'button',
              className: `pl-iconbtn${prompt.favorite ? ' is-on' : ''}`,
              title: prompt.favorite ? t('prompts.favorited') : t('prompts.favorite'),
              'aria-label': prompt.favorite ? t('prompts.favorited') : t('prompts.favorite'),
              onClick: () => onToggleFavorite(prompt.id, !prompt.favorite),
            }, h(StarIcon, { size: 15, filled: prompt.favorite })),
            h('button', {
              type: 'button',
              className: 'pl-iconbtn',
              title: t('action.close'),
              'aria-label': t('action.close'),
              onClick: onClose,
            }, h(CloseIcon))),
        ),

        h('div', { className: 'pl-detail-badges' },
          h(StatusBadge, { status: prompt.status, t }),
          prompt.model ? h(Badge, { tone: 'brand' }, prompt.model) : null,
          prompt.auto?.total !== undefined && prompt.auto?.total !== null ? h(Badge, { tone: 'spark' }, `${t('prompts.autoEval')} ${Number(prompt.auto.total).toFixed(1)}`) : null,
          Array.isArray(prompt.skills) && prompt.skills.length > 0 ? h(Badge, { tone: 'skill' }, `Skill · ${prompt.skills.length}`) : null,
          Array.isArray(prompt.mcp) && prompt.mcp.length > 0 ? h(Badge, { tone: 'mcp' }, `MCP · ${prompt.mcp.length}`) : null),

        h('div', { className: 'pl-block' },
          h('div', { className: 'pl-block-label' }, t('prompts.prompt')),
          h('div', { className: 'pl-quote' }, prompt.prompt || '—')),

        h('div', { className: 'pl-block' },
          h('div', { className: 'pl-block-label' }, t('prompts.response')),
          prompt.response
            ? h('div', { className: 'pl-answer' }, prompt.response)
            : h('p', { className: 'pl-muted' }, t('prompts.noResponse'))),

        h('div', { className: 'pl-metrics-grid' },
          h(Metric, { label: t('metric.input'), value: formatTokens(tokens.input) }),
          h(Metric, { label: t('metric.output'), value: formatTokens(tokens.output) }),
          h(Metric, { label: t('metric.total'), value: formatTokens(tokens.total) }),
          h(Metric, { label: t('metric.latency'), value: formatDuration(prompt.latencyMs) }),
          h(Metric, { label: t('metric.toolCalls'), value: `${prompt.toolCalls ?? 0}${prompt.toolErrors ? ` · ${prompt.toolErrors} ${t('metric.errors')}` : ''}` }),
          h(Metric, { label: t('detail.turn'), value: prompt.turn ?? '—' })),

        h('div', { className: 'pl-review-grid' },
          h('div', { className: 'pl-review-card' },
            h('div', { className: 'pl-block-label' }, t('prompts.humanEval')),
            h(Stars, {
              value: rating,
              size: 25,
              onRate: (stars) => onRate(prompt.id, stars),
              label: t('prompts.humanEval'),
            }),
            h('p', { className: 'pl-small pl-muted' }, t('prompts.rateHint')),
            h('textarea', {
              className: 'pl-textarea',
              value: note,
              placeholder: t('prompts.notePlaceholder'),
              onChange: (event) => setNote(event.target.value),
            }),
            h('button', {
              type: 'button',
              className: 'pl-btn is-primary',
              onClick: () => onSaveNote(prompt.id, rating, note),
            }, t('prompts.saveNote')),
            h('div', { className: 'pl-tags' },
              h('input', {
                type: 'text',
                className: 'pl-input',
                value: tags,
                placeholder: t('prompts.tagsPlaceholder'),
                onChange: (event) => setTags(event.target.value),
              }),
              h('button', {
                type: 'button',
                className: 'pl-btn',
                onClick: () => onSaveTags(prompt.id, tags),
              }, t('prompts.saveTags')))),
          h('div', { className: 'pl-review-card' },
            h('div', { className: 'pl-block-label' }, t('prompts.autoEval')),
            auto === null || auto === undefined
              ? h('p', { className: 'pl-muted pl-small' }, t('prompts.autoNone'))
              : h(React.Fragment, null,
                h('div', { className: 'pl-auto-head' },
                  h('strong', null, Number(auto.total).toFixed(1)),
                  h('span', { className: 'pl-muted' }, `/ 5 · ${interpolate(t('prompts.rubricVersion'), { version: auto.rubricVersion ?? '—' })}`)),
                h(DimensionBars, { dimensions: auto.dimensions, rubric: bootstrap?.rubric, t, zh }),
                auto.notes ? h('p', { className: 'pl-auto-notes' }, auto.notes) : null))),

        h('div', { className: 'pl-block' },
          h('div', { className: 'pl-block-label' }, t('prompts.toolsUsed')),
          Array.isArray(prompt.toolInvocations) && prompt.toolInvocations.length > 0
            ? h('div', { className: 'pl-tool-list' }, prompt.toolInvocations.map((tool) => h('div', {
              key: tool.id,
              className: `pl-tool-row${tool.status === 'error' ? ' is-error' : ''}`,
            },
            h('span', { className: `pl-tool-cat is-${tool.category}` }, tool.category),
            h('span', { className: 'pl-tool-name' }, tool.name),
            h('span', { className: 'pl-tool-status' }, tool.status === 'error' ? t('metric.errors') : 'OK'),
            tool.error ? h('span', { className: 'pl-tool-error' }, truncate(tool.error, 120)) : null)))
            : h('p', { className: 'pl-muted pl-small' }, t('prompts.noTools'))),

        h('div', { className: 'pl-block' },
          h('div', { className: 'pl-block-label' }, t('prompts.metadata')),
          h('div', { className: 'pl-meta-grid' },
            h(Metric, { label: t('detail.platform'), value: platformName(prompt.platform, zh, bootstrap) }),
            h(Metric, { label: t('metric.model'), value: prompt.model ?? '—' }),
            h(Metric, { label: t('detail.session'), value: prompt.sessionId ? truncate(prompt.sessionId, 20) : '—' }),
            h(Metric, { label: t('detail.hash'), value: prompt.promptHash ? `${prompt.promptHash.slice(0, 12)}…` : '—' }),
            h(Metric, { label: t('metric.cache'), value: formatTokens(tokens.cacheRead) }),
            h(Metric, { label: t('metric.reasoning'), value: formatTokens(tokens.reasoning) }))),

        Array.isArray(prompt.submissions) && prompt.submissions.length > 1
          ? h('div', { className: 'pl-block' },
            h('div', { className: 'pl-block-label' }, `${t('prompts.submissionsLabel')} · ${interpolate(t('prompts.submissions'), { count: prompt.submissions.length })}`),
            h('div', { className: 'pl-submissions' }, prompt.submissions.map((submission, index) => h('div', {
              key: submission.id,
              className: 'pl-submission',
            },
            h('span', { className: 'pl-submission-index' }, `#${index + 1}`),
            h('p', null, submission.text)))))
          : null,

        h('div', { className: 'pl-block' },
          h('button', {
            type: 'button',
            className: 'pl-audit-toggle',
            onClick: () => setShowAudit((value) => !value),
          },
          h('span', null, t('prompts.audit')),
          h('span', { className: 'pl-muted pl-small' }, interpolate(t('prompts.auditHint'), {
            count: events.length,
            hash: lastHash ? `${lastHash.slice(0, 10)}…` : '—',
          })),
          h(ChevronIcon, { open: showAudit })),
          showAudit
            ? h('div', { className: 'pl-audit' },
              events.length === 0
                ? h('p', { className: 'pl-muted pl-small' }, t('detail.noEvents'))
                : events.map((event) => h('div', { key: event.id, className: 'pl-audit-row' },
                  h('span', { className: 'pl-audit-kind' }, event.kind),
                  h('span', { className: 'pl-audit-time' }, formatDate(event.createdAt, zh)),
                  h('code', { className: 'pl-audit-hash' }, event.hash.slice(0, 12)))))
            : null));
    }

    /* ------------------------------------------------------------------ */
    /* Overview                                                            */
    /* ------------------------------------------------------------------ */

    function Kpi({ label, value, hint, tone = 'plain' }) {
      return h('div', { className: `pl-kpi is-${tone}` },
        h('span', { className: 'pl-kpi-label' }, label),
        h('strong', { className: 'pl-kpi-value' }, value),
        hint === undefined ? null : h('span', { className: 'pl-kpi-hint' }, hint));
    }

    function InsightList({ insights, t, zh }) {
      const entries = Array.isArray(insights) ? insights : [];
      if (entries.length === 0) return h('p', { className: 'pl-muted pl-small' }, t('overview.insight.empty'));
      return h('div', { className: 'pl-insights' }, entries.map((insight, index) => {
        const data = insight.data ?? {};
        let text = t('overview.insight.empty');
        if (insight.code === 'bestModel') {
          text = interpolate(t('overview.insight.bestModel'), {
            model: data.model,
            rating: data.rating,
            count: data.count,
          });
        } else if (insight.code === 'toolErrors') {
          text = interpolate(t('overview.insight.toolErrors'), {
            tool: data.tool,
            errors: data.errors,
            calls: data.calls,
          });
        } else if (insight.code === 'lowRated') {
          text = interpolate(t('overview.insight.lowRated'), { count: data.count });
        } else if (insight.code === 'highRated') {
          text = interpolate(t('overview.insight.highRated'), { count: data.count });
        } else if (insight.code === 'avgTokens') {
          text = interpolate(t('overview.insight.avgTokens'), { avg: formatNumber(data.avg) });
        }
        return h('div', { key: `${insight.code}-${index}`, className: `pl-insight is-${insight.tone ?? 'neutral'}` },
          h('span', { className: 'pl-insight-dot' }),
          h('span', null, text));
      }));
    }

    function ModelBars({ models, t }) {
      const entries = Array.isArray(models) ? models : [];
      if (entries.length === 0) return h('p', { className: 'pl-muted pl-small' }, t('overview.noModels'));
      const max = Math.max(1, ...entries.map((entry) => entry.count));
      return h('div', { className: 'pl-bars' }, entries.map((entry) => h('div', { key: entry.model, className: 'pl-bar-row' },
        h('div', { className: 'pl-bar-head' },
          h('span', { className: 'pl-bar-name' }, entry.model),
          h('span', { className: 'pl-bar-value' }, `${entry.count} · ${entry.rating ? Number(entry.rating).toFixed(1) : '—'}★`)),
        h(MiniBar, { value: entry.count, max, tone: 'brand' }))));
    }

    function ToolBars({ tools, t }) {
      const entries = Array.isArray(tools) ? tools : [];
      if (entries.length === 0) return h('p', { className: 'pl-muted pl-small' }, t('state.empty'));
      const max = Math.max(1, ...entries.map((entry) => entry.calls));
      return h('div', { className: 'pl-bars' }, entries.map((entry) => h('div', { key: entry.name, className: 'pl-bar-row' },
        h('div', { className: 'pl-bar-head' },
          h('span', { className: 'pl-bar-name' }, entry.name),
          h('span', { className: 'pl-bar-value' }, `${entry.calls}${entry.errors > 0 ? ` · ${entry.errors} err` : ''}`)),
        h(MiniBar, { value: entry.calls, max, tone: entry.errors > 0 ? 'warn' : 'brand' }))));
    }

    function OverviewView({ data, loading, error, t, zh, bootstrap, onRetry, onSelect, onRate, onViewAll }) {
      if (loading && data === null) return h(LoadingRows, { rows: 8 });
      if (error !== null) return h(ErrorState, { title: t('state.error'), message: error, onRetry, retryLabel: t('action.retry') });
      if (data === null) return null;
      const kpis = data.kpis ?? {};
      const insights = data.insights ?? [];
      return h('div', { className: 'pl-view' },
        h('div', { className: 'pl-kpis' },
          h(Kpi, {
            label: t('kpi.prompts'),
            value: formatNumber(kpis.prompts),
            hint: `${formatNumber(kpis.rated)} ${t('kpi.rated')}`,
            tone: 'brand',
          }),
          h(Kpi, {
            label: t('kpi.rating'),
            value: kpis.avgRating ? Number(kpis.avgRating).toFixed(2) : '—',
            hint: kpis.avgRating ? `5 ★ · ${formatNumber(kpis.rated)} ${t('kpi.rated')}` : t('kpi.noRating'),
            tone: 'success',
          }),
          h(Kpi, {
            label: t('kpi.success'),
            value: `${Number(kpis.successRate ?? 0).toFixed(0)}%`,
            hint: `${formatNumber(kpis.completed)} / ${formatNumber(kpis.prompts)}`,
            tone: 'plain',
          }),
          h(Kpi, {
            label: t('kpi.tokens'),
            value: formatTokens(kpis.tokens),
            hint: `${formatNumber(kpis.toolCalls)} ${t('kpi.tools')} · ${kpis.avgAuto ? Number(kpis.avgAuto).toFixed(1) : '—'} ${t('kpi.auto')}`,
            tone: 'spark',
          })),

        h('div', { className: 'pl-overview-grid' },
          h(Section, {
            title: t('overview.trend'),
            hint: t('overview.trendHint'),
            className: 'pl-trend-card',
          }, h(TrendChart, { data: data.trend, zh, t })),
          h(Section, {
            title: t('overview.insights'),
            className: 'pl-insight-card',
          }, h(InsightList, { insights, t, zh }))),

        h('div', { className: 'pl-two-col' },
          h(Section, {
            title: t('overview.models'),
            actions: h('button', { type: 'button', className: 'pl-linkbtn', onClick: onViewAll }, t('overview.viewAll')),
          }, h(ModelBars, { models: data.models, t })),
          h(Section, {
            title: t('overview.topTools'),
          }, h(ToolBars, { tools: data.tools, t }))),

        h(Section, {
          title: t('overview.recent'),
          actions: h('button', { type: 'button', className: 'pl-linkbtn', onClick: onViewAll }, t('overview.viewAll')),
        }, Array.isArray(data.recent) && data.recent.length > 0
          ? h('div', { className: 'pl-prompt-list is-compact' }, data.recent.map((item) => h(PromptRow, {
            key: item.id,
            item,
            selected: false,
            onSelect,
            onRate,
            t,
            bootstrap,
            zh,
          })))
          : h(EmptyState, { title: t('state.empty'), hint: t('state.emptyHint') })));
    }

    /* ------------------------------------------------------------------ */
    /* Analytics                                                           */
    /* ------------------------------------------------------------------ */

    function DataTable({ columns, rows, empty, t }) {
      if (!Array.isArray(rows) || rows.length === 0) {
        return h('p', { className: 'pl-muted pl-small' }, empty ?? t('analytics.empty'));
      }
      return h('div', { className: 'pl-table-wrap' },
        h('table', { className: 'pl-table' },
          h('thead', null, h('tr', null, columns.map((column) => h('th', { key: column.key }, column.label)))),
          h('tbody', null, rows.map((row, index) => h('tr', { key: row.id ?? index },
            columns.map((column) => h('td', {
              key: column.key,
              className: column.align === 'right' ? 'is-right' : undefined,
            }, column.render === undefined ? row[column.key] : column.render(row))))))));
    }

    function AnalyticsView({ data, loading, error, t, zh, onRetry }) {
      const [tableTab, setTableTab] = useState('tools');
      if (loading && data === null) return h(LoadingRows, { rows: 8 });
      if (error !== null) return h(ErrorState, { title: t('state.error'), message: error, onRetry, retryLabel: t('action.retry') });
      if (data === null) return null;
      const models = Array.isArray(data.models) ? data.models : [];
      const tools = Array.isArray(data.tools) ? data.tools : [];
      const skills = Array.isArray(data.skills) ? data.skills : [];
      const mcp = Array.isArray(data.mcp) ? data.mcp : [];
      const combos = Array.isArray(data.combos) ? data.combos : [];
      const distribution = Array.isArray(data.distribution) ? data.distribution : [];
      const calibration = Array.isArray(data.calibration) ? data.calibration : [];
      const active = tableTab === 'tools' ? tools : tableTab === 'skills' ? skills : mcp;
      const gapRows = calibration.filter((entry) => entry.count > 0);
      const meanGap = gapRows.length === 0
        ? null
        : gapRows.reduce((sum, entry) => sum + Math.abs(entry.auto - entry.human), 0) / gapRows.length;

      return h('div', { className: 'pl-view' },
        h('div', { className: 'pl-analytics-kpis' },
          h(Kpi, { label: t('analytics.models'), value: formatNumber(data.totals?.models ?? models.length), tone: 'brand' }),
          h(Kpi, { label: t('analytics.tools'), value: formatNumber(data.totals?.tools ?? tools.length) }),
          h(Kpi, { label: t('analytics.skills'), value: formatNumber(data.totals?.skills ?? skills.length) }),
          h(Kpi, { label: t('analytics.mcp'), value: formatNumber(data.totals?.mcp ?? mcp.length) }),
          h(Kpi, {
            label: t('analytics.autoHumanGap'),
            value: meanGap === null ? '—' : meanGap.toFixed(2),
            hint: t('analytics.calibrationHint'),
            tone: 'spark',
          })),

        h(Section, { title: t('analytics.models') },
          h(DataTable, {
            t,
            columns: [
              { key: 'name', label: t('analytics.table.model'), render: (row) => h('div', { className: 'pl-table-name' }, h('strong', null, row.name), h('span', null, row.provider ?? '')) },
              { key: 'count', label: t('analytics.table.runs'), align: 'right', render: (row) => formatNumber(row.count) },
              { key: 'success', label: t('analytics.table.success'), align: 'right', render: (row) => `${(Number(row.success) * 100).toFixed(0)}%` },
              { key: 'rating', label: t('analytics.table.rating'), align: 'right', render: (row) => h(StarText, { value: row.rating || null, t }) },
              { key: 'auto', label: t('analytics.table.auto'), align: 'right', render: (row) => row.auto ? Number(row.auto).toFixed(2) : '—' },
              { key: 'tokens', label: t('analytics.table.tokens'), align: 'right', render: (row) => formatTokens(row.tokens) },
              { key: 'latency', label: t('analytics.table.latency'), align: 'right', render: (row) => formatDuration(row.latency) },
            ],
            rows: models,
          })),

        h('div', { className: 'pl-two-col is-wide-left' },
          h(Section, {
            title: t('analytics.combos'),
          }, h(DataTable, {
            t,
            columns: [
              { key: 'model', label: t('analytics.table.combo'), render: (row) => h('div', { className: 'pl-table-name' }, h('strong', null, row.model), h('span', null, row.tool)) },
              { key: 'count', label: t('analytics.table.runs'), align: 'right' },
              { key: 'rating', label: t('analytics.table.rating'), align: 'right', render: (row) => row.rating ? Number(row.rating).toFixed(2) : '—' },
              { key: 'success', label: t('analytics.table.success'), align: 'right', render: (row) => `${(Number(row.success) * 100).toFixed(0)}%` },
            ],
            rows: combos,
          })),
          h(Section, {
            title: t('analytics.calibration'),
            hint: t('analytics.calibrationHint'),
          }, h(CalibrationChart, { data: calibration, t }))),

        h('div', { className: 'pl-two-col' },
          h(Section, { title: t('analytics.distribution') }, h(RatingDistribution, { data: distribution, t })),
          h(Section, {
            title: t('analytics.tools'),
            actions: h('div', { className: 'pl-segmented' },
              ['tools', 'skills', 'mcp'].map((key) => h('button', {
                key,
                type: 'button',
                className: `pl-segment${tableTab === key ? ' is-active' : ''}`,
                onClick: () => setTableTab(key),
              }, t(`analytics.${key}`)))),
          }, h(DataTable, {
            t,
            columns: [
              { key: 'name', label: t('analytics.table.tool'), render: (row) => h('strong', null, row.name) },
              { key: 'count', label: t('analytics.count'), align: 'right', render: (row) => formatNumber(row.count ?? row.calls) },
              { key: 'rating', label: t('analytics.table.rating'), align: 'right', render: (row) => row.rating ? Number(row.rating).toFixed(2) : '—' },
              { key: 'success', label: t('analytics.table.success'), align: 'right', render: (row) => `${(Number(row.success ?? 0) * 100).toFixed(0)}%` },
            ],
            rows: active,
          }))),

        h(Section, {
          title: t('connect.rubric'),
          hint: t('connect.rubric.desc'),
        }, h('div', { className: 'pl-rubric-summary' }, (data.rubric?.dimensions ?? []).map((dimension) => h('div', {
          key: dimension.id,
          className: 'pl-rubric-pill',
        },
        h('span', null, dimension.zh || dimension.en),
        h('strong', null, `${Math.round(Number(dimension.weight) * 100)}%`))))));
    }

    /* ------------------------------------------------------------------ */
    /* Connect                                                             */
    /* ------------------------------------------------------------------ */

    const PLATFORM_ROWS = [
      ['chatgpt', 'connect.chatgpt', 'connect.chatgpt.method', 'connect.partial'],
      ['codex', 'connect.codex', 'connect.codex.method', 'connect.partial'],
      ['workbuddy', 'connect.workbuddy', 'connect.workbuddy.method', 'connect.partial'],
      ['doubao', 'connect.doubao', 'connect.doubao.method', 'connect.partial'],
      ['trae', 'connect.trae', 'connect.trae.method', 'connect.partial'],
    ];

    function CopyField({ label, value, secret = false, t, notify }) {
      const [visible, setVisible] = useState(!secret);
      const display = secret && !visible ? '•'.repeat(Math.min(32, String(value ?? '').length)) : (value ?? '—');
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(String(value ?? ''));
          notify(t('action.copied'), 'success');
        } catch (error) {
          notify(interpolate(t('toast.error'), { message: error.message }), 'error');
        }
      };
      return h('div', { className: 'pl-copy-field' },
        h('span', { className: 'pl-copy-label' }, label),
        h('div', { className: 'pl-copy-row' },
          h('code', { className: 'pl-copy-value' }, display),
          secret
            ? h('button', {
              type: 'button',
              className: 'pl-iconbtn is-text',
              onClick: () => setVisible((value) => !value),
            }, visible ? t('connect.hide') : t('connect.reveal'))
            : null,
          h('button', {
            type: 'button',
            className: 'pl-iconbtn is-text',
            onClick: copy,
            title: t('action.copy'),
            'aria-label': t('action.copy'),
          }, h(CopyIcon, { size: 13 }), t('action.copy'))));
    }

    function ConnectView({
      bootstrap, t, zh, settingsDraft, setSettingsDraft, rubricDraft, setRubricDraft,
      onSaveSettings, onSaveRubric, onCheckIntegrity, integrity, onExportAll, notify,
    }) {
      if (bootstrap === null) return h(LoadingRows, { rows: 6 });
      const ingest = bootstrap.ingest ?? {};
      const settings = settingsDraft ?? bootstrap.settings ?? {};
      const rubric = rubricDraft ?? bootstrap.rubric ?? { dimensions: [] };
      const dimensions = Array.isArray(rubric.dimensions) ? rubric.dimensions : [];
      const updateDimension = (index, patch) => {
        const next = dimensions.map((dimension, current) => current === index ? { ...dimension, ...patch } : dimension);
        setRubricDraft({ ...rubric, dimensions: next });
      };
      const addDimension = () => {
        setRubricDraft({
          ...rubric,
          dimensions: [...dimensions, {
            id: `dim_${Date.now().toString(36)}`,
            zh: '新维度',
            en: 'New dimension',
            weight: 0.1,
            descriptionZh: '',
            descriptionEn: '',
          }],
        });
      };
      const removeDimension = (index) => {
        if (dimensions.length <= 3) {
          notify(t('connect.rubric.desc'), 'error');
          return;
        }
        setRubricDraft({ ...rubric, dimensions: dimensions.filter((_, current) => current !== index) });
      };
      return h('div', { className: 'pl-view' },
        h('div', { className: 'pl-connect-hero' },
          h('div', { className: 'pl-connect-mark' }, h(PanelIcon, { size: 30, active: true })),
          h('div', null,
            h('h2', null, t('connect.title')),
            h('p', null, t('connect.subtitle'))),
          h('span', { className: 'pl-status-pill is-ok' }, h(CheckIcon), t('connect.active'))),

        h(Section, { title: t('connect.native') },
          h('div', { className: 'pl-native' },
            h('div', { className: 'pl-native-copy' },
              h('strong', null, 'DeepSeek Harness'),
              h('p', null, t('connect.native.desc'))),
            h('div', { className: 'pl-native-meta' },
              h(Badge, { tone: 'success' }, t('connect.active')),
              h('span', { className: 'pl-muted pl-small' }, `${bootstrap.counts?.prompts ?? 0} prompts · ${bootstrap.counts?.events ?? 0} events`)))),

        h(Section, { title: t('connect.platform'), hint: t('connect.subtitle') },
          h('div', { className: 'pl-platform-table' },
            h('div', { className: 'pl-platform-head' },
              h('span', null, t('connect.platform')),
              h('span', null, t('connect.method')),
              h('span', null, t('connect.status'))),
            PLATFORM_ROWS.map(([id, labelKey, methodKey, statusKey]) => h('div', { key: id, className: 'pl-platform-row' },
              h('strong', null, t(labelKey)),
              h('span', { className: 'pl-muted' }, t(methodKey)),
              h(Badge, { tone: 'warn' }, t(statusKey)))))),

        h('div', { className: 'pl-two-col' },
          h(Section, { title: t('connect.endpoint') },
            ingest.url
              ? h('div', { className: 'pl-copy-stack' },
                h(CopyField, { label: t('connect.endpoint'), value: ingest.url, t, notify }),
                h(CopyField, { label: t('connect.token'), value: ingest.token, secret: true, t, notify }),
                h('p', { className: 'pl-small pl-muted' }, 'POST JSON · x-prompt-ledger-token'))
              : h('p', { className: 'pl-muted pl-small' }, t('connect.noEndpoint')),
            h('div', { className: 'pl-copy-stack', style: { marginTop: '10px' } },
              h(CopyField, {
                label: t('connect.mcpCommand'),
                value: bootstrap.bundleDir ? `node ${bootstrap.bundleDir}adapters/mcp-server.mjs` : 'node <plugin>/adapters/mcp-server.mjs',
                t,
                notify,
              })),
            h('p', { className: 'pl-small pl-muted' }, t('connect.mcpHint'))),

          h(Section, {
            title: t('connect.integrity'),
            actions: h('button', {
              type: 'button',
              className: 'pl-btn',
              onClick: onCheckIntegrity,
              disabled: integrity?.loading === true,
            }, integrity?.loading ? t('common.loading') : t('connect.integrity.check')),
          },
          integrity === null
            ? h('p', { className: 'pl-muted pl-small' }, t('connect.integrity.check'))
            : integrity.loading
              ? h(LoadingRows, { rows: 2 })
              : h(React.Fragment, null,
                h('div', { className: `pl-integrity is-${integrity.ok ? 'ok' : 'bad'}` },
                  h('span', { className: 'pl-integrity-icon' }, integrity.ok ? h(ShieldIcon, { size: 18 }) : h(CloseIcon, { size: 18 })),
                  h('div', null,
                    h('strong', null, integrity.ok
                      ? t('connect.integrity.ok')
                      : interpolate(t('connect.integrity.bad'), { count: integrity.issues?.length ?? 0 })),
                    h('p', null, `${interpolate(t('connect.integrity.events'), { count: integrity.checkedEvents ?? 0 })} · ${interpolate(t('connect.integrity.prompts'), { count: integrity.checkedPrompts ?? 0 })}`),
                    h('code', null, interpolate(t('connect.integrity.head'), { hash: `${(integrity.lastHash ?? '').slice(0, 16)}…` })))),
                integrity.issues?.length > 0
                  ? h('div', { className: 'pl-integrity-issues' }, integrity.issues.map((issue, index) => h('code', { key: index }, JSON.stringify(issue))))
                  : null))),

        h('div', { className: 'pl-two-col' },
          h(Section, { title: t('connect.settings') },
            h('div', { className: 'pl-toggle-stack' },
              h(Toggle, {
                checked: settings.autoEval === true,
                onChange: (value) => setSettingsDraft({ ...settings, autoEval: value }),
                label: t('connect.autoEval'),
                description: t('connect.autoEval.desc'),
              }),
              h(Toggle, {
                checked: settings.modelEval === true,
                onChange: (value) => setSettingsDraft({ ...settings, modelEval: value }),
                label: t('connect.modelEval'),
                description: t('connect.modelEval.desc'),
              }),
              h(Toggle, {
                checked: settings.backfill === true,
                onChange: (value) => setSettingsDraft({ ...settings, backfill: value }),
                label: t('connect.backfill'),
              })),
            h('button', { type: 'button', className: 'pl-btn is-primary', onClick: onSaveSettings }, t('connect.save')),
            h('p', { className: 'pl-muted pl-small' }, t('connect.privacy'))),

          h(Section, { title: t('connect.database') },
            h('div', { className: 'pl-db-path' }, h('code', null, bootstrap.dbPath ?? '—')),
            h('div', { className: 'pl-db-actions' },
              h('button', { type: 'button', className: 'pl-btn', onClick: onExportAll }, h(ExportIcon), t('connect.exportAll'))),
            h('p', { className: 'pl-small pl-muted' }, t('foot.local')))),

        h(Section, {
          title: t('connect.rubric'),
          hint: t('connect.rubric.desc'),
          actions: h('button', { type: 'button', className: 'pl-btn', onClick: addDimension }, h(PlusIcon), t('connect.rubric.add')),
        },
        h('div', { className: 'pl-rubric-editor' },
          h('div', { className: 'pl-rubric-head' },
            h('span', null, t('connect.rubric.labelZh')),
            h('span', null, t('connect.rubric.labelEn')),
            h('span', null, t('connect.rubric.weight')),
            h('span', null, '')),
          dimensions.map((dimension, index) => h('div', { key: dimension.id ?? index, className: 'pl-rubric-row' },
            h('input', {
              type: 'text',
              className: 'pl-input',
              value: dimension.zh ?? '',
              'aria-label': t('connect.rubric.labelZh'),
              onChange: (event) => updateDimension(index, { zh: event.target.value }),
            }),
            h('input', {
              type: 'text',
              className: 'pl-input',
              value: dimension.en ?? '',
              'aria-label': t('connect.rubric.labelEn'),
              onChange: (event) => updateDimension(index, { en: event.target.value }),
            }),
            h('input', {
              type: 'number',
              min: '0.01',
              max: '1',
              step: '0.01',
              className: 'pl-input is-number',
              value: dimension.weight ?? 0.1,
              'aria-label': t('connect.rubric.weight'),
              onChange: (event) => updateDimension(index, { weight: event.target.value }),
            }),
            h('button', {
              type: 'button',
              className: 'pl-iconbtn',
              title: t('connect.rubric.remove'),
              'aria-label': t('connect.rubric.remove'),
              onClick: () => removeDimension(index),
            }, h(TrashIcon)))),
        h('div', { className: 'pl-rubric-foot' },
          h('span', { className: 'pl-muted pl-small' }, `${dimensions.length} ${t('prompts.dimensions')}`),
          h('button', { type: 'button', className: 'pl-btn is-primary', onClick: onSaveRubric }, t('connect.rubric.save'))))));
    }

    /* ------------------------------------------------------------------ */
    /* Panel                                                               */
    /* ------------------------------------------------------------------ */

    const TABS = [
      ['overview', 'nav.overview', 'pl-tab-overview'],
      ['prompts', 'nav.prompts', 'pl-tab-prompts'],
      ['analytics', 'nav.analytics', 'pl-tab-analytics'],
      ['connect', 'nav.connect', 'pl-tab-connect'],
    ];

    function Panel({ ctx, t }) {
      useLocaleTick(ctx);
      const zh = isChinese(ctx.locale.getLocale().active);
      const [tab, setTab] = useState('overview');
      const [filters, setFilters] = useState({
        range: '30d', platform: '', model: '', tool: '', minRating: '', q: '', sort: 'newest',
      });
      const [bootstrap, setBootstrap] = useState(null);
      const [bootstrapError, setBootstrapError] = useState(null);
      const [data, setData] = useState({ overview: null, prompts: null, analytics: null });
      const [loading, setLoading] = useState({ overview: false, prompts: false, analytics: false });
      const [errors, setErrors] = useState({ overview: null, prompts: null, analytics: null });
      const [refreshKey, setRefreshKey] = useState(0);
      const [selectedId, setSelectedId] = useState(null);
      const [detail, setDetail] = useState(null);
      const [detailLoading, setDetailLoading] = useState(false);
      const [detailError, setDetailError] = useState(null);
      const [loadingMore, setLoadingMore] = useState(false);
      const [settingsDraft, setSettingsDraft] = useState(null);
      const [rubricDraft, setRubricDraft] = useState(null);
      const [integrity, setIntegrity] = useState(null);
      const [toast, setToast] = useState(null);
      const requestId = useRef(0);

      const notify = useCallback((message, tone = 'success') => {
        setToast({ message, tone, at: Date.now() });
      }, []);

      useEffect(() => {
        if (toast === null) return undefined;
        const timer = setTimeout(() => setToast(null), 3200);
        return () => clearTimeout(timer);
      }, [toast]);

      useEffect(() => {
        const openPanel = (event) => {
          const id = event?.detail?.id;
          const target = event?.detail?.tab;
          if (typeof target === 'string' && target !== '') setTab(target);
          else if (typeof id === 'string' && id !== '') setTab('prompts');
          if (typeof id === 'string' && id !== '') setSelectedId(id);
          pendingPromptId = null;
          pendingPanelTab = null;
        };
        if (pendingPromptId !== null || pendingPanelTab !== null) {
          openPanel({ detail: { id: pendingPromptId, tab: pendingPanelTab } });
        }
        window.addEventListener('prompt-ledger:open', openPanel);
        return () => window.removeEventListener('prompt-ledger:open', openPanel);
      }, []);

      useEffect(() => {
        let cancelled = false;
        requestJson('/api/prompt-ledger/bootstrap')
          .then((body) => {
            if (cancelled) return;
            setBootstrap(body);
            setSettingsDraft(body.settings);
            setRubricDraft(body.rubric);
            setBootstrapError(null);
          })
          .catch((error) => {
            if (!cancelled) setBootstrapError(error.message);
          });
        return () => {
          cancelled = true;
        };
      }, [refreshKey]);

      const loadTab = useCallback(async (target = tab) => {
        if (target === 'connect') return;
        const id = ++requestId.current;
        setLoading((state) => ({ ...state, [target]: true }));
        setErrors((state) => ({ ...state, [target]: null }));
        try {
          const query = buildQuery(filters);
          const path = target === 'overview'
            ? `/api/prompt-ledger/overview?${query}`
            : target === 'prompts'
              ? `/api/prompt-ledger/prompts?${query}&limit=80&offset=0`
              : `/api/prompt-ledger/analytics?${query}`;
          const body = await requestJson(path);
          if (id !== requestId.current) return;
          setData((state) => ({ ...state, [target]: body }));
        } catch (error) {
          if (id !== requestId.current) return;
          setErrors((state) => ({ ...state, [target]: error.message }));
        } finally {
          if (id === requestId.current) setLoading((state) => ({ ...state, [target]: false }));
        }
      }, [filters, tab]);

      useEffect(() => {
        if (bootstrap === null) return;
        loadTab(tab);
      }, [bootstrap, tab, filters, refreshKey, loadTab]);

      useEffect(() => {
        if (tab !== 'connect' || integrity !== null || bootstrap === null) return;
        onCheckIntegrity();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tab, bootstrap]);

      const loadDetail = useCallback(async (id) => {
        if (id === null || id === undefined) {
          setDetail(null);
          return;
        }
        setDetailLoading(true);
        setDetailError(null);
        try {
          const body = await requestJson(`/api/prompt-ledger/prompt?id=${encodeURIComponent(id)}`);
          setDetail(body.prompt);
        } catch (error) {
          setDetailError(error.message);
        } finally {
          setDetailLoading(false);
        }
      }, []);

      useEffect(() => {
        loadDetail(selectedId);
      }, [selectedId, refreshKey, loadDetail]);

      const patchPromptEverywhere = useCallback((id, patch) => {
        setData((state) => {
          const next = { ...state };
          if (state.prompts !== null) {
            next.prompts = {
              ...state.prompts,
              items: state.prompts.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
            };
          }
          if (state.overview !== null) {
            next.overview = {
              ...state.overview,
              recent: state.overview.recent.map((item) => (item.id === id ? { ...item, ...patch } : item)),
            };
          }
          return next;
        });
        setDetail((current) => (current !== null && current.id === id ? { ...current, ...patch } : current));
      }, []);

      const ratePrompt = useCallback(async (id, stars, note) => {
        try {
          const selected = detail !== null && detail.id === id ? detail : null;
          const listed = data.prompts?.items?.find((item) => item.id === id)
            ?? data.overview?.recent?.find((item) => item.id === id);
          const preservedNote = selected?.rating?.note ?? listed?.rating?.note ?? '';
          const body = await requestJson('/api/prompt-ledger/rate', {
            method: 'POST',
            body: JSON.stringify({ id, stars, note: note === undefined ? preservedNote : note }),
          });
          patchPromptEverywhere(id, { rating: body.rating });
          markLedgerChanged();
          notify(t('toast.rated'), 'success');
          loadTab(tab);
          return true;
        } catch (error) {
          notify(interpolate(t('toast.error'), { message: error.message }), 'error');
          return false;
        }
      }, [data.overview, data.prompts, detail, loadTab, notify, patchPromptEverywhere, t, tab]);

      const saveNote = useCallback(async (id, stars, note) => {
        if (!stars) {
          notify(t('toast.rateFirst'), 'error');
          return;
        }
        const saved = await ratePrompt(id, stars, note);
        if (saved) notify(t('toast.noteSaved'), 'success');
      }, [notify, ratePrompt, t]);

      const saveTags = useCallback(async (id, value) => {
        const tags = String(value ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
        try {
          const body = await requestJson('/api/prompt-ledger/annotate', {
            method: 'POST',
            body: JSON.stringify({ id, tags }),
          });
          setDetail(body.prompt);
          patchPromptEverywhere(id, { tags });
          notify(t('toast.tagsSaved'), 'success');
        } catch (error) {
          notify(interpolate(t('toast.error'), { message: error.message }), 'error');
        }
      }, [notify, patchPromptEverywhere, t]);

      const toggleFavorite = useCallback(async (id, favorite) => {
        try {
          const body = await requestJson('/api/prompt-ledger/annotate', {
            method: 'POST',
            body: JSON.stringify({ id, favorite }),
          });
          setDetail(body.prompt);
          patchPromptEverywhere(id, { favorite });
          notify(t('toast.favorite'), 'success');
        } catch (error) {
          notify(interpolate(t('toast.error'), { message: error.message }), 'error');
        }
      }, [notify, patchPromptEverywhere, t]);

      const loadMore = useCallback(async () => {
        const current = data.prompts;
        if (current === null) return;
        setLoadingMore(true);
        try {
          const query = buildQuery(filters);
          const body = await requestJson(`/api/prompt-ledger/prompts?${query}&limit=80&offset=${current.items.length}`);
          setData((state) => ({
            ...state,
            prompts: {
              ...body,
              items: [...current.items, ...body.items],
            },
          }));
        } catch (error) {
          notify(interpolate(t('toast.error'), { message: error.message }), 'error');
        } finally {
          setLoadingMore(false);
        }
      }, [data.prompts, filters, notify, t]);

      const onCheckIntegrity = useCallback(async () => {
        setIntegrity({ loading: true, ok: true, checkedEvents: 0, checkedPrompts: 0, issues: [] });
        try {
          const body = await requestJson('/api/prompt-ledger/integrity');
          setIntegrity(body.integrity);
        } catch (error) {
          setIntegrity({ loading: false, ok: false, checkedEvents: 0, checkedPrompts: 0, issues: [{ message: error.message }] });
        }
      }, []);

      const saveSettings = useCallback(async () => {
        try {
          const body = await requestJson('/api/prompt-ledger/settings', {
            method: 'POST',
            body: JSON.stringify({
              autoEval: settingsDraft?.autoEval === true,
              modelEval: settingsDraft?.modelEval === true,
              backfill: settingsDraft?.backfill === true,
            }),
          });
          setBootstrap((current) => (current === null ? current : { ...current, settings: body.settings }));
          setSettingsDraft(body.settings);
          notify(t('connect.saved'), 'success');
        } catch (error) {
          notify(interpolate(t('toast.error'), { message: error.message }), 'error');
        }
      }, [notify, settingsDraft, t]);

      const saveRubric = useCallback(async () => {
        try {
          const body = await requestJson('/api/prompt-ledger/rubric', {
            method: 'POST',
            body: JSON.stringify({
              dimensions: (rubricDraft?.dimensions ?? []).map((dimension) => ({
                ...dimension,
                weight: Number(dimension.weight) || 0.01,
              })),
            }),
          });
          setBootstrap((current) => (current === null ? current : { ...current, rubric: body.rubric }));
          setRubricDraft(body.rubric);
          notify(t('connect.rubric.saved'), 'success');
        } catch (error) {
          notify(interpolate(t('connect.rubric.error'), { message: error.message }), 'error');
        }
      }, [notify, rubricDraft, t]);

      const exportCsv = useCallback(async (all = false) => {
        try {
          const query = all ? '' : buildQuery(filters);
          const response = await fetch(`/api/prompt-ledger/export?${query}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `prompt-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          notify(t('toast.exported'), 'success');
        } catch (error) {
          notify(interpolate(t('toast.error'), { message: error.message }), 'error');
        }
      }, [filters, notify, t]);

      const selectPrompt = useCallback((id) => {
        setSelectedId(id);
        setTab('prompts');
      }, []);

      const body = (() => {
        if (bootstrapError !== null) {
          return h(ErrorState, {
            title: t('state.error'),
            message: bootstrapError,
            onRetry: () => setRefreshKey((value) => value + 1),
            retryLabel: t('action.retry'),
          });
        }
        if (bootstrap === null) return h(LoadingRows, { rows: 8 });
        if (tab === 'overview') {
          return h(OverviewView, {
            data: data.overview,
            loading: loading.overview,
            error: errors.overview,
            t,
            zh,
            bootstrap,
            onRetry: () => loadTab('overview'),
            onSelect: selectPrompt,
            onRate: ratePrompt,
            onViewAll: () => setTab('prompts'),
          });
        }
        if (tab === 'prompts') {
          return h('div', { className: 'pl-split' },
            h('div', { className: 'pl-list-column' },
              h('div', { className: 'pl-list-meta' },
                h('span', null, interpolate(t('prompts.count'), { count: formatNumber(data.prompts?.total ?? 0) })),
                data.prompts?.total > 0 ? h('span', { className: 'pl-muted pl-small' }, `${data.prompts.items.length} / ${data.prompts.total}`) : null),
              loading.prompts && data.prompts === null
                ? h(LoadingRows, { rows: 8 })
                : errors.prompts !== null
                  ? h(ErrorState, { title: t('state.error'), message: errors.prompts, onRetry: () => loadTab('prompts'), retryLabel: t('action.retry') })
                  : h(PromptList, {
                    data: data.prompts,
                    selectedId,
                    onSelect: setSelectedId,
                    onRate: ratePrompt,
                    t,
                    bootstrap,
                    zh,
                    loadingMore,
                    onLoadMore: loadMore,
                  })),
            h('div', { className: 'pl-detail-column' },
              detailLoading && detail === null
                ? h(LoadingRows, { rows: 6 })
                : detailError !== null
                  ? h(ErrorState, { title: t('state.error'), message: detailError, onRetry: () => loadDetail(selectedId), retryLabel: t('action.retry') })
                  : h(PromptDetail, {
                    prompt: detail,
                    t,
                    zh,
                    bootstrap,
                    onClose: () => setSelectedId(null),
                    onRate: ratePrompt,
                    onSaveNote: saveNote,
                    onSaveTags: saveTags,
                    onToggleFavorite: toggleFavorite,
                    onRetry: () => loadDetail(selectedId),
                  })));
        }
        if (tab === 'analytics') {
          return h(AnalyticsView, {
            data: data.analytics,
            loading: loading.analytics,
            error: errors.analytics,
            t,
            zh,
            onRetry: () => loadTab('analytics'),
          });
        }
        return h(ConnectView, {
          bootstrap,
          t,
          zh,
          settingsDraft,
          setSettingsDraft,
          rubricDraft,
          setRubricDraft,
          onSaveSettings: saveSettings,
          onSaveRubric: saveRubric,
          onCheckIntegrity,
          integrity,
          onExportAll: () => exportCsv(true),
          notify,
        });
      })();

      const showFilters = tab === 'overview' || tab === 'prompts' || tab === 'analytics';

      return h('div', { className: 'pl-root' },
        h('style', null, CSS),
        h('header', { className: 'pl-head' },
          h('div', { className: 'pl-head-inner' },
            h('div', { className: 'pl-brand' },
              h('span', { className: 'pl-brand-mark' }, h(PanelIcon, { size: 25, active: true })),
              h('div', { className: 'pl-brand-copy' },
                h('h1', null, t('panel.title')),
                h('p', null, t('panel.subtitle')))),
            h('div', { className: 'pl-head-actions' },
              h('span', { className: 'pl-local-pill', title: t('foot.local') },
                h(ShieldIcon, { size: 12 }),
                t('common.local')),
              h('button', {
                type: 'button',
                className: 'pl-iconbtn is-text',
                onClick: () => setRefreshKey((value) => value + 1),
                title: t('action.refresh'),
                'aria-label': t('action.refresh'),
              }, h(RefreshIcon, { spinning: loading[tab] === true }), t('action.refresh')),
              h('button', {
                type: 'button',
                className: 'pl-iconbtn is-text',
                onClick: () => exportCsv(false),
                title: t('action.export'),
                'aria-label': t('action.export'),
              }, h(ExportIcon), t('action.export'))))),

        h('div', { className: 'pl-tabs-wrap' },
          h('nav', { className: 'pl-tabs', 'aria-label': t('panel.title') },
            TABS.map(([id, key]) => h('button', {
              key: id,
              type: 'button',
              className: `pl-tab${tab === id ? ' is-active' : ''}`,
              onClick: () => setTab(id),
              'aria-current': tab === id ? 'page' : undefined,
            }, t(key), id === 'prompts' && data.prompts ? h('span', { className: 'pl-tab-count' }, data.prompts.total) : null)))),

        h('main', { className: 'pl-body' },
          h('div', { className: 'pl-body-inner' },
            showFilters
              ? h(FilterBar, {
                filters,
                setFilters,
                facets: bootstrap?.facets,
                t,
                zh,
                bootstrap,
              })
              : null,
            body)),

        h('footer', { className: 'pl-foot' },
          h('span', { className: 'pl-foot-dot' }),
          h('span', null, t('foot.local')),
          bootstrap?.dbPath ? h('code', { className: 'pl-foot-path' }, bootstrap.dbPath) : null),

        toast === null
          ? null
          : h('div', { className: `pl-toast is-${toast.tone}`, role: 'status' },
            toast.tone === 'error' ? h(CloseIcon, { size: 13 }) : h(CheckIcon),
            h('span', null, toast.message)));
    }

    /* ------------------------------------------------------------------ */
    /* CSS                                                                 */
    /* ------------------------------------------------------------------ */

    const CSS = `
.pl-root{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.pl-root *{box-sizing:border-box}
.pl-head{flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.pl-head-inner{max-width:1240px;margin:0 auto;padding:19px 28px 15px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.pl-brand{display:flex;align-items:center;gap:12px;min-width:0}
.pl-brand-mark{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 11%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,var(--dsw-alias-border-l1));flex:0 0 auto}
.pl-brand-copy{min-width:0}
.pl-brand h1{margin:0;font-size:18px;line-height:1.25;font-weight:650;letter-spacing:-.01em}
.pl-brand p{margin:2px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.pl-head-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.pl-local-pill{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;background:var(--dsw-alias-bg-layer-1)}
.pl-tabs-wrap{flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.pl-tabs{max-width:1240px;margin:0 auto;padding:0 28px;display:flex;gap:2px;overflow-x:auto;scrollbar-width:none}
.pl-tabs::-webkit-scrollbar{display:none}
.pl-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-weight:550;font-size:12.5px;padding:10px 12px 11px;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.pl-tab:hover{color:var(--dsw-alias-label-primary)}
.pl-tab.is-active{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.pl-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;border-radius:4px}
.pl-tab-count{font-size:10px;line-height:16px;min-width:17px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);text-align:center;font-variant-numeric:tabular-nums}
.pl-tab.is-active .pl-tab-count{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary)}
.pl-body{flex:1 1 auto;min-height:0;overflow:auto}
.pl-body-inner{max-width:1240px;margin:0 auto;padding:18px 28px 42px}
.pl-view{display:flex;flex-direction:column;gap:16px;animation:pl-fade .18s ease}
.pl-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:7px;padding:8px 20px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden}
.pl-foot-dot{width:4px;height:4px;border-radius:2px;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)}
.pl-foot-path{max-width:440px;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);opacity:.72;font-size:10px}
.pl-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);margin-bottom:16px}
.pl-range-group{display:flex;align-items:center;gap:1px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);flex:0 0 auto}
.pl-range{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer;white-space:nowrap}
.pl-range:hover{color:var(--dsw-alias-label-primary)}
.pl-range.is-active{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px color-mix(in srgb,#000 8%,transparent)}
.pl-search{display:flex;align-items:center;gap:6px;min-width:210px;flex:1 1 260px;max-width:380px;height:30px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.pl-search:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 13%,transparent)}
.pl-search input{appearance:none;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;min-width:0;width:100%;padding:0}
.pl-search input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.75}
.pl-search-clear{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:2px;border-radius:4px;cursor:pointer;display:flex}
.pl-select{appearance:none;height:30px;max-width:150px;padding:0 24px 0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer;background-image:linear-gradient(45deg,transparent 50%,var(--dsw-alias-label-secondary) 50%),linear-gradient(135deg,var(--dsw-alias-label-secondary) 50%,transparent 50%);background-position:calc(100% - 12px) 13px,calc(100% - 8px) 13px;background-size:4px 4px;background-repeat:no-repeat}
.pl-select.is-narrow{max-width:100px}
.pl-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pl-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.pl-kpi{display:flex;flex-direction:column;gap:3px;padding:14px 15px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);min-width:0;position:relative;overflow:hidden}
.pl-kpi:before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;border-radius:2px;background:var(--dsw-alias-border-l2)}
.pl-kpi.is-brand:before{background:var(--dsw-alias-brand-primary)}
.pl-kpi.is-success:before{background:var(--dsw-alias-state-success-primary)}
.pl-kpi.is-spark:before{background:var(--dsw-alias-state-warn-primary)}
.pl-kpi-label{font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.pl-kpi-value{font-size:25px;line-height:1.15;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.pl-kpi-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-overview-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,.8fr);gap:12px}
.pl-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pl-two-col.is-wide-left{grid-template-columns:minmax(0,1.35fr) minmax(280px,.8fr)}
.pl-card{border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-1);padding:14px 15px;min-width:0}
.pl-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
.pl-card-title{margin:0;font-size:12.5px;font-weight:600;letter-spacing:.01em}
.pl-card-hint{margin:2px 0 0;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.pl-card-actions{flex:0 0 auto;display:flex;align-items:center;gap:5px}
.pl-linkbtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:10.5px;cursor:pointer;padding:2px 4px;border-radius:4px}
.pl-linkbtn:hover{text-decoration:underline;text-underline-offset:2px}
.pl-trend{width:100%;height:auto;display:block;overflow:visible}
.pl-grid-line{stroke:var(--dsw-alias-border-l1);stroke-width:1;stroke-dasharray:2 4}
.pl-trend-bar{fill:color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent)}
.pl-trend-line{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pl-trend-dot{fill:var(--dsw-alias-brand-primary);stroke:var(--dsw-alias-bg-layer-1);stroke-width:1.5}
.pl-axis-label{fill:var(--dsw-alias-label-secondary);font-size:9.5px;font-family:inherit}
.pl-chart-empty{padding:48px 12px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}
.pl-insights{display:flex;flex-direction:column;gap:9px}
.pl-insight{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);font-size:11.5px;line-height:1.55}
.pl-insight-dot{width:6px;height:6px;border-radius:3px;margin-top:5px;flex:0 0 auto;background:var(--dsw-alias-label-secondary)}
.pl-insight.is-positive .pl-insight-dot{background:var(--dsw-alias-state-success-primary)}
.pl-insight.is-warning .pl-insight-dot{background:var(--dsw-alias-state-warn-primary)}
.pl-insight.is-neutral .pl-insight-dot{background:var(--dsw-alias-brand-primary)}
.pl-bars{display:flex;flex-direction:column;gap:10px}
.pl-bar-row{display:flex;flex-direction:column;gap:4px}
.pl-bar-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}
.pl-bar-name{font-size:11.5px;font-weight:550;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-bar-value{font-size:10px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:0 0 auto}
.pl-mini-bar{display:block;height:5px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.pl-mini-bar>span{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary);opacity:.72;transition:width .3s ease}
.pl-mini-bar.is-success>span{background:var(--dsw-alias-state-success-primary)}
.pl-mini-bar.is-warn>span{background:var(--dsw-alias-state-warn-primary)}
.pl-mini-bar.is-error>span{background:var(--dsw-alias-state-error-primary)}
.pl-prompt-list{display:flex;flex-direction:column;gap:2px}
.pl-prompt-row{appearance:none;display:flex;flex-direction:column;gap:4px;text-align:left;width:100%;padding:9px 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.pl-prompt-row:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.pl-prompt-row.is-selected{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,var(--dsw-alias-border-l1))}
.pl-prompt-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.pl-row-top{display:flex;align-items:center;gap:6px;min-width:0;font-size:10px;color:var(--dsw-alias-label-secondary)}
.pl-row-platform{font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.pl-dot{width:2px;height:2px;border-radius:1px;background:currentColor;opacity:.55;flex:0 0 auto}
.pl-row-model{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-row-time{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums;flex:0 0 auto}
.pl-row-prompt{font-size:12.25px;line-height:1.5;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.pl-row-bottom{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.pl-row-rating{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto}
.pl-row-tokens{font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.pl-stars{display:inline-flex;align-items:center;gap:1px;color:var(--dsw-alias-state-warn-primary);line-height:1;vertical-align:middle}
.pl-stars>button{appearance:none;border:0;background:transparent;color:inherit;padding:1px;display:inline-flex;cursor:pointer;border-radius:3px;opacity:.42;transition:opacity .12s ease,transform .12s ease}
.pl-stars>button.is-on{opacity:1}
.pl-stars>button:hover{transform:scale(1.12);opacity:1}
.pl-stars>button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pl-stars.is-readonly>span{display:inline-flex;opacity:.3;color:var(--dsw-alias-label-secondary)}
.pl-stars.is-readonly>span.is-on{opacity:1;color:var(--dsw-alias-state-warn-primary)}
.pl-rating-text{display:inline-flex;align-items:center;gap:3px;color:var(--dsw-alias-state-warn-primary);font-size:11px;font-variant-numeric:tabular-nums}
.pl-auto-mini{display:inline-flex;align-items:center;gap:2px;font-size:9.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:1px 4px}
.pl-chips{display:inline-flex;align-items:center;gap:3px;min-width:0;overflow:hidden;flex-wrap:wrap;max-height:20px}
.pl-chip{font-size:9.5px;line-height:16px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis}
.pl-chip.is-skill{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,var(--dsw-alias-border-l1))}
.pl-chip.is-mcp{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 22%,var(--dsw-alias-border-l1))}
.pl-chip.is-more{opacity:.65}
.pl-badge{display:inline-flex;align-items:center;gap:4px;font-size:9.5px;line-height:17px;padding:0 6px;border-radius:5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.pl-badge.is-success{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,var(--dsw-alias-border-l1))}
.pl-badge.is-error{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,var(--dsw-alias-border-l1))}
.pl-badge.is-warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,var(--dsw-alias-border-l1))}
.pl-badge.is-brand{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,var(--dsw-alias-border-l1))}
.pl-badge.is-spark{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 25%,var(--dsw-alias-border-l1))}
.pl-badge.is-skill{color:var(--dsw-alias-brand-primary)}
.pl-badge.is-mcp{color:var(--dsw-alias-state-success-primary)}
.pl-muted{color:var(--dsw-alias-label-secondary)}
.pl-small{font-size:10.5px;line-height:1.55}
.pl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:52px 20px;text-align:center;border:1px dashed var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.pl-empty-mark{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);margin-bottom:2px}
.pl-empty strong{font-size:12.5px;font-weight:600}
.pl-empty p{margin:0;max-width:420px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.pl-empty.is-error .pl-empty-mark{color:var(--dsw-alias-state-error-primary)}
.pl-empty.is-error p{color:var(--dsw-alias-state-error-primary)}
.pl-btn{appearance:none;height:29px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;font-weight:550;display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;white-space:nowrap}
.pl-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.pl-btn.is-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);margin-top:8px}
.pl-btn.is-primary:hover{opacity:.9}
.pl-btn.is-wide{width:100%;margin-top:6px;height:32px;color:var(--dsw-alias-label-secondary)}
.pl-btn:disabled{opacity:.55;cursor:default}
.pl-btn:focus-visible,.pl-iconbtn:focus-visible,.pl-range:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pl-iconbtn{appearance:none;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:5px;display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;font:inherit;font-size:10.5px}
.pl-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.pl-iconbtn.is-text{padding:5px 7px}
.pl-iconbtn.is-on{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}
.pl-split{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(370px,.98fr);gap:13px;align-items:start}
.pl-list-column{min-width:0}
.pl-detail-column{min-width:0;position:sticky;top:0}
.pl-list-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px 7px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.pl-detail{border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-1);padding:15px;max-height:calc(100vh - 230px);overflow:auto;scrollbar-width:thin}
.pl-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.pl-detail-head h2{margin:0;font-size:14px;font-weight:650}
.pl-detail-sub{margin:3px 0 0;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.pl-detail-actions{display:flex;gap:3px;flex:0 0 auto}
.pl-detail-badges{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:10px 0 12px}
.pl-detail-empty{min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px dashed var(--dsw-alias-border-l1);border-radius:13px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);text-align:center;padding:24px}
.pl-detail-empty p{margin:0;font-size:11.5px}
.pl-block{margin-top:14px}
.pl-block-label{font-size:10px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin-bottom:6px}
.pl-quote{padding:10px 12px;border-left:2px solid var(--dsw-alias-brand-primary);border-radius:0 8px 8px 0;background:var(--dsw-alias-bg-base);font-size:12px;line-height:1.65;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto}
.pl-answer{padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);font-size:11.5px;line-height:1.68;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto}
.pl-metrics-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:14px}
.pl-metric{display:flex;flex-direction:column;gap:2px;padding:8px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);min-width:0}
.pl-metric-label{font-size:9px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.03em}
.pl-metric-value{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-metric-hint{font-size:9px;color:var(--dsw-alias-label-secondary)}
.pl-review-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:14px}
.pl-review-card{padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);min-width:0}
.pl-review-card .pl-block-label{margin-bottom:5px}
.pl-textarea{width:100%;min-height:64px;margin-top:8px;padding:7px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;resize:vertical;line-height:1.5}
.pl-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.pl-input{width:100%;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;min-width:0}
.pl-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.pl-input.is-number{max-width:70px}
.pl-tags{display:flex;gap:5px;margin-top:7px}
.pl-tags .pl-btn{height:28px}
.pl-auto-head{display:flex;align-items:baseline;gap:5px;margin-bottom:7px}
.pl-auto-head strong{font-size:21px;line-height:1.1;font-variant-numeric:tabular-nums}
.pl-dimensions{display:flex;flex-direction:column;gap:6px}
.pl-dimension-row{display:grid;grid-template-columns:minmax(56px,.9fr) minmax(40px,1fr) 26px;align-items:center;gap:5px}
.pl-dimension-label{font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-dimension-value{font-size:9.5px;text-align:right;font-variant-numeric:tabular-nums}
.pl-auto-notes{margin:8px 0 0;font-size:9.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.pl-tool-list{display:flex;flex-direction:column;gap:4px}
.pl-tool-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:6px;align-items:center;padding:5px 7px;border-radius:6px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1)}
.pl-tool-row.is-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,var(--dsw-alias-border-l1))}
.pl-tool-cat{font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-secondary)}
.pl-tool-cat.is-skill{color:var(--dsw-alias-brand-primary)}
.pl-tool-cat.is-mcp{color:var(--dsw-alias-state-success-primary)}
.pl-tool-name{font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-tool-status{font-size:8.5px;color:var(--dsw-alias-label-secondary)}
.pl-tool-row.is-error .pl-tool-status{color:var(--dsw-alias-state-error-primary)}
.pl-tool-error{grid-column:2/-1;font-size:9px;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.pl-meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.pl-meta-grid .pl-metric{padding:6px 7px}
.pl-submissions{display:flex;flex-direction:column;gap:5px}
.pl-submission{display:flex;gap:7px;padding:7px 8px;border-radius:6px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1)}
.pl-submission-index{font-size:9px;color:var(--dsw-alias-brand-primary);flex:0 0 auto;font-weight:600}
.pl-submission p{margin:0;font-size:10.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.pl-audit-toggle{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;display:flex;align-items:center;gap:7px;width:100%;padding:3px 0;cursor:pointer;text-align:left}
.pl-audit-toggle .pl-muted{margin-left:auto;font-variant-numeric:tabular-nums}
.pl-audit{display:flex;flex-direction:column;gap:2px;margin-top:5px;max-height:180px;overflow:auto}
.pl-audit-row{display:grid;grid-template-columns:minmax(0,1fr) auto 95px;gap:8px;padding:4px 6px;border-radius:4px;background:var(--dsw-alias-bg-base);font-size:9.5px}
.pl-audit-kind{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.pl-audit-time{color:var(--dsw-alias-label-secondary)}
.pl-audit-hash{font-size:9px;color:var(--dsw-alias-brand-primary)}
.pl-table-wrap{overflow:auto;max-width:100%}
.pl-table{width:100%;border-collapse:collapse;font-size:10.5px}
.pl-table th{text-align:left;font-weight:600;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-secondary);padding:6px 7px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.pl-table td{padding:6px 7px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:middle}
.pl-table tr:last-child td{border-bottom:0}
.pl-table td.is-right,.pl-table th.is-right{text-align:right;font-variant-numeric:tabular-nums}
.pl-table-name{display:flex;flex-direction:column;gap:0;min-width:0}
.pl-table-name strong{font-size:10.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.pl-table-name span{font-size:9px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-analytics-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}
.pl-distribution{display:flex;flex-direction:column;gap:8px}
.pl-dist-row{display:grid;grid-template-columns:42px minmax(0,1fr) 38px;align-items:center;gap:7px}
.pl-dist-star{display:inline-flex;align-items:center;gap:2px;font-size:10px;color:var(--dsw-alias-state-warn-primary)}
.pl-dist-count{text-align:right;font-size:10px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.pl-calibration{width:100%;height:auto;display:block}
.pl-diagonal{stroke:var(--dsw-alias-border-l2);stroke-width:1;stroke-dasharray:3 4}
.pl-calibration-dot{fill:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent);stroke:var(--dsw-alias-brand-primary);stroke-width:1.4}
.pl-segmented{display:inline-flex;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-2)}
.pl-segment{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:9.5px;padding:3px 7px;border-radius:5px;cursor:pointer}
.pl-segment.is-active{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.pl-rubric-summary{display:flex;flex-wrap:wrap;gap:5px}
.pl-rubric-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);font-size:10px}
.pl-rubric-pill strong{color:var(--dsw-alias-brand-primary);font-size:9.5px}
.pl-connect-hero{display:flex;align-items:center;gap:13px;padding:16px 17px;border:1px solid var(--dsw-alias-border-l1);border-radius:13px;background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,var(--dsw-alias-bg-layer-1)),var(--dsw-alias-bg-layer-1))}
.pl-connect-mark{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.pl-connect-hero h2{margin:0;font-size:16px;font-weight:650}
.pl-connect-hero p{margin:2px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary);max-width:620px}
.pl-status-pill{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10px;padding:4px 8px;border-radius:999px;white-space:nowrap}
.pl-status-pill.is-ok{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}
.pl-native{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base)}
.pl-native-copy strong{font-size:12px}
.pl-native-copy p{margin:2px 0 0;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.pl-native-meta{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.pl-platform-table{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;overflow:hidden}
.pl-platform-head,.pl-platform-row{display:grid;grid-template-columns:150px minmax(0,1fr) 90px;gap:12px;align-items:center;padding:8px 11px}
.pl-platform-head{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1)}
.pl-platform-row{border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px}
.pl-platform-row:last-child{border-bottom:0}
.pl-platform-row strong{font-size:11px;font-weight:600}
.pl-platform-row .pl-badge{justify-self:start}
.pl-copy-stack{display:flex;flex-direction:column;gap:8px}
.pl-copy-field{display:flex;flex-direction:column;gap:4px}
.pl-copy-label{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-secondary)}
.pl-copy-row{display:flex;align-items:center;gap:5px;min-width:0;padding:4px 5px 4px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base)}
.pl-copy-value{font-size:10px;min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.pl-copy-row .pl-iconbtn{flex:0 0 auto}
.pl-integrity{display:flex;gap:9px;align-items:flex-start;padding:10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.pl-integrity.is-ok .pl-integrity-icon{color:var(--dsw-alias-state-success-primary)}
.pl-integrity.is-bad .pl-integrity-icon{color:var(--dsw-alias-state-error-primary)}
.pl-integrity-icon{flex:0 0 auto;margin-top:1px}
.pl-integrity strong{font-size:11px}
.pl-integrity p{margin:1px 0 4px;font-size:10px;color:var(--dsw-alias-label-secondary)}
.pl-integrity code{font-size:9px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.pl-integrity-issues{display:flex;flex-direction:column;gap:4px;margin-top:6px;max-height:120px;overflow:auto}
.pl-integrity-issues code{font-size:9px;color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-base);padding:4px 6px;border-radius:4px}
.pl-toggle-stack{display:flex;flex-direction:column;gap:2px;margin-bottom:9px}
.pl-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer}
.pl-toggle-row:last-child{border-bottom:0}
.pl-toggle-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.pl-toggle-label{font-size:11px;font-weight:550}
.pl-toggle-desc{font-size:9.5px;color:var(--dsw-alias-label-secondary);line-height:1.45}
.pl-switch{appearance:none;flex:0 0 auto;width:34px;height:20px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);padding:2px;cursor:pointer;transition:background .15s ease}
.pl-switch.is-on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.pl-switch-thumb{display:block;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .15s ease;box-shadow:0 1px 2px color-mix(in srgb,#000 20%,transparent)}
.pl-switch.is-on .pl-switch-thumb{transform:translateX(14px)}
.pl-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.pl-db-path{padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);overflow:auto}
.pl-db-path code{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.pl-db-actions{display:flex;gap:6px;margin-top:8px}
.pl-rubric-editor{display:flex;flex-direction:column;gap:5px}
.pl-rubric-head,.pl-rubric-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 82px 30px;gap:7px;align-items:center}
.pl-rubric-head{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--dsw-alias-label-secondary);padding:0 2px 2px}
.pl-rubric-row .pl-iconbtn{justify-self:center}
.pl-rubric-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.pl-rubric-foot .pl-btn.is-primary{margin-top:0}
.pl-ledger-center{position:relative;display:flex;justify-content:center;width:100%;padding:0;margin:0 0 4px}
.pl-ledger-pill{appearance:none;max-width:calc(100vw - 32px);height:28px;padding:0 10px 0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 84%,transparent);backdrop-filter:blur(10px);color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;box-shadow:0 2px 10px color-mix(in srgb,#000 7%,transparent);transition:border-color .15s ease,background .15s ease,transform .15s ease}
.pl-ledger-pill:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-layer-1);transform:translateY(-1px)}
.pl-ledger-pill.is-open{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-layer-1)}
.pl-ledger-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.pl-ledger-pill-mark{width:19px;height:19px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);flex:0 0 auto}
.pl-ledger-pill-title{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}
.pl-ledger-pill-divider{width:1px;height:11px;background:var(--dsw-alias-border-l2);opacity:.7;flex:0 0 auto}
.pl-ledger-pill-stat{font-size:10px;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.pl-ledger-pill-stat.is-warm{color:var(--dsw-alias-state-warn-primary)}
.pl-ledger-pill-empty{font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-ledger-pill-sep{opacity:.28;font-size:9px;white-space:nowrap}
.pl-ledger-chev{display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary);opacity:.7;flex:0 0 auto}
.pl-ledger-panel{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);width:min(690px,calc(100vw - 36px));z-index:40;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,var(--dsw-alias-border-l1));border-radius:16px;background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 48px color-mix(in srgb,#000 18%,transparent),0 0 0 1px color-mix(in srgb,#fff 3%,transparent);overflow:hidden;animation:pl-ledger-in .18s ease}
.pl-ledger-panel:before{content:"";position:absolute;top:0;left:24px;right:24px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent),transparent);opacity:.8}
.pl-ledger-head{display:flex;align-items:center;gap:9px;padding:11px 13px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,transparent),transparent)}
.pl-ledger-mark{width:31px;height:31px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 20%,var(--dsw-alias-border-l1));flex:0 0 auto}
.pl-ledger-title{display:flex;flex-direction:column;gap:1px;min-width:0}
.pl-ledger-title strong{font-size:12px;font-weight:650;letter-spacing:.01em}
.pl-ledger-title span{font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-ledger-chain{margin-left:auto;display:inline-flex;align-items:center;gap:4px;font-size:9px;padding:3px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:0 0 auto}
.pl-ledger-chain-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:0 0 auto}
.pl-ledger-chain.is-success{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 9%,transparent)}
.pl-ledger-chain.is-success .pl-ledger-chain-dot{background:var(--dsw-alias-state-success-primary)}
.pl-ledger-chain.is-error{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent)}
.pl-ledger-chain.is-error .pl-ledger-chain-dot{background:var(--dsw-alias-state-error-primary)}
.pl-ledger-chain.is-loading .pl-ledger-chain-dot{background:var(--dsw-alias-state-warn-primary)}
.pl-ledger-close{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);width:24px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
.pl-ledger-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.pl-ledger-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pl-ledger-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:1px;background:var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1)}
.pl-ledger-module{appearance:none;border:0;background:var(--dsw-alias-bg-overlay);padding:9px 10px 8px;display:flex;flex-direction:column;gap:3px;text-align:left;min-width:0;cursor:pointer;color:inherit;font:inherit;position:relative;transition:background .12s ease}
.pl-ledger-module:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,var(--dsw-alias-bg-overlay))}
.pl-ledger-module:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;z-index:1}
.pl-ledger-module-top{display:flex;align-items:center;gap:5px;min-width:0;color:var(--dsw-alias-label-secondary)}
.pl-ledger-module-icon{display:inline-flex;color:var(--dsw-alias-label-secondary);flex:0 0 auto}
.pl-ledger-module.is-brand .pl-ledger-module-icon{color:var(--dsw-alias-brand-primary)}
.pl-ledger-module.is-warm .pl-ledger-module-icon{color:var(--dsw-alias-state-warn-primary)}
.pl-ledger-module.is-success .pl-ledger-module-icon{color:var(--dsw-alias-state-success-primary)}
.pl-ledger-module.is-error .pl-ledger-module-icon{color:var(--dsw-alias-state-error-primary)}
.pl-ledger-module.is-loading .pl-ledger-module-icon{color:var(--dsw-alias-state-warn-primary)}
.pl-ledger-module-label{font-size:8.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.02em}
.pl-ledger-module-value{font-size:17px;line-height:1.1;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary)}
.pl-ledger-module.is-brand .pl-ledger-module-value{color:var(--dsw-alias-brand-primary)}
.pl-ledger-module.is-warm .pl-ledger-module-value{color:var(--dsw-alias-state-warn-primary)}
.pl-ledger-module.is-success .pl-ledger-module-value{font-size:13px;color:var(--dsw-alias-state-success-primary)}
.pl-ledger-module.is-error .pl-ledger-module-value{font-size:13px;color:var(--dsw-alias-state-error-primary)}
.pl-ledger-module.is-loading .pl-ledger-module-value{font-size:12px;color:var(--dsw-alias-label-secondary)}
.pl-ledger-module-sub{font-size:8px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-ledger-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 13px;font-size:9px;color:var(--dsw-alias-label-secondary)}
.pl-ledger-open{appearance:none;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:10px;display:inline-flex;align-items:center;gap:2px;padding:2px 4px;border-radius:4px;cursor:pointer;white-space:nowrap}
.pl-ledger-open:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}
.pl-ledger-open:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pl-turn{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:5px 0 0;padding:1px 2px;border:0;border-radius:5px;background:transparent;font-size:9.5px;color:var(--dsw-alias-label-secondary);line-height:1.35;max-width:100%}
.pl-turn:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 55%,transparent)}
.pl-turn-title{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:500;color:var(--dsw-alias-label-secondary);flex:0 0 auto}
.pl-turn-status{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;white-space:nowrap;flex:0 0 auto}
.pl-turn-dot{width:4px;height:4px;border-radius:2px;background:var(--dsw-alias-state-idle-primary);flex:0 0 auto}
.pl-turn-status.is-completed .pl-turn-dot{background:var(--dsw-alias-state-success-primary)}
.pl-turn-status.is-failed .pl-turn-dot,.pl-turn-status.is-aborted .pl-turn-dot{background:var(--dsw-alias-state-error-primary)}
.pl-turn-status.is-running .pl-turn-dot{background:var(--dsw-alias-brand-primary)}
.pl-turn-status.is-interrupted .pl-turn-dot{background:var(--dsw-alias-state-warn-primary)}
.pl-turn-meta{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden;white-space:nowrap;font-variant-numeric:tabular-nums}
.pl-turn-model{max-width:200px;overflow:hidden;text-overflow:ellipsis}
.pl-turn-sep{opacity:.4}
.pl-turn-auto{color:var(--dsw-alias-brand-primary);font-size:9px;white-space:nowrap}
.pl-turn-rating{display:inline-flex;align-items:center;gap:2px;flex:0 0 auto;min-height:17px}
.pl-turn-rating .pl-stars>button{opacity:.3}
.pl-turn-rating .pl-stars>button.is-on,.pl-turn-rating .pl-stars>button:hover{opacity:1}
.pl-turn-error{color:var(--dsw-alias-state-error-primary);font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-turn-detail{appearance:none;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:9.5px;display:inline-flex;align-items:center;gap:1px;padding:1px 2px;border-radius:3px;cursor:pointer;flex:0 0 auto;opacity:.85}
.pl-turn:hover .pl-turn-detail{opacity:1}
.pl-turn-detail:hover{text-decoration:underline;text-underline-offset:2px}
.pl-turn-detail:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pl-skel{display:flex;flex-direction:column;gap:7px}
.pl-skel-row{height:42px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);animation:pl-pulse 1.4s ease-in-out infinite}
.pl-toast{position:fixed;right:26px;bottom:26px;z-index:50;display:flex;align-items:center;gap:7px;max-width:420px;padding:9px 12px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:11px;box-shadow:0 8px 28px color-mix(in srgb,#000 18%,transparent);animation:pl-toast-in .18s ease}
.pl-toast.is-success svg{color:var(--dsw-alias-state-success-primary)}
.pl-toast.is-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,var(--dsw-alias-border-l1))}
.pl-toast.is-error svg{color:var(--dsw-alias-state-error-primary)}
.pl-spin{animation:pl-rotate .9s linear infinite}
@keyframes pl-pulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes pl-rotate{to{transform:rotate(360deg)}}
@keyframes pl-fade{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
@keyframes pl-toast-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes pl-ledger-in{from{opacity:0;transform:translate(-50%,5px) scale(.985)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
@media (max-width:1060px){
  .pl-kpis,.pl-analytics-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pl-overview-grid,.pl-two-col,.pl-two-col.is-wide-left{grid-template-columns:1fr}
  .pl-split{grid-template-columns:1fr}
  .pl-detail-column{position:static}
  .pl-detail{max-height:none}
}
@media (max-width:720px){
  .pl-head-inner{padding:15px 16px 12px}
  .pl-tabs{padding:0 16px}
  .pl-body-inner{padding:14px 16px 36px}
  .pl-head-actions .pl-iconbtn.is-text span{display:none}
  .pl-brand h1{font-size:16px}
  .pl-brand p{display:none}
  .pl-local-pill{display:none}
  .pl-ledger-panel{width:calc(100vw - 24px)}
  .pl-ledger-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .pl-ledger-pill-title{display:none}
  .pl-ledger-pill-stat.is-tokens{display:none}
  .pl-ledger-pill{padding-right:8px}
  .pl-turn-meta{flex-basis:100%;order:5}
  .pl-turn-model{max-width:150px}
  .pl-search{max-width:none;flex-basis:100%}
  .pl-metrics-grid,.pl-meta-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pl-review-grid{grid-template-columns:1fr}
  .pl-platform-head,.pl-platform-row{grid-template-columns:110px minmax(0,1fr) 78px;gap:8px}
  .pl-rubric-head,.pl-rubric-row{grid-template-columns:minmax(0,1fr) 70px 28px}
  .pl-rubric-head span:nth-child(2),.pl-rubric-row input:nth-child(2){display:none}
  .pl-connect-hero{align-items:flex-start;flex-wrap:wrap}
  .pl-status-pill{margin-left:0}
  .pl-foot-path{display:none}
}
@media (prefers-reduced-motion:reduce){
  .pl-view,.pl-toast,.pl-skel-row,.pl-spin,.pl-ledger-panel{animation:none}
  .pl-prompt-row,.pl-mini-bar>span,.pl-stars>button,.pl-switch,.pl-switch-thumb{transition:none}
}
`;

    /* ------------------------------------------------------------------ */
    /* Client plugin                                                       */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'prompt-ledger: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'prompt-ledger: en dictionary');
        const t = ctx.locale.bind(NS);

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'prompt-ledger',
          order: 19,
          label: () => t('panel.title'),
        }, (props) => h(PanelIcon, props)));

        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'prompt-ledger',
          order: 30,
          label: () => t('panel.title'),
        }, (props) => h(LedgerDock, { ...props, ctx, t })));

        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'prompt-ledger',
          order: 30,
          label: () => t('panel.title'),
        }, (props) => h(TurnLedgerMetrics, { ...props, ctx, t })));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'prompt-ledger',
        }, (props) => h(Panel, { ...props, ctx, t })));
      },
    };
  },
});
