// Popup Script - 界面交互逻辑

console.log('Popup 已加载');

// DOM 元素
const elements = {
  accountSelector: document.getElementById('accountSelector'),
  accountSelect: document.getElementById('accountSelect'),
  accountName: document.getElementById('accountName'),
  currentSession: document.getElementById('currentSession'),
  currentSessionBar: document.getElementById('currentSessionBar'),
  weeklyLimits: document.getElementById('weeklyLimits'),
  weeklyLimitsBar: document.getElementById('weeklyLimitsBar'),
  weeklyReset: document.getElementById('weeklyReset'),
  fiveHourLimit: document.getElementById('fiveHourLimit'),
  fiveHourLimitBar: document.getElementById('fiveHourLimitBar'),
  fiveHourReset: document.getElementById('fiveHourReset'),
  alertSection: document.getElementById('alertSection'),
  alertText: document.getElementById('alertText'),
  lastUpdate: document.getElementById('lastUpdate'),
  refreshBtn: document.getElementById('refreshBtn'),
  openUsageBtn: document.getElementById('openUsageBtn'),
  testNotifyBtn: document.getElementById('testNotifyBtn'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsContent: document.getElementById('settingsContent'),
  serverChanKey: document.getElementById('serverChanKey'),
  notifyThreshold: document.getElementById('notifyThreshold'),
  enableNotifications: document.getElementById('enableNotifications'),
  enableAutoRefresh: document.getElementById('enableAutoRefresh'),
  autoRefreshInterval: document.getElementById('autoRefreshInterval'),
  firebaseUrl: document.getElementById('firebaseUrl'),
  saveConfigBtn: document.getElementById('saveConfigBtn')
};

// 当前选中的账号
let selectedAccountId = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadUsageData();
  loadConfig();
  setupEventListeners();
});

// 加载用量数据
function loadUsageData() {
  // 加载所有账号
  chrome.storage.local.get(['accounts', 'currentAccount'], (result) => {
    const accounts = result.accounts || {};
    const currentAccount = result.currentAccount;

    console.log('加载账号数据:', Object.keys(accounts));

    // 如果有多个账号，显示账号选择器
    if (Object.keys(accounts).length > 1) {
      elements.accountSelector.style.display = 'flex';
      populateAccountSelector(accounts, currentAccount);
    } else if (Object.keys(accounts).length === 1) {
      // 只有一个账号，隐藏选择器，直接显示
      elements.accountSelector.style.display = 'none';
      const accountId = Object.keys(accounts)[0];
      selectedAccountId = accountId;
      displayUsageData(accounts[accountId]);
    }

    // 如果有当前账号，显示其数据
    if (currentAccount && accounts[currentAccount]) {
      selectedAccountId = currentAccount;
      displayUsageData(accounts[currentAccount]);
    } else if (Object.keys(accounts).length > 0) {
      // 显示第一个账号
      const firstAccount = Object.keys(accounts)[0];
      selectedAccountId = firstAccount;
      displayUsageData(accounts[firstAccount]);
    } else {
      console.log('暂无用量数据，请访问 Usage 页面');
    }
  });

  // 获取最后更新时间
  chrome.storage.local.get(['lastUpdateTime'], (result) => {
    if (result.lastUpdateTime) {
      updateLastUpdateTime(result.lastUpdateTime);
    }
  });
}

// 填充账号选择器
function populateAccountSelector(accounts, currentAccount) {
  elements.accountSelect.innerHTML = '';

  Object.keys(accounts).forEach(accountId => {
    const option = document.createElement('option');
    option.value = accountId;
    option.textContent = accountId;
    if (accountId === currentAccount) {
      option.selected = true;
    }
    elements.accountSelect.appendChild(option);
  });

  // 监听账号切换
  elements.accountSelect.addEventListener('change', (e) => {
    const accountId = e.target.value;
    selectedAccountId = accountId;

    // 加载选中账号的数据
    chrome.storage.local.get(['accounts'], (result) => {
      const accounts = result.accounts || {};
      if (accounts[accountId]) {
        displayUsageData(accounts[accountId]);
      }
    });
  });
}

// 全局变量：存储当前数据
let currentPopupData = null;
let popupCountdownTimer = null;

// 显示用量数据
function displayUsageData(data) {
  console.log('显示用量数据:', data);

  // 保存数据到全局变量
  currentPopupData = data;

  // 更新显示
  updatePopupDisplay();

  // 启动定时器，每分钟更新一次倒计时
  startPopupCountdownTimer();
}

// 更新 Popup 显示
function updatePopupDisplay() {
  if (!currentPopupData) return;

  const data = currentPopupData;

  // 当前会话
  const currentPercent = data.currentSession?.percentage || 0;
  elements.currentSession.textContent = `${currentPercent}%`;
  elements.currentSessionBar.style.width = `${currentPercent}%`;
  updateBarColor(elements.currentSessionBar, currentPercent);

  // 每周限制 - 使用时间戳实时计算
  const weeklyPercent = data.weeklyLimits?.percentage || 0;
  const weeklyResetMin = calculateRemainingMinutes(data.weeklyLimits?.resetTimestamp);
  elements.weeklyLimits.textContent = `${weeklyPercent}%`;
  elements.weeklyLimitsBar.style.width = `${weeklyPercent}%`;
  elements.weeklyReset.textContent = `重置时间：${formatTime(weeklyResetMin)}`;
  updateBarColor(elements.weeklyLimitsBar, weeklyPercent);

  // 5小时限制 - 使用时间戳实时计算
  const fiveHourPercent = data.fiveHourLimit?.percentage || 0;
  const fiveHourResetMin = calculateRemainingMinutes(data.fiveHourLimit?.resetTimestamp);
  elements.fiveHourLimit.textContent = `${fiveHourPercent}%`;
  elements.fiveHourLimitBar.style.width = `${fiveHourPercent}%`;
  elements.fiveHourReset.textContent = `重置时间：${formatTime(fiveHourResetMin)}`;
  updateBarColor(elements.fiveHourLimitBar, fiveHourPercent);

  // 检查是否显示提醒
  checkAndShowAlert(data);
}

// 定时器：每分钟更新一次显示
function startPopupCountdownTimer() {
  if (popupCountdownTimer) {
    clearInterval(popupCountdownTimer);
  }
  popupCountdownTimer = setInterval(() => {
    updatePopupDisplay();
  }, 60000); // 每60秒更新一次
}

// 更新进度条颜色
function updateBarColor(barElement, percentage) {
  barElement.classList.remove('low', 'medium', 'high');
  if (percentage < 50) {
    barElement.classList.add('low');
  } else if (percentage < 80) {
    barElement.classList.add('medium');
  } else {
    barElement.classList.add('high');
  }
}

// 检查并显示提醒
function checkAndShowAlert(data) {
  const alerts = [];

  // 使用时间戳实时计算剩余时间
  const weeklyResetMin = calculateRemainingMinutes(data.weeklyLimits?.resetTimestamp);
  const fiveHourResetMin = calculateRemainingMinutes(data.fiveHourLimit?.resetTimestamp);

  if (weeklyResetMin <= 60 && weeklyResetMin > 0) {
    alerts.push(`每周限制将在 ${formatTime(weeklyResetMin)} 后重置`);
  }

  if (fiveHourResetMin <= 60 && fiveHourResetMin > 0) {
    alerts.push(`5小时限制将在 ${formatTime(fiveHourResetMin)} 后重置`);
  }

  if (alerts.length > 0) {
    elements.alertSection.style.display = 'block';
    elements.alertText.textContent = alerts.join('，') + ' - 现在是最佳使用时机！';
  } else {
    elements.alertSection.style.display = 'none';
  }
}

// 根据时间戳计算剩余时间（分钟）
function calculateRemainingMinutes(resetTimestamp) {
  if (!resetTimestamp) return 0;
  const now = Date.now();
  const diff = resetTimestamp - now;
  if (diff <= 0) return 0;
  return Math.floor(diff / 60000);
}

// 格式化时间
function formatTime(minutes) {
  if (minutes === 0 || minutes === null) {
    return '即将重置';
  }
  if (minutes < 0) {
    return '已重置';
  }
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
}

// 更新最后更新时间
function updateLastUpdateTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    elements.lastUpdate.textContent = '刚刚';
  } else if (minutes < 60) {
    elements.lastUpdate.textContent = `${minutes} 分钟前`;
  } else {
    const hours = Math.floor(minutes / 60);
    elements.lastUpdate.textContent = `${hours} 小时前`;
  }
}

// 加载配置
function loadConfig() {
  chrome.storage.local.get(['config'], (result) => {
    if (result.config) {
      const config = result.config;
      elements.accountName.value = config.accountName || '';
      elements.serverChanKey.value = config.serverChanKey || '';
      elements.notifyThreshold.value = config.notifyThreshold || 60;
      elements.enableNotifications.checked = config.enableNotifications !== false;
      elements.enableAutoRefresh.checked = config.enableAutoRefresh !== false;
      elements.autoRefreshInterval.value = config.autoRefreshInterval || 30;
      elements.firebaseUrl.value = config.firebaseConfig?.databaseURL || '';
    }
  });
}

// 设置事件监听
function setupEventListeners() {
  // 刷新按钮
  elements.refreshBtn.addEventListener('click', () => {
    elements.refreshBtn.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      elements.refreshBtn.style.transform = 'rotate(0deg)';
    }, 500);

    // 打开 usage 页面并刷新
    chrome.tabs.create({ url: 'https://claude.ai/settings/usage' }, (tab) => {
      setTimeout(() => {
        loadUsageData();
      }, 2000);
    });
  });

  // 打开 Usage 页面
  elements.openUsageBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
  });

  // 测试通知
  elements.testNotifyBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SEND_TEST_NOTIFICATION' }, (response) => {
      if (response && response.success) {
        alert('测试通知已发送！请查看微信');
      }
    });
  });

  // 设置面板折叠
  elements.settingsToggle.addEventListener('click', () => {
    elements.settingsToggle.classList.toggle('active');
    elements.settingsContent.classList.toggle('show');
  });

  // 保存配置
  elements.saveConfigBtn.addEventListener('click', () => {
    const accountName = elements.accountName.value.trim();

    // 验证账号名称必填
    if (!accountName) {
      alert('请填写账号名称！\n\n建议使用：Mac账号、Win账号等，用于区分不同设备。');
      elements.accountName.focus();
      return;
    }

    const config = {
      accountName: accountName,
      serverChanKey: elements.serverChanKey.value.trim(),
      notifyThreshold: parseInt(elements.notifyThreshold.value) || 60,
      enableNotifications: elements.enableNotifications.checked,
      enableAutoRefresh: elements.enableAutoRefresh.checked,
      autoRefreshInterval: parseInt(elements.autoRefreshInterval.value) || 30,
      firebaseConfig: elements.firebaseUrl.value.trim() ? {
        databaseURL: elements.firebaseUrl.value.trim()
      } : null
    };

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: config
    }, (response) => {
      if (response && response.success) {
        // 显示保存成功提示
        const originalText = elements.saveConfigBtn.textContent;
        elements.saveConfigBtn.textContent = '✓ 保存成功';
        elements.saveConfigBtn.style.background = '#22c55e';

        setTimeout(() => {
          elements.saveConfigBtn.textContent = originalText;
          elements.saveConfigBtn.style.background = '';
        }, 2000);
      }
    });
  });
}

// 添加过渡动画
elements.refreshBtn.style.transition = 'transform 0.5s';
