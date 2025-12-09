// Popup Script - 界面交互逻辑

console.log('Popup 已加载');

// DOM 元素
const elements = {
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
  firebaseUrl: document.getElementById('firebaseUrl'),
  saveConfigBtn: document.getElementById('saveConfigBtn')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadUsageData();
  loadConfig();
  setupEventListeners();
});

// 加载用量数据
function loadUsageData() {
  chrome.runtime.sendMessage({ type: 'GET_USAGE_DATA' }, (response) => {
    if (response && response.success && response.data) {
      displayUsageData(response.data);
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

// 显示用量数据
function displayUsageData(data) {
  console.log('显示用量数据:', data);

  // 当前会话
  const currentPercent = data.currentSession?.percentage || 0;
  elements.currentSession.textContent = `${currentPercent}%`;
  elements.currentSessionBar.style.width = `${currentPercent}%`;
  updateBarColor(elements.currentSessionBar, currentPercent);

  // 每周限制
  const weeklyPercent = data.weeklyLimits?.percentage || 0;
  const weeklyResetMin = data.weeklyLimits?.resetMinutes || 0;
  elements.weeklyLimits.textContent = `${weeklyPercent}%`;
  elements.weeklyLimitsBar.style.width = `${weeklyPercent}%`;
  elements.weeklyReset.textContent = `重置时间：${formatTime(weeklyResetMin)}`;
  updateBarColor(elements.weeklyLimitsBar, weeklyPercent);

  // 5小时限制
  const fiveHourPercent = data.fiveHourLimit?.percentage || 0;
  const fiveHourResetMin = data.fiveHourLimit?.resetMinutes || 0;
  elements.fiveHourLimit.textContent = `${fiveHourPercent}%`;
  elements.fiveHourLimitBar.style.width = `${fiveHourPercent}%`;
  elements.fiveHourReset.textContent = `重置时间：${formatTime(fiveHourResetMin)}`;
  updateBarColor(elements.fiveHourLimitBar, fiveHourPercent);

  // 检查是否显示提醒
  checkAndShowAlert(data);
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

  if (data.weeklyLimits?.resetMinutes <= 60 && data.weeklyLimits?.resetMinutes > 0) {
    alerts.push(`每周限制将在 ${formatTime(data.weeklyLimits.resetMinutes)} 后重置`);
  }

  if (data.fiveHourLimit?.resetMinutes <= 60 && data.fiveHourLimit?.resetMinutes > 0) {
    alerts.push(`5小时限制将在 ${formatTime(data.fiveHourLimit.resetMinutes)} 后重置`);
  }

  if (alerts.length > 0) {
    elements.alertSection.style.display = 'block';
    elements.alertText.textContent = alerts.join('，') + ' - 现在是最佳使用时机！';
  } else {
    elements.alertSection.style.display = 'none';
  }
}

// 格式化时间
function formatTime(minutes) {
  if (minutes === 0) {
    return '即将重置';
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
      elements.serverChanKey.value = config.serverChanKey || '';
      elements.notifyThreshold.value = config.notifyThreshold || 60;
      elements.enableNotifications.checked = config.enableNotifications !== false;
      elements.enableAutoRefresh.checked = config.enableAutoRefresh !== false;
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
    const config = {
      serverChanKey: elements.serverChanKey.value.trim(),
      notifyThreshold: parseInt(elements.notifyThreshold.value) || 60,
      enableNotifications: elements.enableNotifications.checked,
      enableAutoRefresh: elements.enableAutoRefresh.checked,
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
