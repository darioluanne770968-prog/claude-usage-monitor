// Background Script - 数据处理、定时检查、通知推送

console.log('Claude 用量监控：Background Script 已启动');

// 配置常量
const CHECK_INTERVAL = 15; // 检查间隔（分钟）
const NOTIFY_THRESHOLD = 60; // 提醒阈值：距离重置还剩多少分钟时提醒
const AUTO_REFRESH_INTERVAL = 30; // 智能刷新间隔（分钟）
const DATA_EXPIRY_TIME = 30; // 数据过期时间（分钟）

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('扩展已安装/更新');

  // 设置定时检查
  chrome.alarms.create('checkUsage', {
    periodInMinutes: CHECK_INTERVAL
  });

  // 设置智能刷新定时器
  chrome.alarms.create('autoRefresh', {
    periodInMinutes: AUTO_REFRESH_INTERVAL
  });

  // 初始化存储
  chrome.storage.local.get(['config'], (result) => {
    if (!result.config) {
      chrome.storage.local.set({
        config: {
          serverChanKey: '', // Server酱 SCKEY
          firebaseConfig: null,
          notifyThreshold: NOTIFY_THRESHOLD,
          enableNotifications: true,
          enableAutoRefresh: true, // 启用智能刷新
          autoRefreshInterval: AUTO_REFRESH_INTERVAL, // 智能刷新间隔
          lastNotifyTime: 0
        }
      });
    }
  });
});

// 监听来自 Content Script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.type);

  if (request.type === 'USAGE_DATA_UPDATE') {
    handleUsageDataUpdate(request.data);
    sendResponse({ success: true });
  } else if (request.type === 'GET_USAGE_DATA') {
    chrome.storage.local.get(['latestUsage'], (result) => {
      sendResponse({ success: true, data: result.latestUsage });
    });
    return true;
  } else if (request.type === 'UPDATE_CONFIG') {
    updateConfig(request.config);
    sendResponse({ success: true });
  } else if (request.type === 'SEND_TEST_NOTIFICATION') {
    console.log('收到测试通知请求');
    sendWeChatNotification('测试通知', '这是一条测试消息，如果收到说明配置成功！').then(() => {
      console.log('测试通知发送完成');
      sendResponse({ success: true });
    }).catch(error => {
      console.error('测试通知发送失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  return true;
});

// 处理用量数据更新
async function handleUsageDataUpdate(data) {
  console.log('处理用量数据更新:', data);

  const accountId = data.accountId || 'account_default';

  // 获取所有账号数据
  const result = await chrome.storage.local.get(['accounts', 'currentAccount']);
  const accounts = result.accounts || {};

  // 更新当前账号的数据
  accounts[accountId] = data;

  // 保存到本地存储
  await chrome.storage.local.set({
    accounts: accounts,
    currentAccount: accountId,
    latestUsage: data,  // 保持兼容性
    lastUpdateTime: Date.now()
  });

  console.log('已保存账号数据:', accountId);

  // 同步到 Firebase（按账号存储）
  syncToFirebase(data, accountId);

  // 检查是否需要发送通知
  checkAndNotify(data);
}

// 根据时间戳计算剩余时间（分钟）
function calculateRemainingMinutesFromTimestamp(resetTimestamp) {
  if (!resetTimestamp) return 999;
  const now = Date.now();
  const diff = resetTimestamp - now;
  if (diff <= 0) return 0;
  return Math.floor(diff / 60000);
}

// 检查是否需要发送通知
async function checkAndNotify(data) {
  const config = await getConfig();

  if (!config.enableNotifications || !config.serverChanKey) {
    console.log('通知未启用或未配置 Server酱');
    return;
  }

  const now = Date.now();
  const timeSinceLastNotify = now - (config.lastNotifyTime || 0);
  const minInterval = 30 * 60 * 1000; // 最小通知间隔：30分钟

  // 避免频繁通知
  if (timeSinceLastNotify < minInterval) {
    console.log('距离上次通知时间过短，跳过');
    return;
  }

  // 使用时间戳实时计算剩余时间
  const fiveHourReset = calculateRemainingMinutesFromTimestamp(data.fiveHourLimit?.resetTimestamp);
  const weeklyReset = calculateRemainingMinutesFromTimestamp(data.weeklyLimits?.resetTimestamp);

  console.log('检查通知条件:', { fiveHourReset, weeklyReset, threshold: config.notifyThreshold });

  const shouldNotify =
    (fiveHourReset > 0 && fiveHourReset <= config.notifyThreshold) ||
    (weeklyReset > 0 && weeklyReset <= config.notifyThreshold);

  if (shouldNotify) {
    const message = buildNotificationMessage(data);
    await sendWeChatNotification('Claude 使用最佳时机 ⏰', message);

    // 更新最后通知时间
    config.lastNotifyTime = now;
    await chrome.storage.local.set({ config });

    // 显示浏览器通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: 'Claude 使用最佳时机',
      message: message,
      priority: 2
    });
  }
}

// 构建通知消息
function buildNotificationMessage(data) {
  const lines = [];

  lines.push('━━━━━━━━━━━━━');
  lines.push('⏰ Claude 使用最佳时机！');
  lines.push('');

  // 使用时间戳实时计算剩余时间
  const fiveHourResetMin = calculateRemainingMinutesFromTimestamp(data.fiveHourLimit?.resetTimestamp);
  const weeklyResetMin = calculateRemainingMinutesFromTimestamp(data.weeklyLimits?.resetTimestamp);

  // 即将重置的提醒
  const resetAlerts = [];
  if (fiveHourResetMin <= 60 && fiveHourResetMin > 0) {
    resetAlerts.push(`• 5小时限制将在 ${formatTime(fiveHourResetMin)} 后重置`);
  }
  if (weeklyResetMin <= 60 && weeklyResetMin > 0) {
    resetAlerts.push(`• 每周限制将在 ${formatTime(weeklyResetMin)} 后重置`);
  }

  if (resetAlerts.length > 0) {
    lines.push('🔔 即将重置：');
    lines.push(...resetAlerts);
    lines.push('');
  }

  // 当前用量统计
  lines.push('📊 当前用量：');
  lines.push(`• 当前会话：${data.currentSession?.percentage || 0}%`);
  lines.push(`• 每周限制：${data.weeklyLimits?.percentage || 0}%`);
  lines.push(`• 5小时限制：${data.fiveHourLimit?.percentage || 0}%`);
  lines.push('');

  // 重置时间
  lines.push('⏱️ 完整重置时间：');
  lines.push(`• 每周限制：${formatTime(weeklyResetMin)}`);
  lines.push(`• 5小时限制：${formatTime(fiveHourResetMin)}`);
  lines.push('');

  lines.push('✨ 现在使用，很快就能再次使用！');
  lines.push('━━━━━━━━━━━━━');

  return lines.join('\n');
}

// 格式化时间
function formatTime(minutes) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
}

// 发送微信通知（通过 Server酱）
async function sendWeChatNotification(title, content) {
  console.log('开始发送微信通知:', title);
  const config = await getConfig();
  console.log('获取到配置:', { hasKey: !!config.serverChanKey });

  if (!config.serverChanKey) {
    console.log('未配置 Server酱密钥');
    return;
  }

  try {
    // Server酱 API
    // 支持 Server酱 Turbo 版（https://sct.ftqq.com/sendkey）
    const url = `https://sctapi.ftqq.com/${config.serverChanKey}.send`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title,
        desp: content
      })
    });

    const result = await response.json();
    console.log('微信通知发送结果:', result);

    if (result.code === 0 || result.data?.errno === 0) {
      console.log('微信通知发送成功');
    } else {
      console.error('微信通知发送失败:', result);
    }
  } catch (error) {
    console.error('发送微信通知时出错:', error);
  }
}

// 同步到 Firebase（支持多账号）
async function syncToFirebase(data, accountId) {
  const config = await getConfig();

  if (!config.firebaseConfig || !config.firebaseConfig.databaseURL) {
    console.log('未配置 Firebase');
    return;
  }

  try {
    // 为每个账号单独存储：/accounts/{accountId}/usage.json
    const safeAccountId = accountId.replace(/[@.]/g, '_'); // 替换特殊字符
    const url = `${config.firebaseConfig.databaseURL}/accounts/${safeAccountId}.json`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        syncTime: Date.now(),
        accountId: accountId  // 保存原始账号ID
      })
    });

    const result = await response.json();
    console.log(`Firebase 同步成功 [${accountId}]:`, result);
  } catch (error) {
    console.error(`Firebase 同步失败 [${accountId}]:`, error);
  }
}

// 定时检查
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUsage') {
    console.log('定时检查用量...');

    // 获取最新数据并检查
    chrome.storage.local.get(['latestUsage'], (result) => {
      if (result.latestUsage) {
        checkAndNotify(result.latestUsage);
      }
    });
  } else if (alarm.name === 'autoRefresh') {
    console.log('智能刷新：检查数据是否需要更新...');
    autoRefreshData();
  }
});

// 获取配置
function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['config'], (result) => {
      resolve(result.config || {
        serverChanKey: '',
        firebaseConfig: null,
        notifyThreshold: NOTIFY_THRESHOLD,
        enableNotifications: true,
        lastNotifyTime: 0
      });
    });
  });
}

// 更新配置
async function updateConfig(newConfig) {
  const currentConfig = await getConfig();
  const updatedConfig = { ...currentConfig, ...newConfig };
  await chrome.storage.local.set({ config: updatedConfig });
  console.log('配置已更新:', updatedConfig);
}

// 智能刷新数据
async function autoRefreshData() {
  const config = await getConfig();

  // 检查是否启用智能刷新
  if (!config.enableAutoRefresh) {
    console.log('智能刷新已禁用');
    return;
  }

  // 获取最后更新时间
  const result = await chrome.storage.local.get(['lastUpdateTime']);
  const lastUpdateTime = result.lastUpdateTime || 0;
  const now = Date.now();
  const timeSinceUpdate = (now - lastUpdateTime) / 1000 / 60; // 转换为分钟

  console.log(`数据年龄：${timeSinceUpdate.toFixed(1)} 分钟`);

  // 如果数据过期（超过设定时间）
  const expiryTime = config.autoRefreshInterval || DATA_EXPIRY_TIME;
  if (timeSinceUpdate < expiryTime) {
    console.log(`数据仍然新鲜，无需刷新（过期时间：${expiryTime} 分钟）`);
    return;
  }

  console.log('数据已过期，开始自动刷新...');

  // 创建新标签页访问 usage 页面
  chrome.tabs.create({
    url: 'https://claude.ai/settings/usage',
    active: false // 在后台打开
  }, (tab) => {
    console.log('已在后台打开 usage 页面，标签页 ID:', tab.id);

    // 等待 5 秒让 content script 读取数据
    setTimeout(() => {
      // 关闭标签页
      chrome.tabs.remove(tab.id, () => {
        console.log('自动刷新完成，标签页已关闭');
      });
    }, 5000); // 5秒后自动关闭
  });
}

console.log('Background Script 初始化完成');
