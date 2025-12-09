// Web App - 从 Firebase 读取并显示用量数据

console.log('Claude 用量监控 Web 应用已启动');

// 全局变量
let firebaseUrl = '';
let refreshInterval = null;
let isAutoRefresh = true;

// DOM 元素
const elements = {
  configPrompt: document.getElementById('configPrompt'),
  usageDisplay: document.getElementById('usageDisplay'),
  firebaseUrlInput: document.getElementById('firebaseUrlInput'),
  saveUrlBtn: document.getElementById('saveUrlBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  alertCard: document.getElementById('alertCard'),
  alertMessage: document.getElementById('alertMessage'),
  currentSessionValue: document.getElementById('currentSessionValue'),
  currentSessionBar: document.getElementById('currentSessionBar'),
  weeklyValue: document.getElementById('weeklyValue'),
  weeklyBar: document.getElementById('weeklyBar'),
  weeklyReset: document.getElementById('weeklyReset'),
  fiveHourValue: document.getElementById('fiveHourValue'),
  fiveHourBar: document.getElementById('fiveHourBar'),
  fiveHourReset: document.getElementById('fiveHourReset'),
  lastSync: document.getElementById('lastSync'),
  autoRefresh: document.getElementById('autoRefresh')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadFirebaseUrl();
  setupEventListeners();
});

// 加载 Firebase URL
function loadFirebaseUrl() {
  const savedUrl = localStorage.getItem('firebaseUrl');
  if (savedUrl) {
    firebaseUrl = savedUrl;
    elements.configPrompt.style.display = 'none';
    elements.usageDisplay.style.display = 'block';
    startFetching();
  }
}

// 设置事件监听
function setupEventListeners() {
  // 保存 Firebase URL
  elements.saveUrlBtn.addEventListener('click', () => {
    const url = elements.firebaseUrlInput.value.trim();
    console.log('输入的 URL:', url);
    console.log('URL 长度:', url.length);

    if (!url) {
      alert('请输入 Firebase Database URL');
      return;
    }

    // 验证 URL 必须以 https:// 开头
    if (!url.startsWith('https://')) {
      alert('URL 必须以 https:// 开头\n\n您输入的 URL:\n' + url);
      return;
    }

    // 验证 URL 格式（支持新旧版本的 Firebase URL）
    if (!url.includes('firebaseio.com') && !url.includes('firebase.io') && !url.includes('firebasedatabase.app')) {
      alert('请输入有效的 Firebase Database URL\n\n必须包含以下之一：\n- firebasedatabase.app\n- firebaseio.com\n- firebase.io\n\n您输入的 URL:\n' + url);
      return;
    }

    // 验证 URL 长度（完整的 URL 应该至少有 50 个字符）
    if (url.length < 50) {
      alert('URL 似乎不完整（长度：' + url.length + ' 字符）\n\n完整的 URL 示例：\nhttps://your-project-default-rtdb.asia-southeast1.firebasedatabase.app\n\n您输入的 URL:\n' + url);
      return;
    }

    firebaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    localStorage.setItem('firebaseUrl', firebaseUrl);
    console.log('保存的 Firebase URL:', firebaseUrl);

    elements.configPrompt.style.display = 'none';
    elements.usageDisplay.style.display = 'block';
    startFetching();
  });

  // 自动刷新开关
  elements.autoRefresh.addEventListener('change', (e) => {
    isAutoRefresh = e.target.checked;
    if (isAutoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
}

// 开始获取数据
function startFetching() {
  fetchUsageData();
  startAutoRefresh();
}

// 从 Firebase 获取数据
async function fetchUsageData() {
  try {
    updateStatus('loading', '获取数据中...');

    const response = await fetch(`${firebaseUrl}/usage.json`);

    if (!response.ok) {
      throw new Error('获取数据失败');
    }

    const data = await response.json();

    if (data && data.timestamp) {
      displayUsageData(data);
      updateStatus('connected', '已连接');
      updateLastSync(data.syncTime || data.timestamp);
    } else {
      updateStatus('error', '暂无数据');
      console.log('Firebase 中暂无数据，请先在电脑上访问 claude.ai/settings/usage');
    }
  } catch (error) {
    console.error('获取数据失败:', error);
    updateStatus('error', '连接失败');
  }
}

// 显示用量数据
function displayUsageData(data) {
  console.log('显示数据:', data);

  // 当前会话
  const currentPercent = data.currentSession?.percentage || 0;
  elements.currentSessionValue.textContent = `${currentPercent}%`;
  elements.currentSessionBar.style.width = `${currentPercent}%`;
  updateBarColor(elements.currentSessionBar, currentPercent);

  // 每周限制
  const weeklyPercent = data.weeklyLimits?.percentage || 0;
  const weeklyResetMin = data.weeklyLimits?.resetMinutes || 0;
  elements.weeklyValue.textContent = `${weeklyPercent}%`;
  elements.weeklyBar.style.width = `${weeklyPercent}%`;
  elements.weeklyReset.textContent = formatTime(weeklyResetMin);
  updateBarColor(elements.weeklyBar, weeklyPercent);

  // 5小时限制
  const fiveHourPercent = data.fiveHourLimit?.percentage || 0;
  const fiveHourResetMin = data.fiveHourLimit?.resetMinutes || 0;
  elements.fiveHourValue.textContent = `${fiveHourPercent}%`;
  elements.fiveHourBar.style.width = `${fiveHourPercent}%`;
  elements.fiveHourReset.textContent = formatTime(fiveHourResetMin);
  updateBarColor(elements.fiveHourBar, fiveHourPercent);

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
    elements.alertCard.style.display = 'flex';
    elements.alertMessage.textContent = alerts.join('，');
  } else {
    elements.alertCard.style.display = 'none';
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

// 更新状态
function updateStatus(status, text) {
  elements.statusText.textContent = text;
  elements.statusDot.className = 'status-dot';
  if (status === 'connected') {
    elements.statusDot.classList.add('connected');
  } else if (status === 'error') {
    elements.statusDot.classList.add('error');
  }
}

// 更新最后同步时间
function updateLastSync(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    elements.lastSync.textContent = '刚刚';
  } else if (minutes < 60) {
    elements.lastSync.textContent = `${minutes} 分钟前`;
  } else {
    const hours = Math.floor(minutes / 60);
    elements.lastSync.textContent = `${hours} 小时前`;
  }
}

// 启动自动刷新
function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(() => {
    if (isAutoRefresh) {
      fetchUsageData();
    }
  }, 30000); // 30秒刷新一次
}

// 停止自动刷新
function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// 页面可见性变化处理
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else if (isAutoRefresh) {
    fetchUsageData();
    startAutoRefresh();
  }
});

console.log('应用初始化完成');
