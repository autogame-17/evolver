const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extractSignals } = require('../src/gep/signals');

const emptyInput = {
  recentSessionTranscript: '',
  todayLog: '',
  memorySnippet: '',
  userSnippet: '',
  recentEvents: [],
};

function hasSignal(signals, name) {
  return Array.isArray(signals) && signals.some(s => String(s).startsWith(name));
}

function getSignalExtra(signals, name) {
  const s = Array.isArray(signals) ? signals.find(x => String(x).startsWith(name + ':')) : undefined;
  if (!s) return undefined;
  const i = String(s).indexOf(':');
  return i === -1 ? '' : String(s).slice(i + 1).trim();
}

describe('extractSignals — user_feature_request (4 languages)', () => {
  it('recognizes English feature request', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: 'Please add a dark mode toggle to the settings page.',
    });
    assert.ok(hasSignal(r, 'user_feature_request'), 'expected user_feature_request in ' + JSON.stringify(r));
  });

  it('recognizes Simplified Chinese (简中) feature request', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '加个支付模块，要支持微信和支付宝。',
    });
    assert.ok(hasSignal(r, 'user_feature_request'), 'expected user_feature_request in ' + JSON.stringify(r));
  });

  it('recognizes Traditional Chinese (繁中) feature request', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '請加一個匯出報表的功能，要支援 PDF。',
    });
    assert.ok(hasSignal(r, 'user_feature_request'), 'expected user_feature_request in ' + JSON.stringify(r));
  });

  it('recognizes Japanese (日) feature request', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: 'ダークモードのトグルを追加してほしいです。',
    });
    assert.ok(hasSignal(r, 'user_feature_request'), 'expected user_feature_request in ' + JSON.stringify(r));
  });

  it('user_feature_request signal carries extra info when present', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: 'Please add a dark mode toggle to the settings page.',
    });
    const extra = getSignalExtra(r, 'user_feature_request');
    assert.ok(extra !== undefined, 'expected user_feature_request:extra form');
    assert.ok(extra.length > 0, 'extra should not be empty');
    assert.ok(extra.toLowerCase().includes('dark') || extra.includes('toggle') || extra.includes('add'), 'extra should reflect request content');
  });
});

describe('extractSignals — user_improvement_suggestion (4 languages)', () => {
  it('recognizes English improvement suggestion', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: 'The UI could be better; we should simplify the onboarding flow.',
    });
    assert.ok(hasSignal(r, 'user_improvement_suggestion'), 'expected user_improvement_suggestion in ' + JSON.stringify(r));
  });

  it('recognizes Simplified Chinese (简中) improvement suggestion', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '改进一下登录流程，优化一下性能。',
    });
    assert.ok(hasSignal(r, 'user_improvement_suggestion'), 'expected user_improvement_suggestion in ' + JSON.stringify(r));
  });

  it('recognizes Traditional Chinese (繁中) improvement suggestion', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '建議改進匯出速度，優化一下介面。',
    });
    assert.ok(hasSignal(r, 'user_improvement_suggestion'), 'expected user_improvement_suggestion in ' + JSON.stringify(r));
  });

  it('recognizes Japanese (日) improvement suggestion', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: 'ログインの流れを改善してほしい。',
    });
    assert.ok(hasSignal(r, 'user_improvement_suggestion'), 'expected user_improvement_suggestion in ' + JSON.stringify(r));
  });

  it('user_improvement_suggestion signal carries extra info when present', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: 'We should refactor the payment module and simplify the API.',
    });
    const extra = getSignalExtra(r, 'user_improvement_suggestion');
    assert.ok(extra !== undefined, 'expected user_improvement_suggestion:extra form');
    assert.ok(extra.length > 0, 'extra should not be empty');
  });
});

describe('extractSignals — edge cases (snippet length, 我想, empty, punctuation)', () => {
  it('「我想」+ 超长描述：snippet 截断至 200 字以内', () => {
    const long = '我想让系统支持批量导入用户、导出报表、自定义工作流、多语言切换、主题切换、权限组、审计日志、Webhook 通知、API 限流、缓存策略配置、数据库备份恢复、灰度发布、A/B 测试、埋点统计、性能监控、告警规则、工单流转、知识库搜索、智能推荐、以及一大堆其他功能以便我们能够更好地管理业务。';
    const r = extractSignals({ ...emptyInput, userSnippet: long });
    assert.ok(hasSignal(r, 'user_feature_request'), 'expected user_feature_request');
    const extra = getSignalExtra(r, 'user_feature_request');
    assert.ok(extra !== undefined && extra.length > 0, 'extra should be present');
    assert.ok(extra.length <= 200, 'snippet must be truncated to 200 chars, got ' + extra.length);
  });

  it('「我想」+ 短描述：能识别且带 snippet', () => {
    const r = extractSignals({ ...emptyInput, userSnippet: '我想加一个导出 Excel 的功能。' });
    assert.ok(hasSignal(r, 'user_feature_request'));
    const extra = getSignalExtra(r, 'user_feature_request');
    assert.ok(extra !== undefined && extra.length > 0);
  });

  it('「我想。」后无内容：仍识别为 feature request，snippet 可为默认或空', () => {
    const r = extractSignals({ ...emptyInput, userSnippet: '我想。' });
    assert.ok(hasSignal(r, 'user_feature_request'), 'expected user_feature_request for 我想。');
  });

  it('仅「我想」无标点无后续：仍识别', () => {
    const r = extractSignals({ ...emptyInput, userSnippet: '我想' });
    assert.ok(hasSignal(r, 'user_feature_request'));
  });

  it('空 userSnippet：不产生 user_feature_request / user_improvement_suggestion（仅来自 user）', () => {
    const r = extractSignals({ ...emptyInput, userSnippet: '' });
    const hasFeat = hasSignal(r, 'user_feature_request');
    const hasImp = hasSignal(r, 'user_improvement_suggestion');
    assert.ok(!hasFeat && !hasImp, 'empty userSnippet should not yield feature/improvement from user input');
  });

  it('仅空格与标点：不匹配为功能/改进', () => {
    const r = extractSignals({ ...emptyInput, userSnippet: '   \n\t  。，、  \n' });
    assert.ok(!hasSignal(r, 'user_feature_request'), 'whitespace/punctuation only should not match');
    assert.ok(!hasSignal(r, 'user_improvement_suggestion'));
  });

  it('I want + 超长英文描述：snippet 截断', () => {
    const long = 'I want to add a feature that allows users to export data in CSV and Excel formats, with custom column mapping, date range filters, scheduled exports, email delivery, and integration with our analytics pipeline so that we can reduce manual reporting work. This is critical for Q2.';
    const r = extractSignals({ ...emptyInput, userSnippet: long });
    assert.ok(hasSignal(r, 'user_feature_request'));
    const extra = getSignalExtra(r, 'user_feature_request');
    assert.ok(extra === undefined || extra.length <= 200, 'snippet if present should be <= 200');
  });

  it('改进一下 + 超长描述：user_improvement_suggestion snippet 截断至 200', () => {
    // 避免含「错误/失败/异常/报错」以免触发 errorHit 压制 improvement
    const long = '改进一下登录流程：首先支持扫码登录、然后记住设备、然后支持多因素认证、然后审计日志、然后限流防刷、然后国际化提示、然后无障碍优化、然后性能优化、然后安全加固、然后文档补全。';
    const r = extractSignals({ ...emptyInput, userSnippet: long });
    assert.ok(hasSignal(r, 'user_improvement_suggestion'));
    const extra = getSignalExtra(r, 'user_improvement_suggestion');
    assert.ok(extra !== undefined && extra.length > 0);
    assert.ok(extra.length <= 200, 'improvement snippet <= 200, got ' + extra.length);
  });

  it('多句混合：首句为功能需求时仍识别并带 snippet', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '加个支付模块，要支持微信和支付宝。另外昨天那个 bug 修了吗？',
    });
    assert.ok(hasSignal(r, 'user_feature_request'));
    const extra = getSignalExtra(r, 'user_feature_request');
    assert.ok(extra !== undefined && extra.length > 0);
  });

  it('描述中含换行与制表符：正则能匹配并归一化空格', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '我想\n加一个\t导出\n报表的功能。',
    });
    assert.ok(hasSignal(r, 'user_feature_request'));
    const extra = getSignalExtra(r, 'user_feature_request');
    assert.ok(extra !== undefined);
    assert.ok(!/\n/.test(extra) || extra.length <= 200, 'snippet should be normalized (no newlines in stored form or truncated)');
  });

  it('「我想」出现在段落中间：仍能识别', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '前面是一些背景说明。我想加一个暗色模式开关，方便夜间使用。',
    });
    assert.ok(hasSignal(r, 'user_feature_request'));
    const extra = getSignalExtra(r, 'user_feature_request');
    assert.ok(extra !== undefined && extra.length > 0);
  });

  it('仅标点句「。。。。」不触发功能/改进', () => {
    const r = extractSignals({ ...emptyInput, userSnippet: '。。。。' });
    assert.ok(!hasSignal(r, 'user_feature_request'));
    assert.ok(!hasSignal(r, 'user_improvement_suggestion'));
  });

  it('user_feature_request 与 user_improvement_suggestion 均带描述时两条都有 extra', () => {
    const r = extractSignals({
      ...emptyInput,
      userSnippet: '加个支付模块。另外改进一下登录流程，简化步骤。',
    });
    assert.ok(hasSignal(r, 'user_feature_request'));
    assert.ok(hasSignal(r, 'user_improvement_suggestion'));
    assert.ok(getSignalExtra(r, 'user_feature_request'));
    assert.ok(getSignalExtra(r, 'user_improvement_suggestion'));
  });
});
